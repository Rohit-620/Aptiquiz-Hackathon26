/**
 * AptiQuiz Automated Core Unit & Service Tests
 */

const assert = require('assert');
const { calculateScore, aggregateCollegeRankings } = require('../src/services/scoringService');
const antiCheatService = require('../src/services/antiCheatService');
const aiService = require('../src/services/aiService');

console.log('🧪 Running AptiQuiz Verification Test Suite...\n');

// 1. Test Scoring Formula
console.log('Test 1: Scoring Formula Verification');
const instantScore = calculateScore({ isCorrect: true, elapsedTimeMs: 0, roundDurationSec: 15 });
assert.strictEqual(instantScore.points, 1000, 'Instant correct answer should yield 1000 points');

const halfTimeScore = calculateScore({ isCorrect: true, elapsedTimeMs: 7500, roundDurationSec: 15 });
assert.strictEqual(halfTimeScore.points, 750, 'Half-time correct answer should yield 750 points');

const wrongScore = calculateScore({ isCorrect: false, elapsedTimeMs: 1000, roundDurationSec: 15 });
assert.strictEqual(wrongScore.points, 0, 'Incorrect answer must yield 0 points');

const doublePointsScore = calculateScore({ isCorrect: true, elapsedTimeMs: 0, roundDurationSec: 15, powerup: 'double_points' });
assert.strictEqual(doublePointsScore.points, 2000, 'Double points power-up should yield 2000 points');
console.log('✅ Scoring calculations match authoritative specification.');

// 2. Test Anti-Cheat Late Answer Protection
console.log('\nTest 2: Anti-Cheat Late Submission Rejection');
const validation = antiCheatService.validateSubmission({
  room: { roomCode: 'TEST01' },
  player: { nickname: 'Speedy', hasAnsweredCurrentQuestion: false },
  currentQuestionIndex: 0,
  questionIndexSubmitted: 0,
  serverDeadline: 10000,
  serverReceiveTime: 12000 // 2 seconds late
});
assert.strictEqual(validation.valid, false, 'Late submission must be rejected');
console.log('✅ Anti-cheat authoritative deadline enforcement verified.');

// 3. Test Anti-Cheat Duplicate Answer Protection
console.log('\nTest 3: Anti-Cheat Duplicate Submission Rejection');
const dupValidation = antiCheatService.validateSubmission({
  room: { roomCode: 'TEST01' },
  player: { nickname: 'DoubleClicker', hasAnsweredCurrentQuestion: true },
  currentQuestionIndex: 1,
  questionIndexSubmitted: 1,
  serverDeadline: 20000,
  serverReceiveTime: 15000
});
assert.strictEqual(dupValidation.valid, false, 'Duplicate submission in same round must be rejected');
console.log('✅ Anti-cheat duplicate answer protection verified.');

// 4. Test College Ranking Aggregator
console.log('\nTest 4: College League Standings Aggregator');
const mockColleges = [
  { id: 1, name: 'IIT Bombay', code: 'IITB' },
  { id: 2, name: 'IIT Delhi', code: 'IITD' }
];
const mockResults = [
  { college_id: 1, final_score: 5000, correct_count: 5, total_questions: 5 },
  { college_id: 1, final_score: 4000, correct_count: 4, total_questions: 5 },
  { college_id: 2, final_score: 3000, correct_count: 3, total_questions: 5 }
];
const rankings = aggregateCollegeRankings(mockResults, mockColleges);
assert.strictEqual(rankings.length, 2);
assert.strictEqual(rankings[0].code, 'IITB', 'IIT Bombay should rank #1 with higher composite rating');
console.log('✅ College league mathematical aggregation verified.');

// 5. Test AI Question Quality Validator
console.log('\nTest 5: AI Quality Validator');
const goodQ = {
  prompt: 'What is 15% of 200?',
  option_a: '20',
  option_b: '30',
  option_c: '40',
  option_d: '50',
  correct_option: 'B'
};
const quality = aiService.validateQuestionQuality(goodQ);
assert.strictEqual(quality.isValid, true, 'Valid question should pass QA check');
console.log('✅ AI Question Quality Validator verified.');

// 6. Test Practice Service Multi-Round Adaptive System
const practiceService = require('../src/services/practiceService');

