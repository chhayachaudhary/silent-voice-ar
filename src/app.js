// ================================
// SILENTVOICE AR — COMPLETE APP
// ================================

// --- HTML Elements ---
const video           = document.getElementById('video');
const canvas          = document.getElementById('output_canvas');
const ctx             = canvas.getContext('2d');
const gestureLabel    = document.getElementById('gestureLabel');
const translationText = document.getElementById('translationText');
const progressBar     = document.getElementById('progressBar');
const modeBtn         = document.getElementById('modeBtn');
const modeLabel       = document.getElementById('modeLabel');
const speakBtn        = document.getElementById('speakBtn');
const statusDot       = document.getElementById('statusDot');
const confidenceBadge = document.getElementById('confidenceBadge');
const clearBtn        = document.getElementById('clearBtn');
const loadingOverlay  = document.getElementById('loadingOverlay');

// Force hide loading after 5 seconds no matter what
setTimeout(() => {
  loadingOverlay.classList.add('hidden');
}, 5000);

// --- State ---
let currentMode     = 'deaf-to-hearing';
let lastGesture     = '';
let lastGestureTime = 0;
let gestureBuffer   = [];
const BUFFER_SIZE   = 20;
const COOLDOWN_MS   = 2000;

// --- ISL Dictionary ---
const ISL_GESTURES = {
  open_hand:     '🙏 Hello / Namaste',
  fist:          '✋ No / Stop',
  pointing_up:   '☝️ Yes / I agree',
  thumbs_up:     '👍 Good / Thank you',
  peace:         '✌️ Help me',
  three_fingers: '💧 Water / Thirsty',
  four_fingers:  '💊 Medicine needed',
  ok_sign:       '👌 I understand / OK',
  pinch:         '🤏 Pain / Hurts here',
  call_me:       '🤙 Call my family',
};

// ================================
// MEDIAPIPE SETUP
// ================================
const hands = new Hands({
  locateFile: file =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.75,
  minTrackingConfidence: 0.5,
});

// ================================
// PROCESS EACH FRAME
// ================================
hands.onResults(results => {
  const w = canvas.width;
  const h = canvas.height;

  // 1) Clear
  ctx.clearRect(0, 0, w, h);

  // 2) Draw LIVE mirrored video
  ctx.save();
  ctx.scale(-1, 1);
  ctx.translate(-w, 0);
  ctx.drawImage(results.image, 0, 0, w, h);
  ctx.restore();

  // 3) Hand detected?
  if (results.multiHandLandmarks?.length > 0) {
    const lm = results.multiHandLandmarks[0];

    // Mirror landmarks for display
    const mirrored = lm.map(p => ({ x: 1 - p.x, y: p.y, z: p.z }));

    // Draw AR skeleton
    drawConnectors(ctx, mirrored, HAND_CONNECTIONS, {
      color: 'rgba(45, 212, 191, 0.8)', lineWidth: 3
    });
    drawLandmarks(ctx, mirrored, {
      color: '#2dd4bf', lineWidth: 1, radius: 4
    });

    // Recognize gesture
    const gesture = recognizeGesture(lm);
    updateBuffer(gesture);

  } else {
    gestureLabel.textContent = 'Show your hand to camera...';
    gestureBuffer = [];
    progressBar.style.width = '0%';
    statusDot.classList.remove('active');
    confidenceBadge.textContent = 'Scanning...';
    confidenceBadge.classList.remove('high');
  }
});

