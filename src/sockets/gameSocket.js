/**
 * AptiQuiz Socket.IO Event Handlers
 * Real-Time Multiplayer Quiz Flow
 */

const roomManager = require('../services/roomManager');
const antiCheatService = require('../services/antiCheatService');

function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`[SOCKET CONNECTED] ID: ${socket.id}`);

    // 1. Host creates a room
    socket.on('room:create', async (data = {}, callback) => {
      try {
        const { questionSetId = 1, mode = 'standard', powerupsEnabled = false, roundDuration = 15 } = data;
        const room = roomManager.createRoom({
          hostSocketId: socket.id,
          questionSetId,
          mode,
          powerupsEnabled,
          roundDuration
        });

        socket.join(room.roomCode);

        const response = {
          success: true,
          roomCode: room.roomCode,
          mode: room.mode,
          powerupsEnabled: room.powerupsEnabled,
          roundDuration: room.roundDuration
        };

        if (typeof callback === 'function') callback(response);
        socket.emit('room:created', response);
      } catch (err) {
        console.error('[ROOM CREATE ERROR]', err.message);
        if (typeof callback === 'function') callback({ success: false, error: err.message });
      }
    });

    // 2. Player or Spectator joins room
    socket.on('room:join', (data = {}, callback) => {
      try {
        const { roomCode, nickname, collegeId, collegeName, teamName, isSpectator, sessionToken } = data;

        if (!roomCode || (!nickname && !isSpectator)) {
          const errRes = { success: false, error: 'Room code and nickname are required.' };
          if (typeof callback === 'function') callback(errRes);
          return socket.emit('game:error', errRes);
        }

        const result = roomManager.joinRoom({
          roomCode: roomCode.trim().toUpperCase(),
          socketId: socket.id,
          nickname: nickname ? nickname.trim() : 'Spectator',
          collegeId,
          collegeName,
          teamName,
          isSpectator: Boolean(isSpectator),
          sessionToken
        });

        if (!result.success) {
          if (typeof callback === 'function') callback(result);
          return socket.emit('game:error', result);
        }

        const room = result.room;
        socket.join(room.roomCode);

        const joinPayload = {
          success: true,
          roomCode: room.roomCode,
          isSpectator: Boolean(isSpectator),
          player: result.player || null,
          status: room.status,
          currentQuestionIndex: room.currentQuestionIndex,
          players: Array.from(room.players.values()).map(p => ({
            nickname: p.nickname,
            collegeName: p.collegeName,
            teamName: p.teamName,
            score: p.score,
            isOnline: p.isOnline
          }))
        };

        if (typeof callback === 'function') callback(joinPayload);
        socket.emit('room:joined', joinPayload);

        // Broadcast updated lobby/player list to everyone in the room
        io.to(room.roomCode).emit('room:playerJoined', {
          nickname: result.player ? result.player.nickname : 'Spectator',
          playersCount: room.players.size,
          players: Array.from(room.players.values()).map(p => ({
            nickname: p.nickname,
            collegeName: p.collegeName,
            teamName: p.teamName,
            score: p.score,
            isOnline: p.isOnline
          }))
        });
      } catch (err) {
        console.error('[ROOM JOIN ERROR]', err.message);
        if (typeof callback === 'function') callback({ success: false, error: err.message });
      }
    });

    // 3. Host starts game
    socket.on('game:start', async (data = {}, callback) => {
      try {
        const { roomCode } = data;
        const room = roomManager.getRoom(roomCode);

        if (!room) {
          return callback && callback({ success: false, error: 'Room not found.' });
        }

        if (room.hostSocketId !== socket.id) {
          return callback && callback({ success: false, error: 'Unauthorized: Only the host can start the game.' });
        }

        if (room.players.size === 0) {
          return callback && callback({ success: false, error: 'Cannot start game without players.' });
        }

        // Load questions
        await roomManager.loadQuestionsForRoom(room);
        room.status = 'countdown';

        if (typeof callback === 'function') callback({ success: true });

        // Broadcast 3-second countdown
        io.to(room.roomCode).emit('game:startingCountdown', { countdownSec: 3 });

        setTimeout(() => {
          room.currentQuestionIndex = -1;
          broadcastNextQuestion(io, room);
        }, 3000);

      } catch (err) {
        console.error('[GAME START ERROR]', err.message);
        if (typeof callback === 'function') callback({ success: false, error: err.message });
      }
    });

    // 4. Submit Answer
    socket.on('answer:submit', (data = {}, callback) => {
      try {
        const { roomCode, questionIndex, chosenOption, powerup } = data;
        const result = roomManager.submitAnswer({
          roomCode,
          socketId: socket.id,
          questionIndex: Number(questionIndex),
          chosenOption,
          powerup
        });

        if (typeof callback === 'function') callback(result);
        socket.emit('answer:result', result);

        // Check if all active players have submitted
        const room = roomManager.getRoom(roomCode);
        if (room && room.status === 'question') {
          const activePlayers = Array.from(room.players.values()).filter(p => p.isOnline);
          const allAnswered = activePlayers.length > 0 && activePlayers.every(p => p.hasAnsweredCurrentQuestion);
          if (allAnswered) {
            // End question early if everyone has answered
            clearTimeout(room.roundTimer);
            revealQuestionResults(io, room);
          }
        }
      } catch (err) {
        console.error('[ANSWER SUBMIT ERROR]', err.message);
        if (typeof callback === 'function') callback({ success: false, error: err.message });
      }
    });

    // 5. Use 50:50 Power-up
    socket.on('powerup:fiftyFifty', (data = {}, callback) => {
      const { roomCode } = data;
      const res = roomManager.useFiftyFifty(roomCode, socket.id);
      if (typeof callback === 'function') callback(res);
      socket.emit('powerup:result', res);
    });

    // 6. Handle Disconnect
    socket.on('disconnect', () => {
      const removed = roomManager.removePlayer(socket.id);
      if (removed && removed.room) {
        const { room, player } = removed;
        if (player) {
          io.to(room.roomCode).emit('room:playerLeft', {
            nickname: player.nickname,
            playersCount: room.players.size,
            players: Array.from(room.players.values()).map(p => ({
              nickname: p.nickname,
              collegeName: p.collegeName,
              score: p.score,
              isOnline: p.isOnline
            }))
          });
        }
      }
    });
  });
}