(async () => {
  console.log('\nTest 6: Practice Session Initialization & Strict Lock Protection');
  const session = await practiceService.createSession({ nickname: 'AptiMaster', collegeId: 1, collegeName: 'IIT Bombay' });
  assert.strictEqual(session.maxSessionQuestions, 10, 'Session must enforce max 10 questions limit');
  assert.strictEqual(session.rounds[1].isUnlocked, true, 'Round 1 must be unlocked initially');
  assert.strictEqual(session.rounds[2].isUnlocked, false, 'Round 2 must be locked initially');
  assert.strictEqual(session.rounds[3].isUnlocked, false, 'Round 3 must be locked initially');
  assert.strictEqual(session.bonus.isUnlocked, false, 'Bonus question must be strictly locked initially');

  // Verify locked round access rejection
  const lockedR2 = await practiceService.getOrStartRound(session.sessionId, 2);
  assert.strictEqual(lockedR2.success, false, 'Direct access to locked Round 2 must be blocked');

  const lockedBonus = await practiceService.getBonusQuestion(session.sessionId);
  assert.strictEqual(lockedBonus.success, false, 'Direct access to locked Bonus question must be blocked');
  console.log('✅ Strict round-lock protection and direct access rejection verified.');

  console.log('\nTest 7: Round Failure Scenario (Score < 2/3 Keeps Next Round Locked)');
  const r1Start = await practiceService.getOrStartRound(session.sessionId, 1);
  assert.strictEqual(r1Start.success, true);
  assert.strictEqual(r1Start.questions.length, 3, 'Each round must have exactly 3 questions');

  // Deliberately fail round 1 (0/3 correct)
  const failAnswers = r1Start.questions.map(q => ({ questionId: q.id, chosenOption: 'Z' }));
  const r1FailResult = await practiceService.submitRoundAnswers(session.sessionId, 1, failAnswers);
  assert.strictEqual(r1FailResult.passed, false, 'Score 0/3 must be marked NOT CLEARED');
  assert.strictEqual(r1FailResult.nextRoundUnlocked, false, 'Next round must NOT unlock on failure');

  const stillLockedR2 = await practiceService.getOrStartRound(session.sessionId, 2);
  assert.strictEqual(stillLockedR2.success, false, 'Round 2 must remain locked after failing Round 1');
  console.log('✅ Failure scenario verified: Round 2 remains locked when score is < 2/3.');

  console.log('\nTest 8: Full Success Path (Pass R1 -> Pass R2 -> Pass R3 -> Unlock Bonus Q10)');
  const passSession = await practiceService.createSession({ nickname: 'PassMaster' });
  const allQs = await practiceService.getAllQuestions();

  // Round 1 - Pass with 3/3
  const r1 = await practiceService.getOrStartRound(passSession.sessionId, 1);
  const r1Answers = r1.questions.map(q => {
    const orig = allQs.find(item => item.id === q.id);
    return { questionId: q.id, chosenOption: orig.correct_option };
  });
  const r1Res = await practiceService.submitRoundAnswers(passSession.sessionId, 1, r1Answers);
  assert.strictEqual(r1Res.passed, true, 'Round 1 should be CLEARED');
  assert.strictEqual(r1Res.nextRoundUnlocked, true, 'Round 2 must be unlocked');

  // Round 2 - Pass with 2/3
  const r2 = await practiceService.getOrStartRound(passSession.sessionId, 2);
  assert.strictEqual(r2.success, true);
  const r2Answers = r2.questions.map((q, idx) => {
    const orig = allQs.find(item => item.id === q.id);
    return { questionId: q.id, chosenOption: idx === 0 ? 'Z' : orig.correct_option }; // 2/3 correct
  });
  const r2Res = await practiceService.submitRoundAnswers(passSession.sessionId, 2, r2Answers);
  assert.strictEqual(r2Res.passed, true, 'Round 2 should be CLEARED with 2/3');
  assert.strictEqual(r2Res.nextRoundUnlocked, true, 'Round 3 must be unlocked');

  // Round 3 - Pass with 3/3
  const r3 = await practiceService.getOrStartRound(passSession.sessionId, 3);
  assert.strictEqual(r3.success, true);
  const r3Answers = r3.questions.map(q => {
    const orig = allQs.find(item => item.id === q.id);
    return { questionId: q.id, chosenOption: orig.correct_option };
  });
  const r3Res = await practiceService.submitRoundAnswers(passSession.sessionId, 3, r3Answers);
  assert.strictEqual(r3Res.passed, true, 'Round 3 should be CLEARED');
  assert.strictEqual(r3Res.bonusUnlocked, true, 'Bonus question must now be unlocked');

  // Access Bonus Question (Question 10)
  const bonusQ = await practiceService.getBonusQuestion(passSession.sessionId);
  assert.strictEqual(bonusQ.success, true, 'Bonus Question 10 must be accessible');
  assert.strictEqual(bonusQ.questionNumber, 10, 'Bonus question is question 10');

  // Submit Bonus Answer
  const bonusOrig = allQs.find(item => item.id === bonusQ.question.id);
  const bonusRes = await practiceService.submitBonusAnswer(passSession.sessionId, bonusOrig.correct_option);
  assert.strictEqual(bonusRes.success, true);
  assert.strictEqual(bonusRes.isCorrect, true);
  assert.strictEqual(bonusRes.summary.totalQuestionsAttempted, 10, 'Session must conclude at exactly 10 questions');
  assert.strictEqual(bonusRes.summary.allRoundsCleared, true);
  console.log('✅ Complete progressive path verified: Passed R1 -> Passed R2 -> Passed R3 -> Cleared Bonus Q10 (10/10 questions total).');

  console.log('\nTest 9: 10-Question Hard Session Limit Cap');
  // Attempting to request any more questions after 10 questions must fail
  const overLimit = await practiceService.getOrStartRound(passSession.sessionId, 1);
  assert.strictEqual(overLimit.success, false, 'Attempting over 10 questions in a session must be blocked');
  console.log('✅ Hard session limit of 10 questions strictly enforced.');

  console.log('\n====================================================');
  console.log('🎉 ALL UNIT & INTEGRATION TESTS PASSED (9/9 tests)!');
  console.log('====================================================\n');
})();
