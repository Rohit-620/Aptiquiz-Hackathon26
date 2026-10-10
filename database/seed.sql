-- AptiQuiz Seed Data
USE aptiquiz_db;

-- Colleges
INSERT IGNORE INTO colleges (name, code) VALUES
('Indian Institute of Technology Bombay', 'IITB'),
('Indian Institute of Technology Delhi', 'IITD'),
('Birla Institute of Technology and Science, Pilani', 'BITS'),
('National Institute of Technology Trichy', 'NITT'),
('Delhi Technological University', 'DTU'),
('Vellore Institute of Technology', 'VIT'),
('Manipal Institute of Technology', 'MIT');

-- Achievements
INSERT IGNORE INTO achievements (badge_key, title, description, icon) VALUES
('first_blood', 'First Strike', 'Answered first correctly in any round', '⚡'),
('accuracy_master', 'Bullseye', 'Finished a quiz with 100% accuracy', '🎯'),
('speed_demon', 'Supersonic', 'Answered correctly in under 2 seconds', '🏎️'),
('comeback_king', 'The Comeback Kid', 'Climbed 5+ rank positions during a match', '👑'),
('streak_7', 'Week of Grit', 'Completed 7 days streak in daily challenge', '🔥');

-- Default Question Sets
INSERT IGNORE INTO question_sets (id, title, description, topic, difficulty, is_public) VALUES
(1, 'All-Round Aptitude Blitz (Speed & Logic)', 'High-stakes aptitude quiz covering Numerical Reasoning, Logical Deductions, and Verbal Ability.', 'General Aptitude', 'medium', TRUE),
(2, 'Quantitative Aptitude Masterclass', 'Focus on percentages, ratios, time-speed-distance, and data interpretation.', 'Quantitative', 'hard', TRUE),
(3, 'Logical Reasoning Challenge', 'Coding-decoding, blood relations, syllogisms, and sequence deduction.', 'Logical Reasoning', 'medium', TRUE);

-- Questions for Set 1 (All-Round Aptitude Blitz)
INSERT IGNORE INTO questions (question_set_id, prompt, topic, difficulty, option_a, option_b, option_c, option_d, correct_option, explanation, time_limit_sec) VALUES
(1, 'If a train 120m long passes a pole in 6 seconds, what is its speed in km/h?', 'Quantitative', 'medium', '60 km/h', '72 km/h', '80 km/h', '90 km/h', 'B', 'Speed = Distance / Time = 120m / 6s = 20 m/s. 20 * (18/5) = 72 km/h.', 15),

(1, 'Find the missing number in the sequence: 4, 9, 25, 49, 121, ?', 'Logical Reasoning', 'medium', '144', '169', '196', '225', 'B', 'The sequence consists of squares of prime numbers: 2^2=4, 3^2=9, 5^2=25, 7^2=49, 11^2=121, next prime is 13, 13^2=169.', 15),

(1, 'A and B can finish a task together in 12 days. A alone can do it in 20 days. How many days will B take alone?', 'Quantitative', 'medium', '25 days', '30 days', '32 days', '40 days', 'B', '1/B = 1/12 - 1/20 = (5-3)/60 = 2/60 = 1/30. So B takes 30 days.', 15),

(1, 'Select the pair that expresses a relationship similar to: CANDLE : WAX', 'Verbal Ability', 'easy', 'Paper : Wood', 'Needle : Thread', 'Bread : Flour', 'Engine : Fuel', 'C', 'A candle is made from wax; bread is made from flour.', 15),

(1, 'Pointing to a photograph, Rohit said: "She is the daughter of my grandfather only son." How is the girl related to Rohit?', 'Logical Reasoning', 'easy', 'Mother', 'Sister', 'Cousin', 'Aunt', 'B', 'Grandfather only son is Rohit father. The daughter of Rohit father is Rohit sister.', 15),

(1, 'A shopkeeper marks an article 40% above cost and gives a 20% discount. What is his net profit percent?', 'Quantitative', 'medium', '12%', '15%', '18%', '20%', 'A', 'Let CP = 100. Marked Price = 140. Discount 20% of 140 = 28. SP = 140 - 28 = 112. Profit = 12%.', 15),

(1, 'In a certain code, "PENCIL" is written as "QGOFJM". How is "ERASER" written in that code?', 'Logical Reasoning', 'hard', 'FSBTFS', 'FTCVHT', 'FSCVFT', 'FTDTHT', 'B', 'Pattern: +1, +2, +1, +2, +1, +2. E+1=F, R+2=T, A+1=B... wait: E(+1)->F, R(+2)->T, A(+2)->C, S(+3)->V, E(+3)->H, R(+2)->T => FTCVHT.', 15),

(1, 'Two dice are tossed simultaneously. What is the probability that the sum of the numbers is 8?', 'Quantitative', 'medium', '5/36', '1/6', '7/36', '1/9', 'A', 'Favorable outcomes: (2,6), (3,5), (4,4), (5,3), (6,2) -> 5 outcomes out of 36 total. So 5/36.', 15);

-- Questions for Set 2
INSERT IGNORE INTO questions (question_set_id, prompt, topic, difficulty, option_a, option_b, option_c, option_d, correct_option, explanation, time_limit_sec) VALUES
(2, 'The average of 5 consecutive odd numbers is 61. What is the difference between highest and lowest numbers?', 'Quantitative', 'easy', '4', '8', '10', '12', 'B', 'Consecutive odd numbers differ by 2 each. With 5 numbers, difference between 1st and 5th is 4 * 2 = 8.', 15),
(2, 'A sum doubles in 5 years at simple interest. In how many years will it become 4 times?', 'Quantitative', 'medium', '10 years', '15 years', '20 years', '25 years', 'B', 'Doubling means interest = P in 5 years. 4 times means interest = 3P. Time = 3 * 5 = 15 years.', 15);

-- Daily challenge for today
INSERT IGNORE INTO daily_challenges (challenge_date, question_set_id) VALUES
(CURRENT_DATE(), 1);
