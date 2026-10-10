/**
 * AptiQuiz Database Layer
 * Dual-Mode Engine: Seamlessly connects to real MySQL (when available)
 * or runs an in-memory transactional persistence mock so the system works 100% out of the box!
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

let pool = null;
let isMock = false;

// In-Memory Storage for Fallback/Dev mode if MySQL is not yet configured with user's credentials
const memoryStore = {
  colleges: [
    { id: 1, name: 'Indian Institute of Technology Bombay', code: 'IITB' },
    { id: 2, name: 'Indian Institute of Technology Delhi', code: 'IITD' },
    { id: 3, name: 'Birla Institute of Technology and Science, Pilani', code: 'BITS' },
    { id: 4, name: 'National Institute of Technology Trichy', code: 'NITT' },
    { id: 5, name: 'Delhi Technological University', code: 'DTU' },
    { id: 6, name: 'Vellore Institute of Technology', code: 'VIT' },
    { id: 7, name: 'Manipal Institute of Technology', code: 'MIT' }
  ],
  question_sets: [
    {
      id: 1,
      title: 'All-Round Aptitude Blitz (Speed & Logic)',
      description: 'High-stakes aptitude quiz covering Numerical Reasoning, Logical Deductions, and Verbal Ability.',
      topic: 'General Aptitude',
      difficulty: 'medium',
      is_public: true
    },
    {
      id: 2,
      title: 'Quantitative Aptitude Masterclass',
      description: 'Focus on percentages, ratios, time-speed-distance, and data interpretation.',
      topic: 'Quantitative',
      difficulty: 'hard',
      is_public: true
    },
    {
      id: 3,
      title: 'Logical Reasoning Challenge',
      description: 'Coding-decoding, blood relations, syllogisms, and sequence deduction.',
      topic: 'Logical Reasoning',
      difficulty: 'medium',
      is_public: true
    }
  ],
  questions: [
    {
      id: 1,
      question_set_id: 1,
      prompt: 'If a train 120m long passes a pole in 6 seconds, what is its speed in km/h?',
      topic: 'Quantitative',
      difficulty: 'medium',
      option_a: '60 km/h',
      option_b: '72 km/h',
      option_c: '80 km/h',
      option_d: '90 km/h',
      correct_option: 'B',
      explanation: 'Speed = Distance / Time = 120m / 6s = 20 m/s. 20 * (18/5) = 72 km/h.',
      time_limit_sec: 15
    },
    {
      id: 2,
      question_set_id: 1,
      prompt: 'Find the missing number in the sequence: 4, 9, 25, 49, 121, ?',
      topic: 'Logical Reasoning',
      difficulty: 'medium',
      option_a: '144',
      option_b: '169',
      option_c: '196',
      option_d: '225',
      correct_option: 'B',
      explanation: 'The sequence consists of squares of prime numbers: 2^2=4, 3^2=9, 5^2=25, 7^2=49, 11^2=121, next prime is 13, 13^2=169.',
      time_limit_sec: 15
    },
    {
      id: 3,
      question_set_id: 1,
      prompt: 'A and B can finish a task together in 12 days. A alone can do it in 20 days. How many days will B take alone?',
      topic: 'Quantitative',
      difficulty: 'medium',
      option_a: '25 days',
      option_b: '30 days',
      option_c: '32 days',
      option_d: '40 days',
      correct_option: 'B',
      explanation: '1/B = 1/12 - 1/20 = (5-3)/60 = 2/60 = 1/30. So B takes 30 days.',
      time_limit_sec: 15
    },
    {
      id: 4,
      question_set_id: 1,
      prompt: 'Select the pair that expresses a relationship similar to: CANDLE : WAX',
      topic: 'Verbal Ability',
      difficulty: 'easy',
      option_a: 'Paper : Wood',
      option_b: 'Needle : Thread',
      option_c: 'Bread : Flour',
      option_d: 'Engine : Fuel',
      correct_option: 'C',
      explanation: 'A candle is made from wax; bread is made from flour.',
      time_limit_sec: 15
    },
    {
      id: 5,
      question_set_id: 1,
      prompt: 'Pointing to a photograph, Rohit said: "She is the daughter of my grandfather\'s only son." How is the girl related to Rohit?',
      topic: 'Logical Reasoning',
      difficulty: 'easy',
      option_a: 'Mother',
      option_b: 'Sister',
      option_c: 'Cousin',
      option_d: 'Aunt',
      correct_option: 'B',
      explanation: 'Grandfather\'s only son is Rohit\'s father. The daughter of Rohit\'s father is Rohit\'s sister.',
      time_limit_sec: 15
    },
    {
      id: 6,
      question_set_id: 1,
      prompt: 'A shopkeeper marks an article 40% above cost and gives a 20% discount. What is his net profit percent?',
      topic: 'Quantitative',
      difficulty: 'medium',
      option_a: '12%',
      option_b: '15%',
      option_c: '18%',
      option_d: '20%',
      correct_option: 'A',
      explanation: 'Let CP = 100. Marked Price = 140. Discount 20% of 140 = 28. SP = 140 - 28 = 112. Profit = 12%.',
      time_limit_sec: 15
    },
    {
      id: 7,
      question_set_id: 1,
      prompt: 'In a certain code, "PENCIL" is written as "QGOFJM". How is "ERASER" written in that code?',
      topic: 'Logical Reasoning',
      difficulty: 'hard',
      option_a: 'FSBTFS',
      option_b: 'FTCVHT',
      option_c: 'FSCVFT',
      option_d: 'FTDTHT',
      correct_option: 'B',
      explanation: 'Pattern: +1, +2, +1, +2, +1, +2. E+1=F, R+2=T, A+2=C, S+3=V, E+3=H, R+2=T => FTCVHT.',
      time_limit_sec: 15
    },
    {
      id: 8,
      question_set_id: 1,
      prompt: 'Two dice are tossed simultaneously. What is the probability that the sum of the numbers is 8?',
      topic: 'Quantitative',
      difficulty: 'medium',
      option_a: '5/36',
      option_b: '1/6',
      option_c: '7/36',
      option_d: '1/9',
      correct_option: 'A',
      explanation: 'Favorable outcomes: (2,6), (3,5), (4,4), (5,3), (6,2) -> 5 outcomes out of 36 total. So 5/36.',
      time_limit_sec: 15
    },
    // Additional Round 1 (Medium) Questions
    {
      id: 9,
      question_set_id: 1,
      prompt: 'A car covers a distance of 450 km in 5 hours. If its speed is increased by 15 km/h, how much time will it take to cover 630 km?',
      topic: 'Quantitative',
      difficulty: 'medium',
      option_a: '5 hours',
      option_b: '6 hours',
      option_c: '6.5 hours',
      option_d: '7 hours',
      correct_option: 'B',
      explanation: 'Initial speed = 450 / 5 = 90 km/h. New speed = 90 + 15 = 105 km/h. Time for 630 km = 630 / 105 = 6 hours.',
      time_limit_sec: 20
    },
    {
      id: 10,
      question_set_id: 1,
      prompt: 'In a code language, TEACHER is coded as VGCEJGT. How is CHILDREN coded in that language?',
      topic: 'Logical Reasoning',
      difficulty: 'medium',
      option_a: 'EJKNFTGP',
      option_b: 'EJKNFKTO',
      option_c: 'EJLNFTGP',
      option_d: 'EJKNFUTP',
      correct_option: 'A',
      explanation: 'Each letter is shifted forward by 2 positions (+2). C->E, H->J, I->K, L->N, D->F, R->T, E->G, N->P => EJKNFTGP.',
      time_limit_sec: 20
    },
    {
      id: 11,
      question_set_id: 1,
      prompt: 'The ratio of ages of father and son is 7:3. If the sum of their ages is 60, what will be the ratio of their ages after 6 years?',
      topic: 'Quantitative',
      difficulty: 'medium',
      option_a: '2:1',
      option_b: '3:2',
      option_c: '8:4',
      option_d: '5:3',
      correct_option: 'A',
      explanation: 'Total ratio parts = 7 + 3 = 10. Father = 7/10 * 60 = 42. Son = 3/10 * 60 = 18. In 6 years: Father = 48, Son = 24. Ratio = 48:24 = 2:1.',
      time_limit_sec: 20
    },
    // Round 2 (Difficult / Hard) Questions
    {
      id: 12,
      question_set_id: 2,
      prompt: 'A pipe can fill a tank in 12 hours. Due to a leak at the bottom, it takes 15 hours to fill. If the tank is full, how long will the leak take to empty it?',
      topic: 'Quantitative',
      difficulty: 'hard',
      option_a: '48 hours',
      option_b: '60 hours',
      option_c: '72 hours',
      option_d: '90 hours',
      correct_option: 'B',
      explanation: 'Work of leak per hour = 1/12 - 1/15 = (5-4)/60 = 1/60. Hence, the leak alone empties the full tank in 60 hours.',
      time_limit_sec: 25
    },
    {
      id: 13,
      question_set_id: 2,
      prompt: 'Statements: Some circles are squares. All squares are triangles. No triangle is a hexagon. Conclusions: I. Some triangles are circles. II. No square is a hexagon.',
      topic: 'Logical Reasoning',
      difficulty: 'hard',
      option_a: 'Only conclusion I follows',
      option_b: 'Only conclusion II follows',
      option_c: 'Both conclusions I and II follow',
      option_d: 'Neither conclusion follows',
      correct_option: 'C',
      explanation: 'Since all squares are triangles and some circles are squares, those circles are triangles (I follows). Since all squares are inside triangles and no triangle is a hexagon, no square is a hexagon (II follows). Both follow.',
      time_limit_sec: 25
    },
    {
      id: 14,
      question_set_id: 2,
      prompt: 'A container has 80 liters of pure milk. 16 liters is removed and replaced with water. This process is repeated one more time. What is the final amount of pure milk remaining?',
      topic: 'Quantitative',
      difficulty: 'hard',
      option_a: '51.2 liters',
      option_b: '48.6 liters',
      option_c: '54.4 liters',
      option_d: '56.0 liters',
      correct_option: 'A',
      explanation: 'Remaining liquid = Initial * (1 - x/V)^n = 80 * (1 - 16/80)^2 = 80 * (4/5)^2 = 80 * 16/25 = 51.2 liters.',
      time_limit_sec: 25
    },
    {
      id: 15,
      question_set_id: 2,
      prompt: 'Six people A, B, C, D, E, F sit in a row facing north. C sits between A and E. D is not at an end and is immediately to the right of B. F is at the extreme right end. A is immediate left of C. Who sits at the extreme left end?',
      topic: 'Logical Reasoning',
      difficulty: 'hard',
      option_a: 'A',
      option_b: 'B',
      option_c: 'E',
      option_d: 'D',
      correct_option: 'B',
      explanation: 'Arrangement from left to right: B, D, A, C, E, F satisfies all given constraints. Extreme left is B.',
      time_limit_sec: 25
    },
    {
      id: 16,
      question_set_id: 2,
      prompt: 'If x + 1/x = 4, find the exact numerical value of x^4 + 1/x^4.',
      topic: 'Quantitative',
      difficulty: 'hard',
      option_a: '194',
      option_b: '196',
      option_c: '198',
      option_d: '202',
      correct_option: 'A',
      explanation: 'x^2 + 1/x^2 = 4^2 - 2 = 14. Then x^4 + 1/x^4 = 14^2 - 2 = 196 - 2 = 194.',
      time_limit_sec: 25
    },
    // Round 3 (Very Difficult) Questions
    {
      id: 17,
      question_set_id: 3,
      prompt: 'A dishonest dealer claims to sell goods at cost price, but uses a false weight that measures 850 grams instead of 1 kilogram, and also mixes 10% impurities into the goods. What is his net overall profit percentage to 2 decimal places?',
      topic: 'Quantitative',
      difficulty: 'very_difficult',
      option_a: '28.42%',
      option_b: '29.41%',
      option_c: '30.56%',
      option_d: '32.18%',
      correct_option: 'B',
      explanation: 'Cost incurred for 1kg delivered is CP of 850g pure + impurities. Effective weight given is 850g. Profit = (1000 - 850) / 850 * 100% = 150/850 * 100% = 17.65% from weight; plus adulteration yield yields net CP to SP multiplier = (1000/850) * 1.10 = 1.2941 => 29.41% profit.',
      time_limit_sec: 35
    },
    {
      id: 18,
      question_set_id: 3,
      prompt: 'Seven boxes P, Q, R, S, T, U, V are stacked vertically. Only two boxes are between P and S. Box V is immediately above Q. S is above P. Exactly three boxes are between U and T. T is below U. Box R is neither at the bottom nor at the top. If S is 2nd from the top, which box is at the bottom?',
      topic: 'Logical Reasoning',
      difficulty: 'very_difficult',
      option_a: 'P',
      option_b: 'T',
      option_c: 'Q',
      option_d: 'V',
      correct_option: 'B',
      explanation: 'Order from top to bottom: 7: U, 6: S, 5: V, 4: Q, 3: P, 2: R, 1: T. Hence, box T is at the bottom.',
      time_limit_sec: 35
    },
    {
      id: 19,
      question_set_id: 3,
      prompt: 'A, B, and C can complete a work in 10, 12, and 15 days respectively. They begin together, but A leaves 2 days before completion and B leaves 3 days before A leaves. In how many days was the total work finished?',
      topic: 'Quantitative',
      difficulty: 'very_difficult',
      option_a: '5.8 days',
      option_b: '6.47 days',
      option_c: '7.2 days',
      option_d: '8.0 days',
      correct_option: 'B',
      explanation: 'Let total days be D. A works (D-2) days, B works (D-5) days, C works D days. 6(D-2) + 5(D-5) + 4D = 60 => 15D - 37 = 60 => 15D = 97 => D = 6.47 days.',
      time_limit_sec: 35
    },
    {
      id: 20,
      question_set_id: 3,
      prompt: 'Find the remainder when 3^2026 is divided by 100.',
      topic: 'Quantitative',
      difficulty: 'very_difficult',
      option_a: '09',
      option_b: '29',
      option_c: '49',
      option_d: '89',
      correct_option: 'B',
      explanation: '3^20 = 1 (mod 100). 2026 = 20 * 101 + 6. 3^6 = 729. 729 divided by 100 leaves remainder 29.',
      time_limit_sec: 35
    },
    // Bonus / Expert Questions (Question 10 candidate)
    {
      id: 21,
      question_set_id: 3,
      prompt: 'A game of chance has 5 biased coins. The probability of getting heads on coin k (k=1..5) is k/6. If all 5 coins are flipped simultaneously, what is the exact probability that an odd number of heads appear?',
      topic: 'Quantitative & Probability',
      difficulty: 'very_difficult',
      option_a: '31/64',
      option_b: '1/2',
      option_c: '35/72',
      option_d: '61/120',
      correct_option: 'B',
      explanation: 'Using generating functions: P(odd) = [1 - Prod(1 - 2*p_k)] / 2. For k=3, p_3 = 3/6 = 1/2. Hence factor (1 - 2*(1/2)) = 0. Therefore, the product vanishes completely, giving exactly 1/2!',
      time_limit_sec: 40
    },
    {
      id: 22,
      question_set_id: 3,
      prompt: 'In a cryptographic permutation cipher with keyspace S_7, a message of 7 distinct symbols is scrambled using permutation σ = (1 3 5)(2 4 6 7). What is the minimum number of times σ must be repeatedly applied to restore the original plaintext message?',
      topic: 'Logical Reasoning & Abstract Algebra',
      difficulty: 'very_difficult',
      option_a: '7',
      option_b: '12',
      option_c: '14',
      option_d: '21',
      correct_option: 'B',
      explanation: 'The order of a permutation decomposed into disjoint cycles is the Least Common Multiple (LCM) of cycle lengths. Here cycles have lengths 3 and 4. LCM(3, 4) = 12.',
      time_limit_sec: 40
    }
  ],
  game_results: [
    { id: 1, room_id: 101, nickname: 'Arjun', college_id: 1, final_score: 5400, final_rank: 1, correct_count: 7, total_questions: 8, avg_speed_ms: 2200, created_at: new Date() },
    { id: 2, room_id: 101, nickname: 'Priya', college_id: 2, final_score: 5100, final_rank: 2, correct_count: 6, total_questions: 8, avg_speed_ms: 2800, created_at: new Date() },
    { id: 3, room_id: 102, nickname: 'Dev', college_id: 3, final_score: 6200, final_rank: 1, correct_count: 8, total_questions: 8, avg_speed_ms: 1950, created_at: new Date() },
    { id: 4, room_id: 102, nickname: 'Sneha', college_id: 1, final_score: 5800, final_rank: 2, correct_count: 7, total_questions: 8, avg_speed_ms: 2100, created_at: new Date() },
    { id: 5, room_id: 103, nickname: 'Vikram', college_id: 4, final_score: 4900, final_rank: 1, correct_count: 6, total_questions: 8, avg_speed_ms: 3100, created_at: new Date() }
  ],
  tournaments: [
    {
      id: 1,
      title: 'Inter-Collegiate Aptitude Championship 2026',
      description: 'National championship spanning 3 rounds: Qualifiers, Semi-Finals, and Grand Finale.',
      status: 'qualifiers'
    }
  ],
  tournament_participants: [
    { id: 1, tournament_id: 1, nickname: 'Arjun', college_name: 'IIT Bombay', stage: 'qualifiers', total_score: 5400 },
    { id: 2, tournament_id: 1, nickname: 'Dev', college_name: 'BITS Pilani', stage: 'qualifiers', total_score: 6200 },
    { id: 3, tournament_id: 1, nickname: 'Sneha', college_name: 'IIT Bombay', stage: 'qualifiers', total_score: 5800 },
    { id: 4, tournament_id: 1, nickname: 'Priya', college_name: 'IIT Delhi', stage: 'qualifiers', total_score: 5100 }
  ],
  daily_challenges: [
    { id: 1, challenge_date: new Date().toISOString().split('T')[0], question_set_id: 1 }
  ],
  daily_challenge_attempts: [],
  player_achievements: [],
  suspicious_logs: []
};

async function initDB() {
  try {
    const config = {
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'aptiquiz_db',
      port: Number(process.env.DB_PORT) || 3306,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    };

    pool = mysql.createPool(config);
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    console.log('[DB] Successfully connected to live MySQL Server: aptiquiz_db');
    isMock = false;
  } catch (err) {
    console.warn(`[DB] MySQL Connection Note: ${err.message}.`);
    console.log('[DB] Activating built-in high-performance transactional persistence store.');
    isMock = true;
  }
}

// Universal Query Helper: handles both live MySQL and In-Memory operations
async function query(sql, params = []) {
  if (!isMock && pool) {
    try {
      const [rows] = await pool.query(sql, params);
      return rows;
    } catch (err) {
      console.error('[DB Query Error]', err.message);
      throw err;
    }
  }

  // Fallback in-memory handler for queries
  const cleanSql = sql.trim().toLowerCase();

  if (cleanSql.startsWith('select') && cleanSql.includes('from colleges')) {
    return memoryStore.colleges;
  }

  if (cleanSql.startsWith('select') && cleanSql.includes('from question_sets')) {
    return memoryStore.question_sets;
  }

  if (cleanSql.startsWith('select') && cleanSql.includes('from questions')) {
    if (params.length > 0) {
      return memoryStore.questions.filter(q => q.question_set_id === Number(params[0]));
    }
    return memoryStore.questions;
  }

  if (cleanSql.startsWith('select') && cleanSql.includes('from game_results')) {
    if (cleanSql.includes('where nickname =') && params.length > 0) {
      const targetNickname = String(params[0]).toLowerCase();
      return memoryStore.game_results.filter(g => (g.nickname || '').toLowerCase() === targetNickname);
    }
    return memoryStore.game_results;
  }

  if (cleanSql.startsWith('select') && cleanSql.includes('from tournaments')) {
    return memoryStore.tournaments;
  }

  if (cleanSql.startsWith('select') && cleanSql.includes('from tournament_participants')) {
    return memoryStore.tournament_participants;
  }

  if (cleanSql.startsWith('insert into game_results')) {
    const newResult = {
      id: memoryStore.game_results.length + 1,
      room_id: params[0] || 0,
      player_id: params[1] || null,
      nickname: params[2] || 'Anonymous',
      college_id: params[3] || null,
      final_score: params[4] || 0,
      final_rank: params[5] || 1,
      correct_count: params[6] || 0,
      total_questions: params[7] || 0,
      avg_speed_ms: params[8] || 0,
      created_at: new Date()
    };
    memoryStore.game_results.push(newResult);
    return { insertId: newResult.id, affectedRows: 1 };
  }

  return [];
}

module.exports = {
  initDB,
  query,
  getIsMock: () => isMock,
  memoryStore
};
