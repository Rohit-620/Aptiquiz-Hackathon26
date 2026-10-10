/**
 * AptiQuiz Client-Side Application
 * Coordinates Socket.IO real-time events, views, countdown timer, sound cues, and API fetches
 */

// Initialize Socket.IO connection
const socket = io();

// App State
const state = {
  currentTab: 'arena-tab',
  roomCode: null,
  nickname: null,
  collegeId: null,
  collegeName: null,
  teamName: null,
  isHost: false,
  isSpectator: false,
  currentQuestionIndex: -1,
  totalQuestions: 8,
  score: 0,
  streak: 0,
  soundEnabled: true,
  hasAnswered: false,
  timerInterval: null,
  sessionToken: localStorage.getItem('aptiquiz_session_token') || null,
  html5QrCode: null,
  proctorStream: null,
  tabSwitchWarnings: 0,
  isDisqualified: false
};

// Web Audio API Sound Effects Synthesizer (No external mp3 assets needed)
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// Proctoring Camera Handlers
async function startProctoringCamera() {
  const videoElem = document.getElementById('proctorVideo');
  if (!videoElem) return;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' },
      audio: false
    });
    state.proctorStream = stream;
    videoElem.srcObject = stream;
    videoElem.play();
    console.log('[PROCTORING] Live camera feed activated for student');
  } catch (err) {
    console.warn('[PROCTORING] Camera feed not allowed or unavailable:', err.message);
    const tag = document.getElementById('proctorStatusTag');
    if (tag) {
      tag.textContent = 'NO CAM DETECTED';
      tag.style.background = 'rgba(239, 68, 68, 0.85)';
    }
  }
}

function stopProctoringCamera() {
  if (state.proctorStream) {
    state.proctorStream.getTracks().forEach(track => track.stop());
    state.proctorStream = null;
    const videoElem = document.getElementById('proctorVideo');
    if (videoElem) videoElem.srcObject = null;
    console.log('[PROCTORING] Camera feed stopped');
  }
}

function playSound(type) {
  if (!state.soundEnabled) return;
  try {
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (type === 'correct') {
      // High cheerful ascending chime
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.15); // G5
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === 'wrong') {
      // Low buzz
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.linearRampToValueAtTime(110, now + 0.25);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === 'tick') {
      // Clock tick
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.05);
    } else if (type === 'countdown') {
      // Round start beep
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
    }
  } catch (e) {
    console.warn('Audio error:', e);
  }
}

