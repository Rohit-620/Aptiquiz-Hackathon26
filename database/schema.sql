-- AptiQuiz - MySQL Database Schema
-- Production & Hackathon Ready

CREATE DATABASE IF NOT EXISTS aptiquiz_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE aptiquiz_db;

-- 1. Colleges Table
CREATE TABLE IF NOT EXISTS colleges (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    code VARCHAR(50) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Players Table
CREATE TABLE IF NOT EXISTS players (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nickname VARCHAR(100) NOT NULL,
    college_id INT NULL,
    email VARCHAR(255) NULL UNIQUE,
    password_hash VARCHAR(255) NULL,
    avatar_url VARCHAR(255) NULL,
    total_games_played INT DEFAULT 0,
    total_score BIGINT DEFAULT 0,
    best_score INT DEFAULT 0,
    correct_answers_count INT DEFAULT 0,
    total_answers_count INT DEFAULT 0,
    avg_response_time_ms INT DEFAULT 0,
    daily_streak INT DEFAULT 0,
    last_daily_challenge_date DATE NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE SET NULL
);

-- 3. Player Sessions / Reconnection Tokens
CREATE TABLE IF NOT EXISTS player_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    player_id INT NULL,
    session_token VARCHAR(255) NOT NULL UNIQUE,
    room_code VARCHAR(10) NULL,
    nickname VARCHAR(100) NOT NULL,
    college_id INT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    last_heartbeat TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session_token (session_token),
    INDEX idx_room_code (room_code)
);

-- 4. Question Sets
CREATE TABLE IF NOT EXISTS question_sets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NULL,
    topic VARCHAR(100) NOT NULL DEFAULT 'General Aptitude',
    difficulty ENUM('easy', 'medium', 'hard', 'mixed') DEFAULT 'medium',
    creator_id INT NULL,
    is_public BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 5. Questions
CREATE TABLE IF NOT EXISTS questions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    question_set_id INT NOT NULL,
    prompt TEXT NOT NULL,
    topic VARCHAR(100) NOT NULL DEFAULT 'Quantitative',
    difficulty ENUM('easy', 'medium', 'hard') DEFAULT 'medium',
    option_a VARCHAR(255) NOT NULL,
    option_b VARCHAR(255) NOT NULL,
    option_c VARCHAR(255) NOT NULL,
    option_d VARCHAR(255) NOT NULL,
    correct_option ENUM('A', 'B', 'C', 'D') NOT NULL,
    explanation TEXT NULL,
    time_limit_sec INT DEFAULT 15,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (question_set_id) REFERENCES question_sets(id) ON DELETE CASCADE,
    INDEX idx_set_id (question_set_id)
);

-- 6. Game Rooms
CREATE TABLE IF NOT EXISTS game_rooms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_code VARCHAR(10) NOT NULL UNIQUE,
    host_id INT NULL,
    question_set_id INT NOT NULL,
    status ENUM('lobby', 'active', 'finished') DEFAULT 'lobby',
    mode ENUM('standard', 'team', 'tournament') DEFAULT 'standard',
    max_players INT DEFAULT 50,
    round_duration INT DEFAULT 15,
    powerups_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP NULL,
    FOREIGN KEY (question_set_id) REFERENCES question_sets(id) ON DELETE RESTRICT,
    INDEX idx_room_code (room_code)
);

-- 7. Room Participants
CREATE TABLE IF NOT EXISTS room_participants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT NOT NULL,
    player_id INT NULL,
    nickname VARCHAR(100) NOT NULL,
    college_id INT NULL,
    team_name VARCHAR(100) NULL,
    is_spectator BOOLEAN DEFAULT FALSE,
    final_score INT DEFAULT 0,
    rank_position INT DEFAULT NULL,
    accuracy_percentage DECIMAL(5,2) DEFAULT 0.00,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES game_rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE SET NULL,
    UNIQUE KEY uq_room_player (room_id, nickname)
);

-- 8. Answer Submissions
CREATE TABLE IF NOT EXISTS answer_submissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT NOT NULL,
    question_id INT NOT NULL,
    player_id INT NULL,
    nickname VARCHAR(100) NOT NULL,
    chosen_option VARCHAR(10) NOT NULL,
    is_correct BOOLEAN NOT NULL,
    elapsed_time_ms INT NOT NULL,
    points_awarded INT NOT NULL,
    powerup_used VARCHAR(50) NULL,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES game_rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
    UNIQUE KEY uq_player_round (room_id, question_id, nickname),
    INDEX idx_room_question (room_id, question_id)
);