/**
 * Synchronized broadcast of next question with authoritative timer
 */
function broadcastNextQuestion(io, room) {
  room.currentQuestionIndex += 1;

  if (room.currentQuestionIndex >= room.questions.length) {
    // Game completed!
    finishGame(io, room);
    return;
  }

  const currentQ = room.questions[room.currentQuestionIndex];
  // Sanitize question for clients (hide correct option & explanation)
  const sanitized = antiCheatService.scrambleOptions(currentQ);

  // Reset player answered states for this question
  room.players.forEach(p => {
    p.hasAnsweredCurrentQuestion = false;
    p.chosenOption = null;
    p.eliminatedOptions = [];
  });

  room.status = 'question';
  room.questionStartTime = Date.now();
  room.questionDeadline = room.questionStartTime + (room.roundDuration * 1000);

  io.to(room.roomCode).emit('question:start', {
    questionIndex: room.currentQuestionIndex,
    totalQuestions: room.questions.length,
    question: sanitized,
    timeLimitSec: room.roundDuration,
    deadlineTimestamp: room.questionDeadline
  });

  // Authoritative server timer for the round
  room.roundTimer = setTimeout(() => {
    revealQuestionResults(io, room);
  }, room.roundDuration * 1000);
}

/**
 * Reveal correct answer, round insights, and update live leaderboard
 */
function revealQuestionResults(io, room) {
  room.status = 'reveal';
  const currentQ = room.questions[room.currentQuestionIndex];

  // Capture current leaderboard for comeback indicators
  const updatedLeaderboard = roomManager.getLeaderboard(room.roomCode);
  const teamLeaderboard = room.mode === 'team' ? roomManager.getTeamLeaderboard(room.roomCode) : null;
  const insights = room.questionInsights[room.currentQuestionIndex] || {
    optionCounts: { A: 0, B: 0, C: 0, D: 0 },
    correctCount: 0,
    totalResponses: 0
  };

  io.to(room.roomCode).emit('question:reveal', {
    questionIndex: room.currentQuestionIndex,
    correctOption: currentQ.correct_option,
    explanation: currentQ.explanation,
    insights,
    leaderboard: updatedLeaderboard,
    teamLeaderboard
  });

  // Update room's previous leaderboard snapshot
  room.previousLeaderboard = updatedLeaderboard;

  // Wait 4 seconds for players to digest results, then launch next question
  setTimeout(() => {
    broadcastNextQuestion(io, room);
  }, 4000);
}

/**
 * Finish match, persist to database, announce winner
 */
async function finishGame(io, room) {
  room.status = 'finished';
  const finalLeaderboard = roomManager.getLeaderboard(room.roomCode);
  const finalTeamLeaderboard = room.mode === 'team' ? roomManager.getTeamLeaderboard(room.roomCode) : null;
  const winner = finalLeaderboard.length > 0 ? finalLeaderboard[0] : null;

  // Persist to MySQL / Store
  await roomManager.persistGameResults(room.roomCode);

  io.to(room.roomCode).emit('game:finished', {
    winner,
    finalLeaderboard,
    finalTeamLeaderboard,
    totalQuestions: room.questions.length
  });
}

module.exports = {
  registerSocketHandlers
};