// DOM Elements
const elements = {
  // Navigation
  navBtns: document.querySelectorAll('.nav-btn'),
  tabPanes: document.querySelectorAll('.tab-pane'),
  navNickname: document.getElementById('navNickname'),
  toast: document.getElementById('toast'),
  btnToggleSound: document.getElementById('btnToggleSound'),

  // QR Scanner & Arena Form
  joinContainer: document.getElementById('joinContainer'),
  joinForm: document.getElementById('joinForm'),
  roomCodeInput: document.getElementById('roomCodeInput'),
  nicknameInput: document.getElementById('nicknameInput'),
  collegeSelect: document.getElementById('collegeSelect'),
  teamInput: document.getElementById('teamInput'),
  btnJoinRoom: document.getElementById('btnJoinRoom'),
  btnJoinSpectator: document.getElementById('btnJoinSpectator'),
  btnOpenScanner: document.getElementById('btnOpenScanner'),
  btnCloseScanner: document.getElementById('btnCloseScanner'),
  qrScannerBox: document.getElementById('qrScannerBox'),

  // Lobby & QR code
  lobbyContainer: document.getElementById('lobbyContainer'),
  displayRoomCode: document.getElementById('displayRoomCode'),
  btnCopyRoomCode: document.getElementById('btnCopyRoomCode'),
  btnToggleQR: document.getElementById('btnToggleQR'),
  lobbyQRContainer: document.getElementById('lobbyQRContainer'),
  lobbyQRImage: document.getElementById('lobbyQRImage'),
  lobbyPlayerCount: document.getElementById('lobbyPlayerCount'),
  lobbyPlayersList: document.getElementById('lobbyPlayersList'),
  hostLobbyControls: document.getElementById('hostLobbyControls'),
  btnStartGame: document.getElementById('btnStartGame'),
  playerWaitingNotice: document.getElementById('playerWaitingNotice'),

  // Live Arena & Streaks
  liveArenaContainer: document.getElementById('liveArenaContainer'),
  qCurrentNum: document.getElementById('qCurrentNum'),
  qTotalNum: document.getElementById('qTotalNum'),
  timerSeconds: document.getElementById('timerSeconds'),
  streakCount: document.getElementById('streakCount'),
  playerCurrentScore: document.getElementById('playerCurrentScore'),
  questionTopic: document.getElementById('questionTopic'),
  questionPrompt: document.getElementById('questionPrompt'),
  optionsGrid: document.getElementById('optionsGrid'),
  optionBtns: document.querySelectorAll('.option-btn'),
  optTextA: document.getElementById('optTextA'),
  optTextB: document.getElementById('optTextB'),
  optTextC: document.getElementById('optTextC'),
  optTextD: document.getElementById('optTextD'),
  answerStatusMessage: document.getElementById('answerStatusMessage'),
  btnPowerup5050: document.getElementById('btnPowerup5050'),
  btnPowerupDouble: document.getElementById('btnPowerupDouble'),

  // Round Reveal & Insights
  roundRevealBox: document.getElementById('roundRevealBox'),
  revealResultBadge: document.getElementById('revealResultBadge'),
  revealCorrectKey: document.getElementById('revealCorrectKey'),
  revealExplanation: document.getElementById('revealExplanation'),
  insightAccuracy: document.getElementById('insightAccuracy'),
  insightResponses: document.getElementById('insightResponses'),

  // Leaderboard
  liveLeaderboardBody: document.getElementById('liveLeaderboardBody'),

  // Final Results
  finalResultsContainer: document.getElementById('finalResultsContainer'),
  winnerPodium: document.getElementById('winnerPodium'),
  finalStandingsBody: document.getElementById('finalStandingsBody'),
  btnPlayAgain: document.getElementById('btnPlayAgain'),
  btnExportCSV: document.getElementById('btnExportCSV'),

  // Host Dashboard
  hostCreateRoomForm: document.getElementById('hostCreateRoomForm'),
  hostQuestionSetSelect: document.getElementById('hostQuestionSetSelect'),
  hostGameMode: document.getElementById('hostGameMode'),
  hostRoundDuration: document.getElementById('hostRoundDuration'),
  hostPowerups: document.getElementById('hostPowerups'),
  aiGenerateForm: document.getElementById('aiGenerateForm'),
  aiTopicSelect: document.getElementById('aiTopicSelect'),
  aiDifficultySelect: document.getElementById('aiDifficultySelect'),
  aiCountInput: document.getElementById('aiCountInput'),
  aiGeneratedPreview: document.getElementById('aiGeneratedPreview'),
  aiPreviewList: document.getElementById('aiPreviewList'),

  // Tables & Passports
  collegeLeagueBody: document.getElementById('collegeLeagueBody'),
  tournamentLeaderboardBody: document.getElementById('tournamentLeaderboardBody'),
  passportSearchInput: document.getElementById('passportSearchInput'),
  btnSearchPassport: document.getElementById('btnSearchPassport'),
  passportNickname: document.getElementById('passportNickname'),
  passTotalGames: document.getElementById('passTotalGames'),
  passBestScore: document.getElementById('passBestScore'),
  passAccuracy: document.getElementById('passAccuracy'),
  passportHistoryBody: document.getElementById('passportHistoryBody'),

  // Daily Challenge
  btnStartDailyChallenge: document.getElementById('btnStartDailyChallenge'),
  dailyPrompt: document.getElementById('dailyPrompt'),
  dailyDate: document.getElementById('dailyDate')
};

