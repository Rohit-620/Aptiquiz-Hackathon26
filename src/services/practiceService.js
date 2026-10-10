/**
 * AptiQuiz Practice Session Service
 * Multi-Round Adaptive Practice System with strict round unlocking
 * 
 * Rules:
 * - 10 questions maximum per session
 * - 3 rounds of 3 questions each (9 questions total)
 * - 1 bonus/challenge question (Question 10) after all 3 rounds are cleared
 * - Round 1: Medium difficulty
 * - Round 2: Difficult ('hard') difficulty
 * - Round 3: Very Difficult ('very_difficult') difficulty
 * - Bonus: Very Difficult or Expert ('very_difficult' or 'expert') difficulty
 * - Pass criteria: At least 2 out of 3 questions correct in a round (>= 66.67%)
 * - Bonus question unlocked ONLY after Round 1, 2, and 3 are cleared
 * - Duplicate question prevention across session
 * - Server-side authoritative validation and locked-round protection
 */

const db = require('../db');
const { v4: uuidv4 } = require('uuid');

// In-memory sessions store (can also be saved to DB/memoryStore)
const sessions = new Map();

class PracticeService {
  /**
   * Helper to normalize difficulty naming
   */
  normalizeDifficulty(level) {
    if (level === 'easy') return 'easy';
    if (level === 'medium') return 'medium';
    if (level === 'difficult' || level === 'hard') return 'hard';
    if (level === 'very_difficult' || level === 'very difficult' || level === 'expert') return 'very_difficult';
    return level;
  }

  /**
   * Get all available practice questions from DB / memoryStore
   */
  async getAllQuestions() {
    try {
      const qs = await db.query('SELECT * FROM questions');
      if (qs && qs.length > 0) return qs;
    } catch (e) {
      console.warn('[PracticeService] DB query failed, falling back to memoryStore:', e.message);
    }
    return db.memoryStore.questions || [];
  }

  /**
   * Start a new practice session for a student
   */
  async createSession({ nickname, collegeId, collegeName }) {
    const sessionId = uuidv4();
    const session = {
      sessionId,
      nickname: (nickname || 'Student').trim(),
      collegeId: collegeId ? Number(collegeId) : null,
      collegeName: collegeName || '',
      createdAt: new Date(),
      status: 'active', // 'active' | 'completed' | 'abandoned'
      
      // Strict tracking per round
      rounds: {
        1: {
          roundNumber: 1,
          name: 'Round 1 – Medium',
          difficulty: 'medium',
          targetCount: 3,
          isUnlocked: true,
          status: 'not_started', // 'not_started' | 'in_progress' | 'cleared' | 'failed'
          score: 0,
          attemptsCount: 0,
          questionIds: [],
          submissions: []
        },
        2: {
          roundNumber: 2,
          name: 'Round 2 – Difficult',
          difficulty: 'hard',
          targetCount: 3,
          isUnlocked: false,
          status: 'locked',
          score: 0,
          attemptsCount: 0,
          questionIds: [],
          submissions: []
        },
        3: {
          roundNumber: 3,
          name: 'Round 3 – Very Difficult',
          difficulty: 'very_difficult',
          targetCount: 3,
          isUnlocked: false,
          status: 'locked',
          score: 0,
          attemptsCount: 0,
          questionIds: [],
          submissions: []
        }
      },

      // Bonus question tracking
      bonus: {
        isUnlocked: false,
        status: 'locked', // 'locked' | 'available' | 'in_progress' | 'completed'
        questionId: null,
        submission: null
      },

      // Global session constraints
      totalQuestionsAttempted: 0,
      totalCorrectAnswers: 0,
      maxSessionQuestions: 10,
      assignedQuestionIds: new Set()
    };

    sessions.set(sessionId, session);
    return this.sanitizeSessionView(session);
  }

  /**
   * Get session by ID
   */
  getSession(sessionId) {
    if (!sessionId) return null;
    return sessions.get(sessionId) || null;
  }

