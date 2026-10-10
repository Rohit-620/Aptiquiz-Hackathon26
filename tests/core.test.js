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

console.log('\n====================================================');
console.log('🎉 ALL UNIT TESTS PASSED (5/5 tests)!');
console.log('====================================================\n');