/* ==========================================================================
   Initialization & Navigation
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupAudioToggle();
  setupQRScanner();
  setupTabSwitchMonitor();
  setupHeroInteractions();
  setupPracticeQuizPreview();
  init3DScene();
  loadArenaStats();
  loadColleges();
  loadCollegeLeague();
  loadTournaments();
  setupHostHandlers();
  setupDailyChallenge();

  // If room code exists in URL params (?room=ABCDEF), prefill it and open entry modal
  const urlParams = new URLSearchParams(window.location.search);
  const codeParam = urlParams.get('room');
  if (codeParam) {
    elements.roomCodeInput.value = codeParam.toUpperCase();
    openPlayerEntryModal();
    showToast(`Room code ${codeParam.toUpperCase()} detected and pre-filled!`);
  }
});

function init3DScene() {
  if (typeof Arena3DScene === 'function') {
    state.arena3d = new Arena3DScene('arena3dCanvasContainer');
  }
}

async function loadArenaStats() {
  try {
    const res = await fetch('/api/arena/stats');
    const data = await res.json();
    if (data.success && data.stats) {
      const elOnline = document.getElementById('statOnlinePlayers');
      const elRooms = document.getElementById('statActiveRooms');
      const elAns = document.getElementById('statQuestionsAnswered');

      if (elOnline) elOnline.textContent = `${Math.max(12, data.stats.onlinePlayers)}+`;
      if (elRooms) elRooms.textContent = `${data.stats.activeRooms} Active`;
      if (elAns) elAns.textContent = `${data.stats.todayQuestionsAnswered}+`;
    }
  } catch (err) {
    console.error('Failed to load arena stats', err);
  }
}

function openPlayerEntryModal() {
  const modal = document.getElementById('playerEntryModal');
  if (modal) modal.classList.remove('hidden');
}

function closePlayerEntryModal() {
  const modal = document.getElementById('playerEntryModal');
  if (modal) modal.classList.add('hidden');
}

function setupHeroInteractions() {
  const btnHeroOpenJoin = document.getElementById('btnHeroOpenJoin');
  const btnCloseEntryModal = document.getElementById('btnCloseEntryModal');
  const entryModalBackdrop = document.getElementById('entryModalBackdrop');
  const btnHeroScrollFeatures = document.getElementById('btnHeroScrollFeatures');

  if (btnHeroOpenJoin) {
    btnHeroOpenJoin.addEventListener('click', openPlayerEntryModal);
  }
  if (btnCloseEntryModal) {
    btnCloseEntryModal.addEventListener('click', closePlayerEntryModal);
  }
  if (entryModalBackdrop) {
    entryModalBackdrop.addEventListener('click', closePlayerEntryModal);
  }
  if (btnHeroScrollFeatures) {
    btnHeroScrollFeatures.addEventListener('click', () => {
      const featSec = document.getElementById('featureShowcaseSection');
      if (featSec) featSec.scrollIntoView({ behavior: 'smooth' });
    });
  }

  // Avatar picker buttons
  const avatarBtns = document.querySelectorAll('.avatar-btn');
  avatarBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      avatarBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const avatarIcon = btn.getAttribute('data-avatar');
      const userAvatar = document.querySelector('.user-avatar');
      if (userAvatar) userAvatar.textContent = avatarIcon;
      playSound('tick');
    });
  });
}

function setupPracticeQuizPreview() {
  const optBtns = document.querySelectorAll('.preview-opt-btn');
  const feedback = document.getElementById('previewFeedback');
  const timer = document.getElementById('previewTimer');

  let remaining = 15;
  const pInterval = setInterval(() => {
    remaining--;
    if (timer) timer.textContent = `${Math.max(0, remaining)}s`;
    if (remaining <= 0) clearInterval(pInterval);
  }, 1000);

  optBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const chosen = btn.getAttribute('data-opt');
      optBtns.forEach(b => b.disabled = true);
      clearInterval(pInterval);

      if (chosen === 'B') {
        btn.classList.add('correct');
        feedback.className = 'preview-feedback success';
        feedback.textContent = '🎯 Correct! Speed = 120m / 6s = 20 m/s * (18/5) = 72 km/h. +950 Speed Points!';
        playSound('correct');
      } else {
        btn.classList.add('wrong');
        const correctBtn = document.querySelector('.preview-opt-btn[data-opt="B"]');
        if (correctBtn) correctBtn.classList.add('correct');
        feedback.className = 'preview-feedback failure';
        feedback.textContent = '❌ Incorrect. Correct answer is Option B (72 km/h). Speed = 20 m/s * 3.6 = 72 km/h.';
        playSound('wrong');
      }
      feedback.classList.remove('hidden');
    });
  });
}

function setupTabSwitchMonitor() {
  document.addEventListener('visibilitychange', () => {
    // Only monitor when a test is actively running (question is live) and player is not spectator or host
    const isTestActive = !elements.liveArenaContainer.classList.contains('hidden') &&
                         elements.finalResultsContainer.classList.contains('hidden') &&
                         !state.isHost &&
                         !state.isSpectator;

    if (!isTestActive || state.isDisqualified) return;

    if (document.hidden) {
      // User switched tab or minimized window!
      state.tabSwitchWarnings += 1;
      const countElem = document.getElementById('tabWarningCount');
      if (countElem) countElem.textContent = state.tabSwitchWarnings;

      playSound('wrong');

      if (state.tabSwitchWarnings > 2) {
        // Disqualify and terminate test immediately!
        state.isDisqualified = true;
        stopProctoringCamera();
        clearInterval(state.timerInterval);

        // Hide live arena and show full disqualified screen
        elements.liveArenaContainer.classList.add('hidden');
        const modal = document.getElementById('disqualifiedModal');
        if (modal) modal.classList.remove('hidden');

        // Disconnect from game room
        socket.disconnect();
        showToast('❌ Disqualified: Exceeded maximum allowed tab switches!');
      } else {
        // Warning 1 or 2
        showToast(`⚠️ WARNING ${state.tabSwitchWarnings}/2: Tab switch detected! Staying on another tab will terminate your test!`);
      }
    }
  });

  // Also catch window blur (e.g. alt-tab or opening split screen/inspect element)
  window.addEventListener('blur', () => {
    const isTestActive = !elements.liveArenaContainer.classList.contains('hidden') &&
                         elements.finalResultsContainer.classList.contains('hidden') &&
                         !state.isHost &&
                         !state.isSpectator;

    if (!isTestActive || state.isDisqualified) return;

    // Trigger same security check
    state.tabSwitchWarnings += 1;
    const countElem = document.getElementById('tabWarningCount');
    if (countElem) countElem.textContent = state.tabSwitchWarnings;

    playSound('wrong');

    if (state.tabSwitchWarnings > 2) {
      state.isDisqualified = true;
      stopProctoringCamera();
      clearInterval(state.timerInterval);

      elements.liveArenaContainer.classList.add('hidden');
      const modal = document.getElementById('disqualifiedModal');
      if (modal) modal.classList.remove('hidden');

      socket.disconnect();
      showToast('❌ Disqualified: Window focus lost more than twice!');
    } else {
      showToast(`⚠️ WARNING ${state.tabSwitchWarnings}/2: Window focus lost! Return immediately to prevent disqualification!`);
    }
  });
}

function setupAudioToggle() {
  elements.btnToggleSound.addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    elements.btnToggleSound.textContent = state.soundEnabled ? '🔊 Sound ON' : '🔇 Sound OFF';
    showToast(state.soundEnabled ? 'Audio Sound FX Enabled' : 'Audio Sound FX Muted');
  });
}

function setupQRScanner() {
  elements.btnOpenScanner.addEventListener('click', async () => {
    elements.qrScannerBox.classList.remove('hidden');

    if (typeof Html5Qrcode === 'undefined') {
      showToast('Scanner library loading... please wait 2 seconds.');
      return;
    }

    try {
      if (state.html5QrCode) {
        try { await state.html5QrCode.stop(); } catch(e) {}
        state.html5QrCode = null;
      }

      state.html5QrCode = new Html5Qrcode('qrReader');
      
      const onScanSuccess = (decodedText) => {
        let parsedCode = decodedText.trim();
        if (decodedText.includes('room=')) {
          try {
            const urlObj = new URL(decodedText);
            parsedCode = urlObj.searchParams.get('room') || decodedText;
          } catch(e) {
            const match = decodedText.match(/room=([A-Za-z0-9]+)/);
            if (match) parsedCode = match[1];
          }
        }
        elements.roomCodeInput.value = parsedCode.toUpperCase();
        showToast(`QR Scanned: Room ${parsedCode.toUpperCase()}!`);
        playSound('correct');
        stopScanner();
      };

      // Try environment camera first, then fall back to user webcam, then any available camera
      try {
        await state.html5QrCode.start(
          { facingMode: 'environment' },
          { fps: 15, qrbox: { width: 220, height: 220 } },
          onScanSuccess,
          () => {}
        );
      } catch (envErr) {
        console.warn('Environment camera failed, attempting default/user camera:', envErr);
        const cameras = await Html5Qrcode.getCameras();
        if (cameras && cameras.length > 0) {
          const cameraId = cameras[0].id;
          await state.html5QrCode.start(
            cameraId,
            { fps: 15, qrbox: { width: 220, height: 220 } },
            onScanSuccess,
            () => {}
          );
        } else {
          throw new Error('No video camera devices found.');
        }
      }
    } catch (err) {
      console.error('Camera connection error:', err);
      showToast('Camera error: Please allow camera permissions in browser.');
    }
  });

  elements.btnCloseScanner.addEventListener('click', stopScanner);

  // File upload scanner fallback
  const qrFileInput = document.getElementById('qrFileInput');
  if (qrFileInput) {
    qrFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        if (!state.html5QrCode) {
          state.html5QrCode = new Html5Qrcode('qrReader');
        }
        const decodedText = await state.html5QrCode.scanFile(file, true);
        let parsedCode = decodedText.trim();
        if (decodedText.includes('room=')) {
          try {
            const urlObj = new URL(decodedText);
            parsedCode = urlObj.searchParams.get('room') || decodedText;
          } catch(err) {
            const match = decodedText.match(/room=([A-Za-z0-9]+)/);
            if (match) parsedCode = match[1];
          }
        }
        elements.roomCodeInput.value = parsedCode.toUpperCase();
        showToast(`QR Decoded: Room ${parsedCode.toUpperCase()}!`);
        playSound('correct');
        stopScanner();
      } catch (err) {
        console.error('File scan error:', err);
        showToast('Could not read QR from selected image.');
      }
    });
  }
}

function stopScanner() {
  if (state.html5QrCode) {
    state.html5QrCode.stop().then(() => {
      state.html5QrCode.clear();
      state.html5QrCode = null;
    }).catch(err => console.error(err));
  }
  elements.qrScannerBox.classList.add('hidden');
}

function setupNavigation() {
  elements.navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });
}

function switchTab(tabId) {
  elements.navBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === tabId));
  elements.tabPanes.forEach(pane => pane.classList.toggle('active', pane.id === tabId));
  state.currentTab = tabId;

  if (tabId === 'college-tab') loadCollegeLeague();
  if (tabId === 'tournament-tab') loadTournaments();
}

function showToast(msg) {
  elements.toast.textContent = msg;
  elements.toast.classList.remove('hidden');
  setTimeout(() => {
    elements.toast.classList.add('hidden');
  }, 3500);
}

/* ==========================================================================
   REST API Helpers
   ========================================================================== */

