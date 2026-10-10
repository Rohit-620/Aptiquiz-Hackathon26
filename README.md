# AptiQuiz — The Real-Time Multiplayer Aptitude Arena ⚡

> **Problem Statement 3**: A high-stakes, real-time multiplayer aptitude quiz arena supporting up to **50 concurrent players in one room**, featuring server-authoritative scoring, anti-cheat protection, live comeback surge indicators, and inter-collegiate rankings.

---

## 🌟 Highlights & Features Implemented

1. **Fair Real-Time Multiplayer Arena**: Synchronized question broadcast, authoritative deadlines, and zero client-side score trust via Socket.IO.
2. **Server-Authoritative Anti-Cheat System**:
   - Scores calculated solely on the server.
   - Correct options kept private until round closes.
   - Late submissions (beyond deadline + network jitter grace) strictly rejected.
   - Duplicate submissions within the same round blocked.
3. **Live Comeback Meter**: Real-time rank delta tracking, leader gap measurement, and psychological momentum tags (*"Leading the Pack"*, *"Surging +X"*, *"Closing the Gap"*).
4. **Inter-Collegiate League**: Aggregated rankings using verified completed match results:
   $$\text{Composite Rating} = \text{Avg Score} + (\text{Active Players} \times 50) + (\text{Accuracy \%} \times 10)$$
5. **50-Player Concurrency Verified**: Custom automated test spawning 50 real Socket.IO clients, achieving 100% join success and 50/50 simultaneous answer processing.
6. **Student Skill Passport**: Persistent player profiles with match history, accuracy %, personal best score, and college ranking.
7. **AI Question Generator & Quality Checker**: Topic-based aptitude generator with structure, duplicate option, and metadata verification.
8. **Power-Up System**: Server-validated **50:50** (eliminates 2 wrong options) and **2x Points**.
9. **Tournaments & Team Battle Modes**: Multi-stage brackets (Qualifiers ➔ Semi-Finals ➔ Grand Finale) and team aggregation.
10. **Daily Aptitude Challenge & Streaks**: Curated daily practice sprint maintaining active streaks.
11. **Export & Analytics**: Host CSV match result exports with question-level insights.

---

## 🏗️ Architecture & Technology Stack

- **Frontend**: HTML5, CSS3 (Esports Dark Cyber Theme), Vanilla JavaScript.
- **Backend**: Node.js & Express.js.
- **Real-Time Communication**: Socket.IO with authoritative rooms and events.
- **Database Engine**: Dual-Mode Database Engine:
  - Live **MySQL 8.0** (`mysql2`) with normalized relational schema & foreign keys.
  - Automatic zero-friction **Transactional Memory Persistence Fallback** when local MySQL credentials are unconfigured, ensuring the application and tests run immediately.
- **Testing**:
  - `tests/core.test.js`: Core math, anti-cheat, duplicate prevention, and AI QA unit tests.
  - `scripts/load-test.js`: 50-player concurrent Socket.IO load test.

---

## 📊 Database Schema (`database/schema.sql`)

The database consists of 16 normalized tables:
- `colleges`: Participating universities and codes.
- `players` & `player_sessions`: Competitors, reconnect tokens, and stats.
- `question_sets` & `questions`: Curated aptitude questions and options.
- `game_rooms` & `room_participants`: Live arena rooms, rosters, and states.
- `answer_submissions`: Immutable audit trail of every submitted answer.
- `game_results`: Final verified match scores and speed rankings.
- `tournaments` & `tournament_participants`: Multi-round tournament brackets.
- `daily_challenges` & `daily_challenge_attempts`: Daily sprint streaks.
- `achievements` & `player_achievements`: Milestone badges.
- `suspicious_activity_logs`: Anti-cheat audit logs.

---

## 📐 Scoring Formula

$$\text{Points} = 500 + 500 \times \left(1 - \frac{\text{elapsedTime}}{\text{roundDuration}}\right)$$

- **Instant Answer (0s)**: 1000 points.
- **Half-Time Answer (7.5s / 15s)**: 750 points.
- **Deadline Answer (15s)**: 500 points.
- **Incorrect / Late / Unanswered**: 0 points.
- **Double Points Power-Up**: $2 \times \text{Points}$.

---

## 🚀 Windows Quickstart & Run Instructions

### 1. Prerequisites
- Node.js (v18+ or v24+ recommended)
- MySQL 8.0 (Optional; built-in auto-fallback activates if MySQL password is not yet configured)

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
*(If connecting to local MySQL, set `DB_PASSWORD` in `.env` and execute `mysql -u root -p < database/schema.sql` and `mysql -u root -p < database/seed.sql`)*.

### 4. Run the Server
```bash
npm start
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 🧪 Verification & Load Test Results

### 1. Unit & Security Tests
Run the automated test suite:
```bash
npm test
```
**Actual Result**:
```text
🧪 Running AptiQuiz Verification Test Suite...
Test 1: Scoring Formula Verification - PASSED
Test 2: Anti-Cheat Late Submission Rejection - PASSED
Test 3: Anti-Cheat Duplicate Submission Rejection - PASSED
Test 4: College League Standings Aggregator - PASSED
Test 5: AI Quality Validator - PASSED
====================================================
🎉 ALL UNIT TESTS PASSED (5/5 tests)!
====================================================
```

### 2. 50-Player Concurrent Load Test
Run the automated load test against the active server:
```bash
npm run test:load
```
**Actual Result**:
```text
====================================================
🚀 Starting AptiQuiz 50-Player Concurrent Load Test
Target URL: http://localhost:3000
Concurrency: 50 simulated players
====================================================
✅ Host connected successfully
✅ Room created successfully: 1PJ51A
📡 Spawning and connecting 50 concurrent players...
📊 Join Results:
- Connected & Joined: 50/50 players (100% Success)
- Average Join Latency: 338.4 ms
🏁 Host triggering match start...
⚡ Simulating concurrent answer submissions across all players...
📊 Answer Results:
- Answers Processed Server-Side: 50/50
- Correct Submissions: 13
🧹 Cleaning up test sockets...
====================================================
🏆 50-PLAYER LOAD TEST PASSED SUCCESSFULLY!
====================================================
```