  /**
   * Pick non-duplicate questions matching desired difficulty
   */
  async pickQuestions({ difficulty, count, excludeIds = [] }) {
    const allQuestions = await this.getAllQuestions();
    
    // Normalize target difficulty
    const targetDiff = this.normalizeDifficulty(difficulty);

    // Filter matching difficulty
    let pool = allQuestions.filter(q => {
      const qDiff = this.normalizeDifficulty(q.difficulty);
      const isMatch = (qDiff === targetDiff);
      return isMatch && !excludeIds.includes(q.id);
    });

    // Fallback if pool is too small: pick questions without duplicate constraint
    if (pool.length < count) {
      pool = allQuestions.filter(q => this.normalizeDifficulty(q.difficulty) === targetDiff);
    }

    // Secondary fallback: if still insufficient, pick from nearest difficulty
    if (pool.length < count) {
      pool = allQuestions.filter(q => !excludeIds.includes(q.id));
    }

    // Shuffle pool
    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }

  /**
   * Start or retrieve questions for a specific round
   */
  async getOrStartRound(sessionId, roundNumber) {
    const session = this.getSession(sessionId);
    if (!session) {
      return { success: false, error: 'Practice session not found.' };
    }

    roundNumber = Number(roundNumber);
    if (![1, 2, 3].includes(roundNumber)) {
      return { success: false, error: 'Invalid round number. Practice has rounds 1, 2, and 3.' };
    }

    const round = session.rounds[roundNumber];

    // Strict validation: Round must be unlocked!
    if (!round.isUnlocked) {
      return { 
        success: false, 
        error: `Round ${roundNumber} is locked. You must clear the previous round with at least 2/3 correct first.` 
      };
    }

    // Check if session question limit reached
    if (session.totalQuestionsAttempted >= session.maxSessionQuestions) {
      return {
        success: false,
        error: `Maximum session question limit reached (${session.maxSessionQuestions} questions).`
      };
    }

    // If round questions haven't been assigned yet, assign 3 questions
    if (!round.questionIds || round.questionIds.length === 0) {
      const picked = await this.pickQuestions({
        difficulty: round.difficulty,
        count: 3,
        excludeIds: Array.from(session.assignedQuestionIds)
      });

      if (!picked || picked.length === 0) {
        return { success: false, error: 'Question bank has insufficient questions for this difficulty.' };
      }

      round.questionIds = picked.map(q => q.id);
      picked.forEach(q => session.assignedQuestionIds.add(q.id));
      round.status = 'in_progress';
      round.attemptsCount += 1;
      round.submissions = [];
      round.score = 0;
    }

    // Retrieve questions details (sanitized: hide correct option and explanation)
    const allQuestions = await this.getAllQuestions();
    const roundQuestions = round.questionIds.map((qId, idx) => {
      const raw = allQuestions.find(q => q.id === qId);
      if (!raw) return null;
      return {
        id: raw.id,
        roundNumber,
        questionIndexInRound: idx + 1,
        prompt: raw.prompt,
        topic: raw.topic || 'Aptitude',
        difficulty: raw.difficulty,
        time_limit_sec: raw.time_limit_sec || 30,
        options: [
          { key: 'A', text: raw.option_a },
          { key: 'B', text: raw.option_b },
          { key: 'C', text: raw.option_c },
          { key: 'D', text: raw.option_d }
        ]
      };
    }).filter(Boolean);

    return {
      success: true,
      roundNumber,
      roundName: round.name,
      difficulty: round.difficulty,
      targetCount: 3,
      attemptsCount: round.attemptsCount,
      questions: roundQuestions,
      sessionStatus: this.sanitizeSessionView(session)
    };
  }