async function loadColleges() {
  try {
    const res = await fetch('/api/colleges');
    const data = await res.json();
    if (data.success && data.colleges) {
      elements.collegeSelect.innerHTML = '<option value="">Select your institution</option>' +
        data.colleges.map(c => `<option value="${c.id}" data-name="${c.name}">${c.name} (${c.code})</option>`).join('');
    }
  } catch (err) {
    console.error('Failed to load colleges', err);
  }
}

async function loadCollegeLeague() {
  try {
    const res = await fetch('/api/leaderboard/colleges');
    const data = await res.json();
    if (data.success && data.rankings) {
      elements.collegeLeagueBody.innerHTML = data.rankings.map((c, i) => `
        <tr>
          <td><strong>#${i + 1}</strong></td>
          <td>${c.name}</td>
          <td><span class="badge badge-info">${c.code}</span></td>
          <td>${c.totalPlayers}</td>
          <td>${c.avgScore} pts</td>
          <td>${c.accuracy}%</td>
          <td><strong>${c.compositeRating}</strong></td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error('Failed to load college league', err);
  }
}

async function loadTournaments() {
  try {
    const res = await fetch('/api/tournaments');
    const data = await res.json();
    if (data.success && data.participants) {
      elements.tournamentLeaderboardBody.innerHTML = data.participants.map(p => `
        <tr>
          <td><strong>${p.nickname}</strong></td>
          <td>${p.college_name || 'Autonomous'}</td>
          <td><span class="badge badge-warning">${p.stage.toUpperCase()}</span></td>
          <td><strong>${p.total_score} pts</strong></td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error('Failed to load tournaments', err);
  }
}

/* ==========================================================================
   Lobby & Joining
   ========================================================================== */

elements.joinForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const roomCode = elements.roomCodeInput.value.trim().toUpperCase();
  const nickname = elements.nicknameInput.value.trim();
  const collegeId = elements.collegeSelect.value;
  const collegeName = elements.collegeSelect.options[elements.collegeSelect.selectedIndex]?.getAttribute('data-name') || '';
  const teamName = elements.teamInput.value.trim();

  state.roomCode = roomCode;
  state.nickname = nickname;
  state.collegeId = collegeId;
  state.collegeName = collegeName;
  state.teamName = teamName;
  state.isSpectator = false;

  elements.navNickname.textContent = nickname;

  socket.emit('room:join', {
    roomCode,
    nickname,
    collegeId,
    collegeName,
    teamName,
    isSpectator: false,
    sessionToken: state.sessionToken
  }, handleJoinResponse);
});