-- 9. Game Results (Archival summary per room per player)
CREATE TABLE IF NOT EXISTS game_results (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT NOT NULL,
    player_id INT NULL,
    nickname VARCHAR(100) NOT NULL,
    college_id INT NULL,
    final_score INT NOT NULL,
    final_rank INT NOT NULL,
    correct_count INT NOT NULL,
    total_questions INT NOT NULL,
    avg_speed_ms INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES game_rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE SET NULL
);

-- 10. Tournaments
CREATE TABLE IF NOT EXISTS tournaments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NULL,
    status ENUM('upcoming', 'qualifiers', 'semifinals', 'finals', 'completed') DEFAULT 'upcoming',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 11. Tournament Participants
CREATE TABLE IF NOT EXISTS tournament_participants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tournament_id INT NOT NULL,
    player_id INT NULL,
    nickname VARCHAR(100) NOT NULL,
    college_name VARCHAR(255) NULL,
    stage ENUM('registered', 'qualifiers', 'semifinals', 'finals', 'eliminated', 'winner') DEFAULT 'registered',
    total_score INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
);

-- 12. Daily Challenges
CREATE TABLE IF NOT EXISTS daily_challenges (
    id INT AUTO_INCREMENT PRIMARY KEY,
    challenge_date DATE NOT NULL UNIQUE,
    question_set_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (question_set_id) REFERENCES question_sets(id) ON DELETE CASCADE
);

-- 13. Daily Challenge Attempts
CREATE TABLE IF NOT EXISTS daily_challenge_attempts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    challenge_id INT NOT NULL,
    player_id INT NULL,
    nickname VARCHAR(100) NOT NULL,
    score INT NOT NULL,
    accuracy DECIMAL(5,2) NOT NULL,
    time_taken_sec INT NOT NULL,
    attempt_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_player_daily (challenge_id, nickname),
    FOREIGN KEY (challenge_id) REFERENCES daily_challenges(id) ON DELETE CASCADE
);

-- 14. Achievements
CREATE TABLE IF NOT EXISTS achievements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    badge_key VARCHAR(50) NOT NULL UNIQUE,
    title VARCHAR(150) NOT NULL,
    description TEXT NOT NULL,
    icon VARCHAR(100) DEFAULT '🏆',
    points_reward INT DEFAULT 100
);

-- 15. Player Achievements
CREATE TABLE IF NOT EXISTS player_achievements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    player_id INT NULL,
    nickname VARCHAR(100) NOT NULL,
    achievement_id INT NOT NULL,
    unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_player_achieve (nickname, achievement_id),
    FOREIGN KEY (achievement_id) REFERENCES achievements(id) ON DELETE CASCADE
);

-- 16. Suspicious Activity Logs (Anti-Cheat Audit Trail)
CREATE TABLE IF NOT EXISTS suspicious_activity_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_code VARCHAR(10) NULL,
    nickname VARCHAR(100) NULL,
    event_type VARCHAR(100) NOT NULL,
    details TEXT NULL,
    ip_address VARCHAR(50) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 17. Practice Sessions (Multi-Round Adaptive Practice System)
CREATE TABLE IF NOT EXISTS practice_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL UNIQUE,
    nickname VARCHAR(100) NOT NULL,
    college_id INT NULL,
    status ENUM('active', 'completed', 'abandoned') DEFAULT 'active',
    total_questions_attempted INT DEFAULT 0,
    total_correct_answers INT DEFAULT 0,
    max_questions INT DEFAULT 10,
    rounds_cleared INT DEFAULT 0,
    bonus_unlocked BOOLEAN DEFAULT FALSE,
    bonus_attempted BOOLEAN DEFAULT FALSE,
    bonus_correct BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE SET NULL,
    INDEX idx_practice_session (session_id)
);

-- 18. Practice Round Attempts
CREATE TABLE IF NOT EXISTS practice_round_attempts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL,
    round_number INT NOT NULL,
    difficulty VARCHAR(50) NOT NULL,
    score INT NOT NULL,
    target_count INT DEFAULT 3,
    passed BOOLEAN NOT NULL,
    attempt_number INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES practice_sessions(session_id) ON DELETE CASCADE
);