  /**
   * Submit answers for an entire round or single question in a round
   * Accepts answers array: [{ questionId, chosenOption }]
   */
  async submitRoundAnswers(sessionId, roundNumber, answers) {
    const session = this.getSession(sessionId);
    if (!session) {
      return { success: false, error: 'Practice session not found.' };
    }

    roundNumber = Number(roundNumber);
    const round = session.rounds[roundNumber];
    if (!round) {
      return { success: false, error: 'Invalid round number.' };
    }

    if (!round.isUnlocked) {
      return { success: false, error: `Round ${roundNumber} is locked.` };
    }

    if (!Array.isArray(answers) || answers.length === 0) {
      return { success: false, error: 'No answers provided for evaluation.' };
    }

    // Check question cap enforcement
    const questionsRemaining = session.maxSessionQuestions - session.totalQuestionsAttempted;
    if (questionsRemaining <= 0) {
      return { success: false, error: 'Session question limit (10) reached.' };
    }

    const allQuestions = await this.getAllQuestions();
    const evaluatedQuestions = [];
    let correctCount = 0;

    answers.forEach(ans => {
      const q = allQuestions.find(item => item.id === Number(ans.questionId));
      if (!q) return;

      const chosen = (ans.chosenOption || '').toUpperCase();
      const isCorrect = chosen === q.correct_option.toUpperCase();
      if (isCorrect) correctCount++;

      evaluatedQuestions.push({
        questionId: q.id,
        prompt: q.prompt,
        topic: q.topic,
        difficulty: q.difficulty,
        chosenOption: chosen,
        correctOption: q.correct_option,
        isCorrect,
        explanation: q.explanation || 'Solution verified.',
        options: {
          A: q.option_a,
          B: q.option_b,
          C: q.option_c,
          D: q.option_d
        }
      });
    });

    // Update round state
    round.score = correctCount;
    round.submissions = evaluatedQuestions;
    session.totalQuestionsAttempted += evaluatedQuestions.length;
    session.totalCorrectAnswers += correctCount;

    // Strict Pass/Fail criteria: Must answer at least 2 out of 3 questions correctly
    const passed = (correctCount >= 2);

    if (passed) {
      round.status = 'cleared';
      // Unlock next round if exists
      if (roundNumber === 1) {
        session.rounds[2].isUnlocked = true;
        session.rounds[2].status = 'not_started';
      } else if (roundNumber === 2) {
        session.rounds[3].isUnlocked = true;
        session.rounds[3].status = 'not_started';
      } else if (roundNumber === 3) {
        // Round 3 cleared! Unlock bonus question if all 3 cleared
        if (
          session.rounds[1].status === 'cleared' &&
          session.rounds[2].status === 'cleared' &&
          session.rounds[3].status === 'cleared'
        ) {
          session.bonus.isUnlocked = true;
          session.bonus.status = 'available';
        }
      }
    } else {
      round.status = 'failed';
      // Do NOT unlock next round! Keep it locked
      if (roundNumber < 3) {
        session.rounds[roundNumber + 1].isUnlocked = false;
        session.rounds[roundNumber + 1].status = 'locked';
      }
    }

    // Check if session completed (e.g. all cleared + bonus done, or hit 10 questions limit, or failed without retry)
    const allRoundsCleared = [1, 2, 3].every(r => session.rounds[r].status === 'cleared');
    const isBonusDone = session.bonus.status === 'completed';

    if (allRoundsCleared && isBonusDone) {
      session.status = 'completed';
      await this.saveSessionResult(session);
    } else if (session.totalQuestionsAttempted >= session.maxSessionQuestions) {
      session.status = 'completed';
      await this.saveSessionResult(session);
    }

    return {
      success: true,
      roundNumber,
      roundName: round.name,
      score: `${correctCount}/3`,
      scoreRaw: correctCount,
      targetCount: 3,
      passed,
      status: round.status,
      nextRoundUnlocked: passed && roundNumber < 3,
      nextRoundNumber: passed && roundNumber < 3 ? roundNumber + 1 : null,
      bonusUnlocked: session.bonus.isUnlocked,
      evaluatedQuestions,
      canRetry: !passed && (session.totalQuestionsAttempted < session.maxSessionQuestions),
      session: this.sanitizeSessionView(session)
    };
  }

  /**
   * Retry a failed round
   */
  async retryRound(sessionId, roundNumber) {
    const session = this.getSession(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found.' };
    }

    roundNumber = Number(roundNumber);
    const round = session.rounds[roundNumber];
    if (!round) {
      return { success: false, error: 'Invalid round number.' };
    }

    if (session.totalQuestionsAttempted >= session.maxSessionQuestions) {
      return { success: false, error: 'Session question limit (10 questions) reached. Cannot retry.' };
    }

    // When retrying the round in the same session, roll back previous failed submissions count for this round
    // so the student can re-attempt the 3 questions of this round without prematurely exceeding the 10-question cap
    if (round.submissions && round.submissions.length > 0) {
      session.totalQuestionsAttempted = Math.max(0, session.totalQuestionsAttempted - round.submissions.length);
      session.totalCorrectAnswers = Math.max(0, session.totalCorrectAnswers - round.score);
    }

    // Reset round questions to assign fresh set if available
    round.questionIds = [];
    round.status = 'not_started';
    round.submissions = [];
    round.score = 0;

    return this.getOrStartRound(sessionId, roundNumber);
  }