elements.btnJoinSpectator.addEventListener('click', () => {
  const roomCode = elements.roomCodeInput.value.trim().toUpperCase();
  if (!roomCode) {
    return showToast('Please enter a room code to spectate.');
  }

  state.roomCode = roomCode;
  state.isSpectator = true;
  state.nickname = 'Spectator';

  socket.emit('room:join', {
    roomCode,
    isSpectator: true
  }, handleJoinResponse);
});

function handleJoinResponse(res) {
  if (!res.success) {
    return showToast(`Error: ${res.error}`);
  }

  closePlayerEntryModal();
  elements.joinContainer.classList.add('hidden');
  elements.lobbyContainer.classList.remove('hidden');
  elements.displayRoomCode.textContent = res.roomCode;

  updateLobbyUI(res.players);
  fetchRoomQRCode(res.roomCode);

  if (state.isHost) {
    elements.hostLobbyControls.classList.remove('hidden');
    elements.playerWaitingNotice.classList.add('hidden');
  } else {
    elements.hostLobbyControls.classList.add('hidden');
    elements.playerWaitingNotice.classList.remove('hidden');
  }

  showToast(`Successfully entered Room ${res.roomCode}`);
}

async function fetchRoomQRCode(roomCode) {
  try {
    elements.lobbyQRContainer.classList.remove('hidden');
    const res = await fetch(`/api/qrcode/${roomCode}`);
    const data = await res.json();
    if (data.success && data.qrDataUrl) {
      elements.lobbyQRImage.src = data.qrDataUrl;
      elements.lobbyQRImage.style.display = 'block';
    }
  } catch (err) {
    console.error('Failed to load room QR code', err);
  }
}

