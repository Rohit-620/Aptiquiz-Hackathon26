/**
 * AptiQuiz In-Memory Real-Time Room & Game Manager
 * Handles lobby, synchronized questions, countdowns, power-ups, comeback meter, and persistence
 */

const { calculateScore } = require('./scoringService');
const antiCheatService = require('./antiCheatService');
const db = require('../db');

class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomCode -> Room Object
    this.playerTokens = new Map(); // sessionToken -> { roomCode, nickname, collegeId }
  }

  generateRoomCode() {
    let code;
    do {
      code = Math.random().toString(36).substring(2, 8).toUpperCase();
    } while (this.rooms.has(code));
    return code;
  }

  createRoom({ hostSocketId, questionSetId = 1, mode = 'standard', powerupsEnabled = false, roundDuration = 15 }) {
    const roomCode = this.generateRoomCode();
    const room = {
      roomCode,
      hostSocketId,
      questionSetId: Number(questionSetId),
      mode,
      powerupsEnabled: Boolean(powerupsEnabled),
      roundDuration: Number(roundDuration) || 15,
      status: 'lobby', // 'lobby' | 'countdown' | 'question' | 'reveal' | 'finished'
      players: new Map(), // socketId -> Player
      spectators: new Set(),
      questions: [],
      currentQuestionIndex: -1,
      questionStartTime: 0,
      questionDeadline: 0,
      roundTimer: null,
      questionInsights: {},
      previousLeaderboard: [],
      createdAt: Date.now()
    };

    this.rooms.set(roomCode, room);
    console.log(`[ROOM CREATED] Code: ${roomCode} | Mode: ${mode} | Round Duration: ${room.roundDuration}s`);
    return room;
  }

  getRoom(roomCode) {
    if (!roomCode) return null;
    return this.rooms.get(roomCode.toUpperCase());
  }

  joinRoom({ roomCode, socketId, nickname, collegeId, collegeName = '', teamName = '', isSpectator = false, sessionToken = null }) {
    const room = this.getRoom(roomCode);
    if (!room) {
      return { success: false, error: 'Room not found. Check the room code and try again.' };
    }

    if (room.status !== 'lobby' && !isSpectator) {
      // Check if this is a reconnecting player
      const existingPlayer = Array.from(room.players.values()).find(p => p.nickname.toLowerCase() === nickname.toLowerCase());
      if (!existingPlayer) {
        return { success: false, error: 'Game is already in progress and player was not in this match.' };
      }
    }

    if (isSpectator) {
      room.spectators.add(socketId);
      return { success: true, isSpectator: true, room };
    }

    // Capacity limit
    if (room.players.size >= 50) {
      return { success: false, error: 'Room is at maximum capacity (50 players).' };
    }

    // Check if player is reconnecting
    let player = Array.from(room.players.values()).find(p => p.nickname.toLowerCase() === nickname.toLowerCase());
    
    if (player) {
      // Reconnection: update socket ID and online status
      room.players.delete(player.socketId);
      player.socketId = socketId;
      player.isOnline = true;
      room.players.set(socketId, player);
      console.log(`[PLAYER RECONNECTED] ${nickname} in Room: ${roomCode}`);
    } else {
      // New player
      const token = sessionToken || `token_${Math.random().toString(36).substring(2)}_${Date.now()}`;
      player = {
        socketId,
        sessionToken: token,
        nickname,
        collegeId: Number(collegeId) || null,
        collegeName,
        teamName: teamName || 'Solo',
        score: 0,
        correctAnswersCount: 0,
        totalAnswersCount: 0,
        totalTimeMs: 0,
        hasAnsweredCurrentQuestion: false,
        chosenOption: null,
        isOnline: true,
        powerupsRemaining: {
          fiftyFifty: true,
          doublePoints: true
        },
        eliminatedOptions: []
      };
      room.players.set(socketId, player);
      this.playerTokens.set(token, { roomCode, nickname, collegeId });
    }

    return { success: true, player, room };
  }

  removePlayer(socketId) {
    for (const room of this.rooms.values()) {
      if (room.spectators.has(socketId)) {
        room.spectators.delete(socketId);
        return { room, wasSpectator: true };
      }
      if (room.players.has(socketId)) {
        const player = room.players.get(socketId);
        player.isOnline = false;
        // In lobby, remove immediately. In active game, keep for reconnection grace period.
        if (room.status === 'lobby') {
          room.players.delete(socketId);
        }
        return { room, player };
      }
    }
    return null;
  }

  async loadQuestionsForRoom(room) {
    const questions = await db.query(
      'SELECT * FROM questions WHERE question_set_id = ? ORDER BY id ASC',
      [room.questionSetId]
    );
    room.questions = questions.length > 0 ? questions : db.memoryStore.questions;
    return room.questions;
  }

  submitAnswer({ roomCode, socketId, questionIndex, chosenOption, powerup = null }) {
    const room = this.getRoom(roomCode);
    if (!room || room.status !== 'question') {
      return { success: false, error: 'Question is not currently active.' };
    }

    const player = room.players.get(socketId);
    if (!player) {
      return { success: false, error: 'Player not recognized in this room.' };
    }

    const serverReceiveTime = Date.now();
    const validation = antiCheatService.validateSubmission({
      room,
      player,
      currentQuestionIndex: room.currentQuestionIndex,
      questionIndexSubmitted: questionIndex,
      serverDeadline: room.questionDeadline,
      serverReceiveTime
    });

    if (!validation.valid) {
      return { success: false, error: validation.reason };
    }

    const currentQ = room.questions[room.currentQuestionIndex];
    const isCorrect = (chosenOption.toUpperCase() === currentQ.correct_option.toUpperCase());
    const elapsedTimeMs = Math.max(0, serverReceiveTime - room.questionStartTime);

    // Process Power-ups if requested
    let appliedPowerup = null;
    if (powerup === 'double_points' && player.powerupsRemaining.doublePoints && room.powerupsEnabled) {
      appliedPowerup = 'double_points';
      player.powerupsRemaining.doublePoints = false;
    }

    const scoreResult = calculateScore({
      isCorrect,
      elapsedTimeMs,
      roundDurationSec: room.roundDuration,
      powerup: appliedPowerup
    });

    // Update player state
    player.hasAnsweredCurrentQuestion = true;
    player.chosenOption = chosenOption;
    player.score += scoreResult.points;
    player.totalAnswersCount += 1;
    player.totalTimeMs += elapsedTimeMs;
    if (isCorrect) {
      player.correctAnswersCount += 1;
    }

    // Update real-time insights for host & analytics
    const insights = room.questionInsights[room.currentQuestionIndex] || {
      optionCounts: { A: 0, B: 0, C: 0, D: 0 },
      correctCount: 0,
      totalResponses: 0,
      times: []
    };
    insights.optionCounts[chosenOption.toUpperCase()] = (insights.optionCounts[chosenOption.toUpperCase()] || 0) + 1;
    if (isCorrect) insights.correctCount += 1;
    insights.totalResponses += 1;
    insights.times.push(elapsedTimeMs);
    room.questionInsights[room.currentQuestionIndex] = insights;

    return {
      success: true,
      isCorrect,
      pointsAwarded: scoreResult.points,
      totalScore: player.score,
      bonusApplied: scoreResult.bonusApplied
    };
  }

  useFiftyFifty(roomCode, socketId) {
    const room = this.getRoom(roomCode);
    if (!room || room.status !== 'question' || !room.powerupsEnabled) {
      return { success: false, error: 'Power-up unavailable.' };
    }
    const player = room.players.get(socketId);
    if (!player || !player.powerupsRemaining.fiftyFifty) {
      return { success: false, error: '50:50 power-up already used or unavailable.' };
    }

    const currentQ = room.questions[room.currentQuestionIndex];
    const incorrectOptions = ['A', 'B', 'C', 'D'].filter(opt => opt !== currentQ.correct_option);
    // Randomly select 2 wrong options to eliminate
    const shuffled = incorrectOptions.sort(() => 0.5 - Math.random());
    const toEliminate = shuffled.slice(0, 2);

    player.powerupsRemaining.fiftyFifty = false;
    player.eliminatedOptions = toEliminate;

    return { success: true, eliminatedOptions: toEliminate };
  }

  getLeaderboard(roomCode) {
    const room = this.getRoom(roomCode);
    if (!room) return [];

    const activePlayers = Array.from(room.players.values()).map(p => ({
      nickname: p.nickname,
      collegeName: p.collegeName,
      teamName: p.teamName,
      score: p.score,
      correctCount: p.correctAnswersCount,
      totalCount: p.totalAnswersCount,
      accuracy: p.totalAnswersCount > 0 ? Math.round((p.correctCount / p.totalAnswersCount) * 100) : 0,
      avgSpeedMs: p.totalAnswersCount > 0 ? Math.round(p.totalTimeMs / p.totalAnswersCount) : 0,
      isOnline: p.isOnline
    }));

    // Sort by score descending, then by average speed ascending (tie breaker)
    activePlayers.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.avgSpeedMs - b.avgSpeedMs;
    });

    // Compute rank movement & comeback indicator
    const topScore = activePlayers.length > 0 ? activePlayers[0].score : 0;

    return activePlayers.map((p, index) => {
      const currentRank = index + 1;
      const prevPlayer = room.previousLeaderboard.find(prev => prev.nickname === p.nickname);
      const prevRank = prevPlayer ? prevPlayer.rank : currentRank;
      const rankDelta = prevRank - currentRank; // positive = climbed up

      const gapWithLeader = topScore - p.score;
      let comebackStatus = 'Stable';
      if (currentRank === 1) {
        comebackStatus = 'Leading the Pack 👑';
      } else if (rankDelta > 0) {
        comebackStatus = `Surging +${rankDelta} 🚀`;
      } else if (gapWithLeader <= 400 && gapWithLeader > 0) {
        comebackStatus = 'Closing the Gap ⚡';
      }

      return {
        ...p,
        rank: currentRank,
        rankDelta,
        gapWithLeader,
        comebackStatus
      };
    });
  }

  getTeamLeaderboard(roomCode) {
    const leaderboard = this.getLeaderboard(roomCode);
    const teams = {};

    leaderboard.forEach(p => {
      const team = p.teamName || 'Solo';
      if (!teams[team]) {
        teams[team] = {
          teamName: team,
          totalScore: 0,
          membersCount: 0,
          correctCount: 0
        };
      }
      teams[team].totalScore += p.score;
      teams[team].membersCount += 1;
      teams[team].correctCount += p.correctCount;
    });

    return Object.values(teams).sort((a, b) => b.totalScore - a.totalScore);
  }

  async persistGameResults(roomCode) {
    const room = this.getRoom(roomCode);
    if (!room) return;

    const leaderboard = this.getLeaderboard(roomCode);
    for (const player of leaderboard) {
      try {
        await db.query(
          `INSERT INTO game_results (room_id, nickname, college_id, final_score, final_rank, correct_count, total_questions, avg_speed_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            room.questionSetId,
            player.nickname,
            null, // college id
            player.score,
            player.rank,
            player.correctCount,
            room.questions.length,
            player.avgSpeedMs
          ]
        );
      } catch (err) {
        console.error(`[DB PERSISTENCE ERROR] For ${player.nickname}:`, err.message);
      }
    }
    console.log(`[RESULTS PERSISTED] Successfully stored results for room ${roomCode}`);
  }
}

module.exports = new RoomManager();