  /**
   * Get the Final Bonus Question (Question 10)
   * Accessible ONLY after Rounds 1, 2, and 3 are CLEARED!
   */
  async getBonusQuestion(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found.' };
    }

    // Strict validation: All 3 rounds must be CLEARED
    const r1 = session.rounds[1].status === 'cleared';
    const r2 = session.rounds[2].status === 'cleared';
    const r3 = session.rounds[3].status === 'cleared';

    if (!r1 || !r2 || !r3) {
      return {
        success: false,
        error: 'Bonus question is strictly locked! You must clear Round 1, Round 2, and Round 3 first.'
      };
    }

    if (session.totalQuestionsAttempted >= session.maxSessionQuestions) {
      return {
        success: false,
        error: `Session limit (${session.maxSessionQuestions} questions) reached.`
      };
    }

    // Pick 1 very difficult/expert question
    if (!session.bonus.questionId) {
      const picked = await this.pickQuestions({
        difficulty: 'very_difficult',
        count: 1,
        excludeIds: Array.from(session.assignedQuestionIds)
      });

      if (!picked || picked.length === 0) {
        return { success: false, error: 'No bonus question available in question bank.' };
      }

      session.bonus.questionId = picked[0].id;
      session.assignedQuestionIds.add(picked[0].id);
      session.bonus.status = 'in_progress';
    }

    const allQuestions = await this.getAllQuestions();
    const raw = allQuestions.find(q => q.id === session.bonus.questionId);
    if (!raw) {
      return { success: false, error: 'Bonus question not found.' };
    }