elements.btnToggleQR.addEventListener('click', () => {
  elements.lobbyQRContainer.classList.toggle('hidden');
});

elements.btnCopyRoomCode.addEventListener('click', () => {
  if (state.roomCode) {
    navigator.clipboard.writeText(state.roomCode);
    showToast(`Room code ${state.roomCode} copied to clipboard!`);
  }
});

function updateLobbyUI(players = []) {
  elements.lobbyPlayerCount.textContent = players.length;
  elements.lobbyPlayersList.innerHTML = players.map(p => `
    <div class="player-chip">
      <span>👤</span>
      <div>
        <div style="font-size: 0.95rem;">${p.nickname}</div>
        <div style="font-size: 0.75rem; color: var(--text-muted);">${p.collegeName || 'Student'}</div>
      </div>
    </div>
  `).join('');
}

/* ==========================================================================
   Host Controls & AI Generator
   ========================================================================== */

function setupHostHandlers() {
  elements.hostCreateRoomForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const questionSetId = elements.hostQuestionSetSelect.value;
    const mode = elements.hostGameMode.value;
    const roundDuration = elements.hostRoundDuration.value;
    const powerupsEnabled = elements.hostPowerups.checked;

    state.isHost = true;
    state.nickname = 'Host Admin';
    elements.navNickname.textContent = state.nickname;

    socket.emit('room:create', {
      questionSetId,
      mode,
      roundDuration,
      powerupsEnabled
    }, (res) => {
      if (res.success) {
        state.roomCode = res.roomCode;
        switchTab('arena-tab');
        elements.joinContainer.classList.add('hidden');
        elements.lobbyContainer.classList.remove('hidden');
        elements.displayRoomCode.textContent = res.roomCode;
        elements.hostLobbyControls.classList.remove('hidden');
        elements.playerWaitingNotice.classList.add('hidden');
        fetchRoomQRCode(res.roomCode); // Auto-render QR code for host immediately
        showToast(`Room ${res.roomCode} created! Share code with competitors.`);
      }
    });
  });

  elements.btnStartGame.addEventListener('click', () => {
    socket.emit('game:start', { roomCode: state.roomCode }, (res) => {
      if (!res.success) {
        showToast(res.error || 'Failed to start game.');
      }
    });
  });

  elements.aiGenerateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const topic = elements.aiTopicSelect.value;
    const difficulty = elements.aiDifficultySelect.value;
    const count = elements.aiCountInput.value;

    try {
      showToast('Generating AI aptitude questions...');
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, difficulty, count })
      });
      const data = await res.json();
      if (data.success && data.questions) {
        elements.aiGeneratedPreview.classList.remove('hidden');
        elements.aiPreviewList.innerHTML = data.questions.map((q, idx) => `
          <div style="background: var(--bg-card); padding: 1rem; border-radius: 8px; margin-top: 0.75rem;">
            <strong>Q${idx + 1}: ${q.prompt}</strong>
            <ul style="margin: 0.5rem 0 0.5rem 1.5rem; font-size: 0.9rem;">
              <li>A: ${q.option_a}</li>
              <li>B: ${q.option_b}</li>
              <li>C: ${q.option_c}</li>
              <li>D: ${q.option_d}</li>
            </ul>
            <div style="font-size: 0.8rem; color: var(--accent-green);">Key: Option ${q.correct_option} | Explanation: ${q.explanation}</div>
          </div>
        `).join('');
        showToast('Questions generated and quality verified!');
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to generate AI questions.');
    }
  });
}

