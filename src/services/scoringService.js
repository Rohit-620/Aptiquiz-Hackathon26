/**
 * AptiQuiz Server-Authoritative Scoring Engine
 * 
 * Formula:
 * Correct Answer: Points = 500 + 500 * (1 - elapsedTime / roundDuration)
 * Incorrect / Unanswered / Late: Points = 0
 */

function calculateScore({ isCorrect, elapsedTimeMs, roundDurationSec, powerup = null }) {
  if (!isCorrect) {
    return { points: 0, bonusApplied: null };
  }

  const roundDurationMs = (roundDurationSec || 15) * 1000;
  // Clamped elapsed time
  const clampedTimeMs = Math.max(0, Math.min(elapsedTimeMs, roundDurationMs));
  const timeRatio = clampedTimeMs / roundDurationMs;
  
  // Base points: 500 base + up to 500 speed bonus
  let points = Math.round(500 + 500 * (1 - timeRatio));

  // Apply power-up modifiers on server
  let bonusApplied = null;
  if (powerup === 'double_points') {
    points *= 2;
    bonusApplied = 'Double Points (2x)';
  }

  return { points, bonusApplied };
}

/**
 * Calculates college leaderboard standings from verified match records
 * Formula: College Score = Average Score * Log(Participants + 1) * Accuracy Bonus
 */
function aggregateCollegeRankings(gameResults = [], colleges = []) {
  const collegeMap = {};

  colleges.forEach(c => {
    collegeMap[c.id] = {
      id: c.id,
      name: c.name,
      code: c.code,
      totalScore: 0,
      totalPlayers: 0,
      correctCount: 0,
      totalQuestions: 0
    };
  });

  gameResults.forEach(res => {
    const cId = res.college_id;
    if (cId && collegeMap[cId]) {
      collegeMap[cId].totalScore += res.final_score;
      collegeMap[cId].totalPlayers += 1;
      collegeMap[cId].correctCount += (res.correct_count || 0);
      collegeMap[cId].totalQuestions += (res.total_questions || 8);
    }
  });

  const rankedList = Object.values(collegeMap)
    .filter(c => c.totalPlayers > 0)
    .map(c => {
      const avgScore = Math.round(c.totalScore / c.totalPlayers);
      const accuracy = c.totalQuestions > 0 ? Math.round((c.correctCount / c.totalQuestions) * 100) : 0;
      // Formula: Composite rating = avgScore + (totalPlayers * 50) + (accuracy * 10)
      const compositeRating = avgScore + (c.totalPlayers * 50) + (accuracy * 10);
      return {
        ...c,
        avgScore,
        accuracy,
        compositeRating
      };
    })
    .sort((a, b) => b.compositeRating - a.compositeRating);

  return rankedList;
}

module.exports = {
  calculateScore,
  aggregateCollegeRankings
};