// ================================
// CAMERA
// ================================
const camera = new Camera(video, {
  onFrame: async () => {
    if (video.videoWidth) {
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    await hands.send({ image: video });
  },
  width: 640,
  height: 480,
});

camera.start()
  .then(() => {
    gestureLabel.textContent = 'Show your hand to camera...';
    setTimeout(() => {
      loadingOverlay.classList.add('hidden');
    }, 1000);
  })
  .catch(err => {
    gestureLabel.textContent = '❌ Camera error: ' + err.message;
    loadingOverlay.classList.add('hidden');
  });

// ================================
// GESTURE BUFFER + COOLDOWN
// ================================
function updateBuffer(gesture) {
  gestureBuffer.push(gesture);
  if (gestureBuffer.length > BUFFER_SIZE) gestureBuffer.shift();

  const allSame = gestureBuffer.length === BUFFER_SIZE &&
                  gestureBuffer.every(g => g === gesture);

  const progress =
    (gestureBuffer.filter(g => g === gesture).length / BUFFER_SIZE) * 100;
  progressBar.style.width = progress + '%';

  const now = Date.now();
  if (
    gesture &&
    allSame &&
    gesture !== lastGesture &&
    now - lastGestureTime > COOLDOWN_MS
  ) {
    lastGesture     = gesture;
    lastGestureTime = now;
    progressBar.style.width = '0%';
    showTranslation(gesture);
  }

  gestureLabel.textContent =
    `✋ Detected: ${gesture || 'analyzing...'} — confirmed: ${lastGesture || 'none'}`;
}

// ================================
// RECOGNIZE GESTURE
// ================================
function recognizeGesture(lm) {
  const isUp = (tipIdx, baseIdx) =>
    lm[tipIdx].y < lm[baseIdx].y - 0.02;

  const distance = (a, b) => Math.sqrt(
    Math.pow(lm[a].x - lm[b].x, 2) +
    Math.pow(lm[a].y - lm[b].y, 2)
  );

  const indexUp  = isUp(8,  5);
  const middleUp = isUp(12, 9);
  const ringUp   = isUp(16, 13);
  const pinkyUp  = isUp(20, 17);
  const thumbOut = Math.abs(lm[4].x - lm[0].x) > 0.1;

  const thumbIndexDist = distance(4, 8);
  const isOkSign  = thumbIndexDist < 0.08 && middleUp && ringUp && pinkyUp;
  const isPinch   = thumbIndexDist < 0.08 && !middleUp && !ringUp && !pinkyUp;
  const isCallMe  = thumbOut && pinkyUp && !indexUp && !middleUp && !ringUp;

  // Order matters — specific checks first!
  if (isOkSign)  return 'ok_sign';
  if (isPinch)   return 'pinch';
  if (isCallMe)  return 'call_me';

  if ( indexUp &&  middleUp &&  ringUp &&  pinkyUp) return 'open_hand';
  if (!indexUp && !middleUp && !ringUp && !pinkyUp) return 'fist';
  if ( indexUp && !middleUp && !ringUp && !pinkyUp) return 'pointing_up';
  if ( indexUp &&  middleUp && !ringUp && !pinkyUp) return 'peace';
  if ( indexUp &&  middleUp &&  ringUp && !pinkyUp) return 'three_fingers';
  if ( indexUp &&  middleUp &&  ringUp &&  pinkyUp && !thumbOut) return 'four_fingers';
  if (!indexUp && !middleUp && !ringUp && !pinkyUp &&  thumbOut) return 'thumbs_up';

  return null;
}

// ================================
// SHOW TRANSLATION
// ================================
function showTranslation(gestureKey) {
  const text = ISL_GESTURES[gestureKey];
  if (!text) return;

  // Animate text change
  translationText.classList.remove('updated');
  void translationText.offsetWidth;
  translationText.textContent = text;
  translationText.classList.add('updated');

  // Update UI state
  statusDot.classList.add('active');
  confidenceBadge.textContent = '● Confirmed';
  confidenceBadge.classList.add('high');

  if (currentMode === 'deaf-to-hearing') {
    setTimeout(speakText, 400);
  }
}

// ================================
// SPEAK
// ================================
function speakText() {
  const text = translationText.textContent;
  if (!text || text === '—') return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-IN';
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
}

// ================================
// TOGGLE MODE
// ================================
function toggleMode() {
  if (currentMode === 'deaf-to-hearing') {
    currentMode = 'hearing-to-deaf';
    modeBtn.textContent = 'Hearing → Deaf';
    modeBtn.classList.add('active');
    modeLabel.textContent = 'Hearing person speaks → Deaf person sees signs';
  } else {
    currentMode = 'deaf-to-hearing';
    modeBtn.textContent = 'Deaf → Hearing';
    modeBtn.classList.remove('active');
    modeLabel.textContent = 'Deaf person signs → Hearing person reads';
  }
}

// ================================
// BUTTON LISTENERS
// ================================
speakBtn.addEventListener('click', () => {
  speakText();
  speakBtn.classList.add('speaking');
  speakBtn.textContent = '🔊 Speaking...';
  setTimeout(() => {
    speakBtn.classList.remove('speaking');
    speakBtn.innerHTML = '🔊 Speak Translation';
  }, 2000);
});

modeBtn.addEventListener('click', toggleMode);

clearBtn.addEventListener('click', () => {
  translationText.textContent = '—';
  gestureLabel.textContent = 'Show your hand to camera...';
  lastGesture = '';
  statusDot.classList.remove('active');
  confidenceBadge.textContent = 'Scanning...';
  confidenceBadge.classList.remove('high');
  progressBar.style.width = '0%';
});