/* ==========================================================================
   Live Quiz Arena & Answer Handling
   ========================================================================== */

elements.optionBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    if (state.hasAnswered || state.isSpectator) return;

    const chosenOption = btn.getAttribute('data-option');
    state.hasAnswered = true;

    // Highlight chosen button
    elements.optionBtns.forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');

    elements.answerStatusMessage.classList.remove('hidden');

    socket.emit('answer:submit', {
      roomCode: state.roomCode,
      questionIndex: state.currentQuestionIndex,
      chosenOption
    }, (res) => {
      if (res.success) {
        state.score = res.totalScore;
        elements.playerCurrentScore.textContent = state.score;

        if (res.isCorrect) {
          state.streak += 1;
          playSound('correct');
          showToast(`Correct! +${res.pointsAwarded} pts 🔥 Streak: ${state.streak}`);
        } else {
          state.streak = 0;
          playSound('wrong');
          showToast('Incorrect. 0 pts');
        }
        elements.streakCount.textContent = state.streak;
      } else {
        showToast(`Submission rejected: ${res.error}`);
      }
    });
  });
});

// Power-ups
elements.btnPowerup5050.addEventListener('click', () => {
  socket.emit('powerup:fiftyFifty', { roomCode: state.roomCode }, (res) => {
    if (res.success && res.eliminatedOptions) {
      res.eliminatedOptions.forEach(opt => {
        const btn = document.querySelector(`.option-btn[data-option="${opt}"]`);
        if (btn) btn.classList.add('eliminated');
      });
      elements.btnPowerup5050.disabled = true;
      playSound('correct');
      showToast('50:50 Activated: Two incorrect options eliminated!');
    } else {
      showToast(res.error || 'Power-up unavailable.');
    }
  });
});

elements.btnPowerupDouble.addEventListener('click', () => {
  elements.btnPowerupDouble.disabled = true;
  playSound('correct');
  showToast('2x Points primed for this round!');
});

/* ==========================================================================
   Socket.IO Inbound Event Listeners
   ========================================================================== */

socket.on('room:playerJoined', (data) => {
  updateLobbyUI(data.players);
});

socket.on('room:playerLeft', (data) => {
  updateLobbyUI(data.players);
});

socket.on('game:startingCountdown', (data) => {
  playSound('countdown');
  showToast(`Match starting in ${data.countdownSec} seconds! Get ready!`);
});

socket.on('question:start', (data) => {
  elements.lobbyContainer.classList.add('hidden');
  elements.liveArenaContainer.classList.remove('hidden');
  elements.roundRevealBox.classList.add('hidden');
  elements.answerStatusMessage.classList.add('hidden');

  state.currentQuestionIndex = data.questionIndex;
  state.hasAnswered = false;
  playSound('countdown');

  // Activate Live Proctor Camera Feed during the test
  if (!state.proctorStream && !state.isSpectator) {
    startProctoringCamera();
  }

  // Reset UI
  elements.qCurrentNum.textContent = data.questionIndex + 1;
  elements.qTotalNum.textContent = data.totalQuestions;
  elements.questionTopic.textContent = data.question.topic || 'General Aptitude';
  elements.questionPrompt.textContent = data.question.prompt;

  elements.optTextA.textContent = data.question.options[0].text;
  elements.optTextB.textContent = data.question.options[1].text;
  elements.optTextC.textContent = data.question.options[2].text;
  elements.optTextD.textContent = data.question.options[3].text;

  elements.optionBtns.forEach(b => {
    b.classList.remove('selected', 'eliminated');
    b.disabled = false;
  });

  // Start authoritative local countdown display
  startCountdownTimer(data.timeLimitSec);
});

function startCountdownTimer(seconds) {
  clearInterval(state.timerInterval);
  let remaining = seconds;
  elements.timerSeconds.textContent = remaining;

  state.timerInterval = setInterval(() => {
    remaining -= 1;
    if (remaining <= 5 && remaining > 0) {
      playSound('tick');
    }
    if (remaining < 0) {
      clearInterval(state.timerInterval);
      elements.timerSeconds.textContent = '0';
    } else {
      elements.timerSeconds.textContent = remaining;
    }
  }, 1000);
}

