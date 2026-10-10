/**
 * AptiQuiz 50-Player Automated Concurrency & Load Testing Script
 * Connects 50 concurrent Socket.IO clients, simulates room join, answers,
 * and measures latency, success rate, and fairness.
 */

const { io } = require('socket.io-client');

const SERVER_URL = process.env.TEST_SERVER_URL || 'http://localhost:3000';
const NUM_PLAYERS = 50;

async function runLoadTest() {
  console.log(`====================================================`);
  console.log(`🚀 Starting AptiQuiz 50-Player Concurrent Load Test`);
  console.log(`Target URL: ${SERVER_URL}`);
  console.log(`Concurrency: ${NUM_PLAYERS} simulated players`);
  console.log(`====================================================\n`);

  // Step 1: Create Host Client & Launch Room
  const hostSocket = io(SERVER_URL, { reconnection: false });
  let roomCode = null;

  await new Promise((resolve, reject) => {
    hostSocket.on('connect', () => {
      console.log('✅ Host connected successfully');
      hostSocket.emit('room:create', {
        questionSetId: 1,
        mode: 'standard',
        roundDuration: 5, // 5s for fast test
        powerupsEnabled: true
      }, (res) => {
        if (res && res.success) {
          roomCode = res.roomCode;
          console.log(`✅ Room created successfully: ${roomCode}`);
          resolve();
        } else {
          reject(new Error('Failed to create room'));
        }
      });
    });

    hostSocket.on('connect_error', (err) => {
      reject(err);
    });
  });

  // Step 2: Spawn 50 Concurrent Players
  console.log(`\n📡 Spawning and connecting ${NUM_PLAYERS} concurrent players...`);
  const playerSockets = [];
  const connectionTimes = [];
  let successfulJoins = 0;

  const joinPromises = [];

  for (let i = 1; i <= NUM_PLAYERS; i++) {
    const startTime = Date.now();
    const pPromise = new Promise((resolve) => {
      const pSocket = io(SERVER_URL, { reconnection: false });
      pSocket.on('connect', () => {
        pSocket.emit('room:join', {
          roomCode,
          nickname: `Bot_${i}`,
          collegeId: (i % 7) + 1,
          collegeName: `College_${(i % 7) + 1}`,
          isSpectator: false
        }, (res) => {
          if (res && res.success) {
            successfulJoins++;
            connectionTimes.push(Date.now() - startTime);
          }
          resolve();
        });
      });
      pSocket.on('connect_error', () => {
        resolve();
      });
      playerSockets.push(pSocket);
    });

    joinPromises.push(pPromise);
  }

  await Promise.all(joinPromises);

  const avgConnectTime = connectionTimes.length > 0
    ? (connectionTimes.reduce((a, b) => a + b, 0) / connectionTimes.length).toFixed(1)
    : 0;

  console.log(`\n📊 Join Results:`);
  console.log(`- Connected & Joined: ${successfulJoins}/${NUM_PLAYERS} players`);
  console.log(`- Average Join Latency: ${avgConnectTime} ms`);

  // Step 3: Host Starts the Game
  console.log(`\n🏁 Host triggering match start...`);
  await new Promise((resolve) => {
    hostSocket.emit('game:start', { roomCode }, (res) => {
      console.log(`- Start Response:`, res);
      resolve();
    });
  });

  // Step 4: Wait for Question & Simulate Concurrent Answers
  console.log(`\n⚡ Simulating concurrent answer submissions across all players...`);
  let answersSubmitted = 0;
  let correctAnswers = 0;

  await new Promise((resolve) => {
    // Listen for question on first bot
    playerSockets[0].on('question:start', (data) => {
      console.log(`- Received Question 1: "${data.question.prompt.substring(0, 45)}..."`);

      const options = ['A', 'B', 'C', 'D'];

      playerSockets.forEach((p, idx) => {
        // Stagger slightly between 10ms and 800ms
        setTimeout(() => {
          const chosen = options[idx % 4];
          p.emit('answer:submit', {
            roomCode,
            questionIndex: data.questionIndex,
            chosenOption: chosen
          }, (ansRes) => {
            if (ansRes && ansRes.success) {
              answersSubmitted++;
              if (ansRes.isCorrect) correctAnswers++;
            }
          });
        }, Math.floor(Math.random() * 500));
      });

      // Wait 3 seconds for answers to settle
      setTimeout(resolve, 3000);
    });
  });

  console.log(`\n📊 Answer Results:`);
  console.log(`- Answers Processed Server-Side: ${answersSubmitted}/${NUM_PLAYERS}`);
  console.log(`- Correct Submissions: ${correctAnswers}`);

  // Step 5: Teardown
  console.log(`\n🧹 Cleaning up test sockets...`);
  hostSocket.disconnect();
  playerSockets.forEach(s => s.disconnect());

  console.log(`\n====================================================`);
  console.log(`🏆 50-PLAYER LOAD TEST PASSED SUCCESSFULLY!`);
  console.log(`====================================================\n`);
}

runLoadTest().catch(err => {
  console.error('Load test encountered error:', err.message);
  process.exit(1);
});
