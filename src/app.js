// ================================
// SILENT VOICE AR - MEDIAPIPE HANDS
// ================================

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const gestureLabel = document.getElementById('gestureLabel');
const translationText = document.getElementById('translationText');
const modeBtn = document.getElementById('modeBtn');
const modeLabel = document.getElementById('modeLabel');
let currentMode = 'deaf-to-hearing';
let lastGesture = '';
let lastGestureTime = 0;
const GESTURE_COOLDOWN = 2000; // 2 seconds
let gestureBuffer = [];
const BUFFER_SIZE = 20; // frames to confirm

// --- ISL GESTURE DICTIONARY ---
const ISL_GESTURES = {
  'open_hand':     '🙏 Hello / Namaste',
  'fist':          '✋ No / Stop',
  'pointing_up':   '☝️ Yes / Correct',
  'thumbs_up':     '👍 Good / Thank you',
  'peace':         '✌️ Help me',
  'pinch':         '🤏 Pain / Hurts here',
  'three_fingers': '💧 Water / I am thirsty',
  'four_fingers':  '💊 Medicine needed',
  'ok_sign':       '👌 I understand',
};

// ================================
// SETUP CANVAS SIZE
// ================================
canvas.width = 640;
canvas.height = 480;

// ================================
// MEDIAPIPE HANDS SETUP
// ================================
const hands = new Hands({
  locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
  }
});

hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.7,
  minTrackingConfidence: 0.5
});

// ================================
// PROCESS FRAME
// ================================
hands.onResults((results) => {
  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw camera feed on canvas first
  ctx.save();
  ctx.scale(-1, 1); // mirror the image
  ctx.translate(-canvas.width, 0);
  ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
  ctx.restore();

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const landmarks = results.multiHandLandmarks[0];

    // Draw AR skeleton
    drawConnectors(ctx, landmarks, HAND_CONNECTIONS, {
      color: 'rgba(0, 212, 255, 0.7)',
      lineWidth: 3
    });
    drawLandmarks(ctx, landmarks, {
      color: '#00d4ff',
      lineWidth: 1,
      radius: 5
    });

    // Recognize gesture
    const gesture = recognizeGesture(landmarks);
    const gesture = recognizeGesture(landmarks);

    // Add to buffer
    gestureBuffer.push(gesture);
    if (gestureBuffer.length > BUFFER_SIZE) {
    gestureBuffer.shift(); // remove oldest
    }

    // Only confirm if last 20 frames show SAME gesture
    const allSame = gestureBuffer.every(g => g === gesture);
    const now = Date.now();

    if (
    gesture &&
    allSame &&
    gesture !== lastGesture &&
    (now - lastGestureTime) > GESTURE_COOLDOWN
    ) {
    lastGesture = gesture;
    lastGestureTime = now;
    updateTranslation(gesture);
    }

    gestureLabel.textContent = `✋ Hand detected — gesture: ${lastGesture || 'analyzing...'}`;

  } else {
    gestureLabel.textContent = '👋 Show your hand to camera...';
    lastGesture = '';
  }
});

// ================================
// START CAMERA
// ================================
// Set canvas size to match window
canvas.width = window.innerWidth > 600 ? 640 : window.innerWidth - 40;
canvas.height = canvas.width * 0.75;

const camera = new Camera(video, {
  onFrame: async () => {
    await hands.send({ image: video });
  },
  width: 640,
  height: 480
});

camera.start()
  .then(() => {
    gestureLabel.textContent = '✅ Camera ready! Show your hand...';
    console.log('Camera started!');
  })
  .catch((err) => {
    console.error('Camera error:', err);
    gestureLabel.textContent = '❌ Camera error: ' + err.message;
  });

// ================================
// RECOGNIZE GESTURE FROM LANDMARKS
// ================================
function recognizeGesture(landmarks) {
  // MediaPipe landmarks are normalized 0-1
  // landmarks[i].y — smaller = higher on screen

  const wrist      = landmarks[0];
  const thumbTip   = landmarks[4];
  const indexBase  = landmarks[5];
  const indexTip   = landmarks[8];
  const middleBase = landmarks[9];
  const middleTip  = landmarks[12];
  const ringBase   = landmarks[13];
  const ringTip    = landmarks[16];
  const pinkyBase  = landmarks[17];
  const pinkyTip   = landmarks[20];

  // Finger extended = tip ABOVE base (smaller Y value)
  const indexUp  = indexTip.y  < indexBase.y  - 0.04;
  const middleUp = middleTip.y < middleBase.y - 0.04;
  const ringUp   = ringTip.y   < ringBase.y   - 0.04;
  const pinkyUp  = pinkyTip.y  < pinkyBase.y  - 0.04;
  const thumbUp  = Math.abs(thumbTip.x - wrist.x) > 0.1;

  console.log('Fingers up:', { indexUp, middleUp, ringUp, pinkyUp, thumbUp });

  // Gesture rules
  if (indexUp && middleUp && ringUp && pinkyUp)              return 'open_hand';
  if (!indexUp && !middleUp && !ringUp && !pinkyUp)          return 'fist';
  if (indexUp && !middleUp && !ringUp && !pinkyUp)           return 'pointing_up';
  if (indexUp && middleUp && !ringUp && !pinkyUp)            return 'peace';
  if (indexUp && middleUp && ringUp && !pinkyUp)             return 'three_fingers';
  if (indexUp && middleUp && ringUp && pinkyUp && !thumbUp)  return 'four_fingers';
  if (thumbUp && !indexUp && !middleUp && !ringUp && !pinkyUp) return 'thumbs_up';

  return null;
}

// ================================
// UPDATE UI
// ================================
function updateTranslation(gestureKey) {
  const translation = ISL_GESTURES[gestureKey];
  if (translation) {
    translationText.textContent = translation;
    if (currentMode === 'deaf-to-hearing') {
      setTimeout(() => speakText(), 500);
    }
  }
}

// ================================
// SPEAK TEXT
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
    modeBtn.textContent = 'Mode: Hearing → Deaf';
    modeBtn.classList.add('active');
    modeLabel.textContent = 'Hearing person speaks → Deaf person sees signs';
  } else {
    currentMode = 'deaf-to-hearing';
    modeBtn.textContent = 'Mode: Deaf → Hearing';
    modeBtn.classList.remove('active');
    modeLabel.textContent = 'Deaf person signs → Hearing person reads';
  }
}

// ================================
// BUTTON LISTENERS
// ================================
document.getElementById('speakBtn').addEventListener('click', speakText);
document.getElementById('modeBtn').addEventListener('click', toggleMode);