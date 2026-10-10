/**
 * AptiQuiz Anti-Cheat & Fair Play Validation Service
 */

class AntiCheatService {
  constructor() {
    this.suspiciousLogs = [];
  }

  logViolation(roomCode, nickname, eventType, details, ip = 'unknown') {
    const entry = {
      timestamp: new Date().toISOString(),
      roomCode,
      nickname,
      eventType,
      details,
      ip
    };
    this.suspiciousLogs.push(entry);
    console.warn(`[ANTI-CHEAT VIOLATION] Room: ${roomCode} | User: ${nickname} | Type: ${eventType} | ${details}`);
    return entry;
  }

  validateSubmission({
    room,
    player,
    currentQuestionIndex,
    questionIndexSubmitted,
    serverDeadline,
    serverReceiveTime
  }) {
    // 1. Verify player is part of the room
    if (!player) {
      return { valid: false, reason: 'Unregistered player' };
    }

    // 2. Prevent round replay / incorrect round ID
    if (questionIndexSubmitted !== currentQuestionIndex) {
      return { valid: false, reason: 'Round ID mismatch / stale question submission' };
    }

    // 3. Prevent duplicate answer in the same round
    if (player.hasAnsweredCurrentQuestion) {
      return { valid: false, reason: 'Duplicate answer rejected: round already submitted' };
    }

    // 4. Authoritative timing check: Reject late submissions
    // Allow up to 350ms network jitter grace period before strict rejection
    const latencyGracePeriodMs = 350;
    if (serverReceiveTime > (serverDeadline + latencyGracePeriodMs)) {
      this.logViolation(
        room.roomCode,
        player.nickname,
        'LATE_ANSWER_ATTEMPT',
        `Received ${serverReceiveTime - serverDeadline}ms after deadline`
      );
      return { valid: false, reason: 'Submission received after authoritative deadline' };
    }

    return { valid: true };
  }

  /**
   * Shuffle options while keeping correct answer mapping secure on the server
   */
  scrambleOptions(question) {
    const options = [
      { key: 'A', text: question.option_a },
      { key: 'B', text: question.option_b },
      { key: 'C', text: question.option_c },
      { key: 'D', text: question.option_d }
    ];

    // Client view should NOT include correct_option or explanation
    return {
      id: question.id,
      prompt: question.prompt,
      topic: question.topic,
      difficulty: question.difficulty,
      options: options.map(o => ({ key: o.key, text: o.text })),
      timeLimitSec: question.time_limit_sec || 15
    };
  }
}

module.exports = new AntiCheatService();