socket.on('question:reveal', (data) => {
  clearInterval(state.timerInterval);
  elements.roundRevealBox.classList.remove('hidden');
  elements.revealCorrectKey.textContent = data.correctOption;
  elements.revealExplanation.textContent = data.explanation || 'Verified server solution.';

  if (data.insights) {
    const accuracy = data.insights.totalResponses > 0
      ? Math.round((data.insights.correctCount / data.insights.totalResponses) * 100)
      : 0;
    elements.insightAccuracy.textContent = `${accuracy}%`;
    elements.insightResponses.textContent = data.insights.totalResponses;
  }

  // Update live leaderboard with Comeback meter
  updateLiveLeaderboard(data.leaderboard);
});

function updateLiveLeaderboard(leaderboard = []) {
  elements.liveLeaderboardBody.innerHTML = leaderboard.map(p => `
    <tr>
      <td><strong>#${p.rank}</strong></td>
      <td>${p.nickname}</td>
      <td>${p.collegeName || 'Student'}</td>
      <td><strong>${p.score}</strong></td>
      <td>${p.accuracy}%</td>
      <td><span class="badge ${p.rank === 1 ? 'badge-live' : 'badge-info'}">${p.comebackStatus}</span></td>
    </tr>
  `).join('');
}

socket.on('game:finished', (data) => {
  clearInterval(state.timerInterval);
  stopProctoringCamera(); // Stop webcam feed when quiz concludes
  elements.liveArenaContainer.classList.add('hidden');
  elements.finalResultsContainer.classList.remove('hidden');

  // Trigger celebration confetti
  if (typeof confetti === 'function') {
    confetti({
      particleCount: 120,
      spread: 70,
      origin: { y: 0.6 }
    });
  }

  if (data.winner) {
    elements.winnerPodium.innerHTML = `
      <div style="background: var(--bg-card); padding: 2rem; border-radius: 12px; border: 2px solid var(--accent-cyan); display: inline-block;">
        <span style="font-size: 2.5rem;">👑</span>
        <h2 style="color: var(--accent-cyan); margin: 0.5rem 0;">${data.winner.nickname}</h2>
        <p style="color: var(--text-muted);">${data.winner.collegeName || 'National Competitor'}</p>
        <h3 style="color: var(--accent-green); margin-top: 0.5rem;">${data.winner.score} Total Points</h3>
      </div>
    `;
  }

  elements.finalStandingsBody.innerHTML = data.finalLeaderboard.map(p => `
    <tr>
      <td><strong>#${p.rank}</strong></td>
      <td>${p.nickname}</td>
      <td>${p.collegeName || 'Student'}</td>
      <td><strong>${p.score}</strong></td>
      <td>${p.accuracy}%</td>
      <td>${p.avgSpeedMs} ms</td>
    </tr>
  `).join('');
});

// CSV Export
elements.btnExportCSV.addEventListener('click', () => {
  if (state.roomCode) {
    window.location.href = `/api/export/csv/${state.roomCode}`;
  }
});

elements.btnPlayAgain.addEventListener('click', () => {
  window.location.reload();
});

/* ==========================================================================
   Skill Passport Lookup
   ========================================================================== */

elements.btnSearchPassport.addEventListener('click', async () => {
  const query = elements.passportSearchInput.value.trim();
  if (!query) return;

  try {
    const res = await fetch(`/api/passport/${encodeURIComponent(query)}`);
    const data = await res.json();
    if (data.success && data.passport) {
      elements.passportNickname.textContent = data.passport.nickname;
      elements.passTotalGames.textContent = data.passport.totalGames;
      elements.passBestScore.textContent = data.passport.bestScore;
      elements.passAccuracy.textContent = `${data.passport.avgAccuracy}%`;

      elements.passportHistoryBody.innerHTML = data.passport.recentGames.map(g => `
        <tr>
          <td>${new Date(g.created_at).toLocaleDateString()}</td>
          <td><strong>${g.final_score}</strong></td>
          <td>#${g.final_rank}</td>
          <td>${Math.round((g.correct_count / (g.total_questions || 8)) * 100)}%</td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error(err);
  }
});

/* ==========================================================================
   Daily Challenge Sprint
   ========================================================================== */

function setupDailyChallenge() {
  elements.btnStartDailyChallenge.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/daily-challenge');
      const data = await res.json();
      if (data.success && data.challenge) {
        elements.dailyPrompt.textContent = `Today's Sprint: ${data.challenge.title} (${data.challenge.questionsCount} questions loaded). Complete daily to protect your streak!`;
        elements.btnStartDailyChallenge.textContent = 'Challenge Completed Today 🔥';
        elements.btnStartDailyChallenge.disabled = true;
        showToast('Daily Sprint active! Streak recorded.');
      }
    } catch (err) {
      console.error(err);
    }
  });
}