    return {
      success: true,
      isBonus: true,
      questionNumber: 10,
      totalSessionQuestions: 10,
      question: {
        id: raw.id,
        prompt: raw.prompt,
        topic: raw.topic || 'Advanced Aptitude',
        difficulty: raw.difficulty,
        time_limit_sec: raw.time_limit_sec || 30,
        options: [
          { key: 'A', text: raw.option_a },
          { key: 'B', text: raw.option_b },
          { key: 'C', text: raw.option_c },
          { key: 'D', text: raw.option_d }
        ]
      },
      session: this.sanitizeSessionView(session)
    };
  }

  /**
   * Submit Bonus Question Answer
   */
  async submitBonusAnswer(sessionId, chosenOption) {
    const session = this.getSession(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found.' };
    }

    if (!session.bonus.isUnlocked || !session.bonus.questionId) {
      return { success: false, error: 'Bonus question is not unlocked or active.' };
    }

    const allQuestions = await this.getAllQuestions();
    const raw = allQuestions.find(q => q.id === session.bonus.questionId);
    if (!raw) {
      return { success: false, error: 'Bonus question data missing.' };
    }

    const chosen = (chosenOption || '').toUpperCase();
    const isCorrect = chosen === raw.correct_option.toUpperCase();

    session.bonus.submission = {
      questionId: raw.id,
      prompt: raw.prompt,
      topic: raw.topic,
      difficulty: raw.difficulty,
      chosenOption: chosen,
      correctOption: raw.correct_option,
      isCorrect,
      explanation: raw.explanation || 'Verified solution.'
    };

    session.bonus.status = 'completed';
    session.totalQuestionsAttempted += 1;
    if (isCorrect) {
      session.totalCorrectAnswers += 1;
    }
    session.status = 'completed';

    await this.saveSessionResult(session);

    return {
      success: true,
      isCorrect,
      chosenOption: chosen,
      correctOption: raw.correct_option,
      explanation: raw.explanation,
      session: this.sanitizeSessionView(session),
      summary: this.getSummary(sessionId)
    };
  }

  /**
   * Get Overall Performance Summary for the Practice Session
   */
  getSummary(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) return null;

    const roundsClearedCount = [1, 2, 3].filter(r => session.rounds[r].status === 'cleared').length;
    const accuracy = session.totalQuestionsAttempted > 0
      ? Math.round((session.totalCorrectAnswers / session.totalQuestionsAttempted) * 100)
      : 0;

    return {
      sessionId: session.sessionId,
      nickname: session.nickname,
      collegeName: session.collegeName,
      status: session.status,
      totalQuestionsAttempted: session.totalQuestionsAttempted,
      maxSessionQuestions: session.maxSessionQuestions,
      totalCorrectAnswers: session.totalCorrectAnswers,
      accuracyPercentage: accuracy,
      roundsCleared: roundsClearedCount,
      roundsTotal: 3,
      allRoundsCleared: roundsClearedCount === 3,
      bonusUnlocked: session.bonus.isUnlocked,
      bonusAttempted: Boolean(session.bonus.submission),
      bonusResult: session.bonus.submission ? (session.bonus.submission.isCorrect ? 'Correct' : 'Incorrect') : 'Not Attempted',
      roundDetails: [
        {
          roundNumber: 1,
          name: session.rounds[1].name,
          difficulty: session.rounds[1].difficulty,
          status: session.rounds[1].status,
          score: `${session.rounds[1].score}/3`,
          passed: session.rounds[1].status === 'cleared'
        },
        {
          roundNumber: 2,
          name: session.rounds[2].name,
          difficulty: session.rounds[2].difficulty,
          status: session.rounds[2].status,
          score: `${session.rounds[2].score}/3`,
          passed: session.rounds[2].status === 'cleared'
        },
        {
          roundNumber: 3,
          name: session.rounds[3].name,
          difficulty: session.rounds[3].difficulty,
          status: session.rounds[3].status,
          score: `${session.rounds[3].score}/3`,
          passed: session.rounds[3].status === 'cleared'
        }
      ]
    };
  }

  /**
   * Persist final practice session results into database/memoryStore
   */
  async saveSessionResult(session) {
    try {
      const summary = this.getSummary(session.sessionId);
      const points = (session.totalCorrectAnswers * 500) + (summary.roundsCleared * 1000) + (session.bonus.submission?.isCorrect ? 1500 : 0);

      await db.query(
        `INSERT INTO game_results (room_id, player_id, nickname, college_id, final_score, final_rank, correct_count, total_questions, avg_speed_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          0,
          null,
          session.nickname,
          session.collegeId || null,
          points,
          1,
          session.totalCorrectAnswers,
          session.totalQuestionsAttempted,
          1800
        ]
      );
    } catch (err) {
      console.warn('[PracticeService] Persistence note:', err.message);
    }
  }

  /**
   * Sanitize session object for client-side consumption
   */
  sanitizeSessionView(session) {
    const roundsClearedCount = [1, 2, 3].filter(r => session.rounds[r].status === 'cleared').length;
    const accuracy = session.totalQuestionsAttempted > 0
      ? Math.round((session.totalCorrectAnswers / session.totalQuestionsAttempted) * 100)
      : 0;

    return {
      sessionId: session.sessionId,
      nickname: session.nickname,
      collegeName: session.collegeName,
      status: session.status,
      totalQuestionsAttempted: session.totalQuestionsAttempted,
      totalCorrectAnswers: session.totalCorrectAnswers,
      maxSessionQuestions: session.maxSessionQuestions,
      accuracyPercentage: accuracy,
      roundsCleared: roundsClearedCount,
      rounds: {
        1: {
          roundNumber: 1,
          name: session.rounds[1].name,
          difficulty: session.rounds[1].difficulty,
          isUnlocked: session.rounds[1].isUnlocked,
          status: session.rounds[1].status,
          score: `${session.rounds[1].score}/3`,
          attemptsCount: session.rounds[1].attemptsCount
        },
        2: {
          roundNumber: 2,
          name: session.rounds[2].name,
          difficulty: session.rounds[2].difficulty,
          isUnlocked: session.rounds[2].isUnlocked,
          status: session.rounds[2].status,
          score: `${session.rounds[2].score}/3`,
          attemptsCount: session.rounds[2].attemptsCount
        },
        3: {
          roundNumber: 3,
          name: session.rounds[3].name,
          difficulty: session.rounds[3].difficulty,
          isUnlocked: session.rounds[3].isUnlocked,
          status: session.rounds[3].status,
          score: `${session.rounds[3].score}/3`,
          attemptsCount: session.rounds[3].attemptsCount
        }
      },
      bonus: {
        isUnlocked: session.bonus.isUnlocked,
        status: session.bonus.status
      }
    };
  }
}

module.exports = new PracticeService();
