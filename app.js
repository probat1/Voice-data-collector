import { db, storage } from './firebase-config.js';
import { collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';

// DOM Elements
const sampleForm = document.getElementById('sampleForm');
const nameInput = document.getElementById('name');
const targetWordInput = document.getElementById('targetWord');
const recordBtn = document.getElementById('recordBtn');
const progressRing = document.querySelector('.progress-ring');
const progressRingFg = document.querySelector('.progress-ring .fg');
const countdownNumber = document.getElementById('countdownNumber');
const helperText = document.getElementById('helperText');
const playerContainer = document.getElementById('playerContainer');
const noiseToggleRow = document.getElementById('noiseToggleRow');
const noiseToggleInput = document.getElementById('noiseToggle');
const submitBtn = document.getElementById('submitBtn');
const statusMsg = document.getElementById('statusMsg');

// State
let mediaRecorder = null;
let audioChunks = [];
let recordedBlob = null;
let recordingTimeout = null;
let countdownInterval = null;

// MIME type detection (cross-browser safety)
function pickMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus'
  ];
  return candidates.find(t => MediaRecorder.isTypeSupported(t)) || '';
}

// Recording flow
async function startRecording() {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false }
    });
  } catch (err) {
    showStatus('Microphone access is required to record a sample. Enable it in your browser settings and try again.', 'error');
    return;
  }

  audioChunks = [];
  const mimeType = pickMimeType();
  mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

  mediaRecorder.ondataavailable = e => {
    if (e.data.size > 0) {
      audioChunks.push(e.data);
    }
  };

  mediaRecorder.onstop = () => {
    recordedBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
    stream.getTracks().forEach(t => t.stop());

    // Reset recording UI
    recordBtn.classList.remove('is-recording');
    recordBtn.disabled = false;
    progressRing.classList.add('hidden');
    countdownNumber.classList.add('hidden');
    helperText.classList.remove('is-visible');

    // Reset ring stroke-dashoffset without animation
    progressRingFg.style.transition = 'none';
    progressRingFg.style.strokeDashoffset = '439.8';
    setTimeout(() => {
      progressRingFg.style.transition = 'stroke-dashoffset 15s linear';
    }, 50);

    renderAudioPlayer(recordedBlob);
    updateSubmitState();
  };

  mediaRecorder.start();
  recordBtn.classList.add('is-recording');
  recordBtn.disabled = true;
  progressRing.classList.remove('hidden');
  countdownNumber.classList.remove('hidden');

  setTimeout(() => {
    helperText.classList.add('is-visible');
  }, 300);

  startCountdownUI(15);

  // Hard stop — exactly 15,000ms, no early-exit path other than this timer
  recordingTimeout = setTimeout(() => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
  }, 15000);
}

function startCountdownUI(seconds) {
  progressRingFg.style.strokeDashoffset = '0'; // triggers the 15s CSS transition from full → empty
  countdownNumber.textContent = seconds;

  countdownInterval = setInterval(() => {
    seconds -= 1;
    countdownNumber.textContent = Math.max(seconds, 0);
    if (seconds <= 0) {
      clearInterval(countdownInterval);
    }
  }, 1000);
}

// Audio playback
function renderAudioPlayer(blob) {
  const url = URL.createObjectURL(blob);
  playerContainer.innerHTML = `<audio controls src="${url}"></audio>`;
  noiseToggleRow.classList.remove('hidden');
}

// Form validation -> submit button state
function updateSubmitState() {
  const valid = nameInput.value.trim() && targetWordInput.value.trim() && recordedBlob;
  submitBtn.disabled = !valid;
}

[nameInput, targetWordInput].forEach(el => {
  el.addEventListener('input', updateSubmitState);
});

recordBtn.addEventListener('click', startRecording);

// Submit -> Firebase
sampleForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!recordedBlob) return;

  setSubmitting(true);
  try {
    const category = document.querySelector('input[name="category"]:checked').value;
    const name = nameInput.value.trim();
    const targetWord = targetWordInput.value.trim();
    const hasNoise = noiseToggleInput.checked;
    const ext = (recordedBlob.type.split('/')[1] || 'webm').split(';')[0];
    const safe = s => s.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const path = `recordings/${safe(name)}_${safe(targetWord)}_${Date.now()}.${ext}`;

    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, recordedBlob, { contentType: recordedBlob.type });
    const audioUrl = await getDownloadURL(storageRef);

    await addDoc(collection(db, 'voiceSamples'), {
      name,
      targetWord,
      category,
      hasBackgroundNoise: hasNoise,
      audioUrl,
      audioPath: path,
      mimeType: recordedBlob.type,
      durationMs: 15000,
      createdAt: serverTimestamp(),
    });

    showStatus('Sample submitted. Thank you — you can record another one.', 'success');
    resetForm();
  } catch (err) {
    console.error(err);
    showStatus('Something went wrong uploading your sample. Please try again.', 'error');
  } finally {
    setSubmitting(false);
  }
});

function setSubmitting(isSubmitting) {
  submitBtn.disabled = isSubmitting;
  if (isSubmitting) {
    submitBtn.innerHTML = `<div class="spinner"></div><span>Uploading…</span>`;
  } else {
    submitBtn.innerHTML = 'Submit Data';
  }
}

function resetForm() {
  nameInput.value = '';
  targetWordInput.value = '';
  document.getElementById('categoryTrigger').checked = true;
  playerContainer.innerHTML = '';
  recordedBlob = null;
  noiseToggleRow.classList.add('hidden');
  noiseToggleInput.checked = false;
  updateSubmitState();
}

function showStatus(message, type) {
  statusMsg.textContent = message;
  statusMsg.className = `mt-4 text-center text-sm ${type}`;

  if (type === 'success') {
    setTimeout(() => {
      statusMsg.textContent = '';
      statusMsg.className = 'mt-4 text-center text-sm';
    }, 6000);
  }
}
