/**
 * AptiQuiz REST API Routes
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const QRCode = require('qrcode');
const { aggregateCollegeRankings } = require('../services/scoringService');
const aiService = require('../services/aiService');
const roomManager = require('../services/roomManager');

const os = require('os');

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// QR Code Generator for mobile join
router.get('/qrcode/:roomCode', async (req, res) => {
  try {
    const { roomCode } = req.params;
    const port = process.env.PORT || 3000;
    const localIp = getLocalIpAddress();
    
    // Check if client is using localhost or external IP
    let host = req.get('host');
    if (host.includes('localhost') || host.includes('127.0.0.1')) {
      // For mobile scanner to work, replace localhost with PC's actual Wi-Fi IP address!
      host = `${localIp}:${port}`;
    }

    const joinUrl = `http://${host}/?room=${encodeURIComponent(roomCode.toUpperCase())}`;
    const qrDataUrl = await QRCode.toDataURL(joinUrl, {
      width: 250,
      margin: 2,
      color: {
        dark: '#00f2fe',
        light: '#0b0f19'
      }
    });
    res.json({ success: true, qrDataUrl, joinUrl, localIp });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 1. Colleges List
router.get('/colleges', async (req, res) => {
  try {
    const colleges = await db.query('SELECT * FROM colleges ORDER BY name ASC');
    res.json({ success: true, colleges });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Question Sets List
router.get('/question-sets', async (req, res) => {
  try {
    const sets = await db.query('SELECT * FROM question_sets WHERE is_public = TRUE');
    res.json({ success: true, questionSets: sets });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. College League Rankings
router.get('/leaderboard/colleges', async (req, res) => {
  try {
    const colleges = await db.query('SELECT * FROM colleges');
    const results = await db.query('SELECT * FROM game_results');
    const rankings = aggregateCollegeRankings(results, colleges);
    res.json({ success: true, rankings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Student Skill Passport
router.get('/passport/:nickname', async (req, res) => {
  try {
    const { nickname } = req.params;
    const history = await db.query(
      'SELECT * FROM game_results WHERE nickname = ? ORDER BY created_at DESC LIMIT 10',
      [nickname]
    );

    const totalGames = history.length;
    const totalScore = history.reduce((sum, h) => sum + h.final_score, 0);
    const bestScore = history.reduce((max, h) => Math.max(max, h.final_score), 0);
    const avgAccuracy = totalGames > 0
      ? Math.round(history.reduce((sum, h) => sum + (h.correct_count / (h.total_questions || 8) * 100), 0) / totalGames)
      : 0;

    res.json({
      success: true,
      passport: {
        nickname,
        totalGames,
        totalScore,
        bestScore,
        avgAccuracy,
        recentGames: history
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Daily Challenge Endpoint
router.get('/daily-challenge', async (req, res) => {
  try {
    const questions = await db.query('SELECT * FROM questions WHERE question_set_id = 1 LIMIT 5');
    res.json({
      success: true,
      challenge: {
        date: new Date().toISOString().split('T')[0],
        title: 'Daily Aptitude Sprint',
        questionsCount: questions.length,
        questions: questions.map(q => ({
          id: q.id,
          prompt: q.prompt,
          topic: q.topic,
          options: [
            { key: 'A', text: q.option_a },
            { key: 'B', text: q.option_b },
            { key: 'C', text: q.option_c },
            { key: 'D', text: q.option_d }
          ]
        }))
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Submit Daily Challenge Attempt
router.post('/daily-challenge/submit', async (req, res) => {
  try {
    const { nickname, score, accuracy, timeTakenSec } = req.body;
    if (!nickname) {
      return res.status(400).json({ success: false, error: 'Nickname is required.' });
    }

    res.json({
      success: true,
      message: 'Daily challenge attempt recorded! Streak maintained 🔥',
      streak: 1
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Tournaments List
router.get('/tournaments', async (req, res) => {
  try {
    const tournaments = await db.query('SELECT * FROM tournaments');
    const participants = await db.query('SELECT * FROM tournament_participants ORDER BY total_score DESC');
    res.json({ success: true, tournaments, participants });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. AI Question Generator API (Host Feature)
router.post('/ai/generate', async (req, res) => {
  try {
    const { topic = 'Quantitative', difficulty = 'medium', count = 3 } = req.body;
    const generated = await aiService.generateQuestions({ topic, difficulty, count: Number(count) });
    res.json({ success: true, questions: generated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9. Host CSV Export for Completed Match
router.get('/export/csv/:roomCode', (req, res) => {
  const { roomCode } = req.params;
  const room = roomManager.getRoom(roomCode);
  if (!room) {
    return res.status(404).send('Room not found');
  }

  const leaderboard = roomManager.getLeaderboard(roomCode);
  let csv = 'Rank,Nickname,College,Team,Final Score,Correct Answers,Accuracy %,Avg Speed (ms)\n';
  leaderboard.forEach(p => {
    csv += `${p.rank},"${p.nickname}","${p.collegeName || ''}","${p.teamName || ''}",${p.score},${p.correctCount},${p.accuracy}%,${p.avgSpeedMs}\n`;
  });

  res.header('Content-Type', 'text/csv');
  res.attachment(`AptiQuiz_Results_${roomCode}.csv`);
  res.send(csv);
});

// 10. Health Check Endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    dbEngine: db.getIsMock() ? 'in-memory-persistence-store' : 'mysql-live-pool',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
