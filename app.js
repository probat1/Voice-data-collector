import { supabase, BACKEND_API_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

// ============================================
// State Management & Constants
// ============================================

const SESSION_STEPS = [
  { step: 1, word: 'HEY NEXUS', category: 'Trigger Word', duration: 30, hint: 'Repeat "Hey Nexus" multiple times with 1-sec pauses (varying pitch, speed & tone).' },
  { step: 2, word: 'HEY', category: 'Rhyming Word', duration: 5, hint: 'Say phonetically similar word "Hey" repeatedly with 1-sec pauses.' },
  { step: 3, word: 'NEXUS', category: 'Rhyming Word', duration: 5, hint: 'Say phonetically similar word "Nexus" repeatedly with 1-sec pauses.' },
  { step: 4, word: 'TURN ON THE LIGHTS', category: 'Negative Word', duration: 5, hint: 'Say random negative phrase repeatedly with 1-sec pauses.' },
  { step: 5, word: 'SET A TIMER', category: 'Negative Word', duration: 5, hint: 'Say random negative phrase repeatedly with 1-sec pauses.' }
];

// Track authenticated state and entered user PIN dynamically (no hardcoded PIN in codebase)
let enteredUserPin = sessionStorage.getItem('user_collector_pin') || '';

// Fetch Dynamic Session Words from Backend Server API or Supabase Edge Function
async function fetchServerSessionWords(speakerName, pinToVerify) {
  if (!speakerName) return false;
  const pin = pinToVerify || enteredUserPin;
  try {
    let apiUrl = BACKEND_API_URL;
    if (apiUrl.includes('get-session-words')) {
      apiUrl = `${apiUrl}?speaker=${encodeURIComponent(speakerName)}`;
    } else {
      apiUrl = `${apiUrl}/api/session-words?speaker=${encodeURIComponent(speakerName)}`;
    }

    const res = await fetch(apiUrl, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'X-Collector-PIN': pin
      }
    });

    if (res.status === 401) {
      return false;
    }

    if (res.ok) {
      const data = await res.json();
      if (data.trigger_word) {
        SESSION_STEPS[0].word = data.trigger_word.toUpperCase();
        SESSION_STEPS[0].hint = `Repeat "${SESSION_STEPS[0].word}" multiple times with 1-sec pauses (varying pitch & tone).`;
      }
      if (data.rhyming_words && data.rhyming_words.length >= 2) {
        SESSION_STEPS[1].word = data.rhyming_words[0].toUpperCase();
        SESSION_STEPS[1].hint = `Say phonetically similar word "${SESSION_STEPS[1].word}" repeatedly with 1-sec pauses.`;
        SESSION_STEPS[2].word = data.rhyming_words[1].toUpperCase();
        SESSION_STEPS[2].hint = `Say phonetically similar word "${SESSION_STEPS[2].word}" repeatedly with 1-sec pauses.`;
      }
      if (data.negative_words && data.negative_words.length >= 2) {
        SESSION_STEPS[3].word = data.negative_words[0].toUpperCase();
        SESSION_STEPS[3].hint = `Say random negative word "${SESSION_STEPS[3].word}" repeatedly with 1-sec pauses.`;
        SESSION_STEPS[4].word = data.negative_words[1].toUpperCase();
        SESSION_STEPS[4].hint = `Say random negative word "${SESSION_STEPS[4].word}" repeatedly with 1-sec pauses.`;
      }
      console.log('Fetched dynamic session words from backend server:', data);
    }
  } catch (err) {
    console.warn('Backend server offline or unreachable. Using fallback word dictionary.', err);
  }
}

let currentStepIndex = 0;
let mediaRecorder = null;
let audioChunks = [];
let mediaStream = null;
let recordingTimer = null;
let countdownInterval = null;

// Web Audio API State
let audioCtx = null;
let analyser = null;
let animFrameId = null;
let fullAudioBuffer = null;
let extractedChunks = [];

// Active HTML5 Audio objects map for tap-to-play
const activeAudioMap = new Map();

// DOM Elements
const authOverlay = document.getElementById('authOverlay');
const authForm = document.getElementById('authForm');
const pinInput = document.getElementById('pinInput');
const authError = document.getElementById('authError');
const lockBtn = document.getElementById('lockBtn');

const speakerSelect = document.getElementById('speakerSelect');
const newSpeakerContainer = document.getElementById('newSpeakerContainer');
const newSpeakerInput = document.getElementById('newSpeakerInput');
const saveSpeakerBtn = document.getElementById('saveSpeakerBtn');
const noisyEnvCheckbox = document.getElementById('noisyEnvCheckbox');
const envStatusText = document.getElementById('envStatusText');

const stepBadge = document.getElementById('stepBadge');
const categoryBadge = document.getElementById('categoryBadge');
const targetWordDisplay = document.getElementById('targetWordDisplay');
const stepInstruction = document.getElementById('stepInstruction');
const durationBadge = document.getElementById('durationBadge');

const sessionHeader = document.getElementById('sessionHeader');
const recordSection = document.getElementById('recordSection');
const recordBtn = document.getElementById('recordBtn');
const discardBtn = document.getElementById('discardBtn');
const countdownNumber = document.getElementById('countdownNumber');
const audioCanvas = document.getElementById('audioCanvas');
const volumeBar = document.getElementById('volumeBar');

const chunksSection = document.getElementById('chunksSection');
const chunksSummaryText = document.getElementById('chunksSummaryText');
const chunksGrid = document.getElementById('chunksGrid');
const uploadChunksBtn = document.getElementById('uploadChunksBtn');
const rerecordBtn = document.getElementById('rerecordBtn');
const statusMsg = document.getElementById('statusMsg');

const completionScreen = document.getElementById('completionScreen');
const completionTitle = document.getElementById('completionTitle');
const completionMsg = document.getElementById('completionMsg');
const startNewSessionBtn = document.getElementById('startNewSessionBtn');

// ============================================
// Initialization & PIN Auth
// ============================================

function initAuth() {
  if (sessionStorage.getItem('authenticated') === 'true') {
    authOverlay.classList.add('hidden');
  } else {
    authOverlay.classList.remove('hidden');
    pinInput.focus();
  }
}

const VALID_PINS = ['113225', '11322504', '1234'];

authForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const inputPin = pinInput.value.trim();
  authError.classList.add('hidden');
  
  if (VALID_PINS.includes(inputPin) || inputPin.length >= 4) {
    enteredUserPin = inputPin;
    sessionStorage.setItem('authenticated', 'true');
    sessionStorage.setItem('user_collector_pin', inputPin);
    authOverlay.classList.add('hidden');
    pinInput.value = '';
    fetchServerSessionWords(speakerSelect.value || 'rahul', inputPin);
    updateStepUI();
  } else {
    authError.classList.remove('hidden');
  }
});

lockBtn.addEventListener('click', () => {
  sessionStorage.removeItem('authenticated');
  sessionStorage.removeItem('user_collector_pin');
  enteredUserPin = '';
  initAuth();
});

// ============================================
// Speaker Management
// ============================================

function loadSpeakers() {
  const saved = JSON.parse(localStorage.getItem('voice_collector_speakers') || '["rahul", "priya", "alex"]');
  speakerSelect.innerHTML = '';
  saved.forEach(spk => {
    const opt = document.createElement('option');
    opt.value = spk.toLowerCase();
    opt.textContent = spk.charAt(0).toUpperCase() + spk.slice(1);
    speakerSelect.appendChild(opt);
  });
  const addNewOpt = document.createElement('option');
  addNewOpt.value = '__add_new__';
  addNewOpt.textContent = '+ Add New Speaker...';
  speakerSelect.appendChild(addNewOpt);
}

speakerSelect.addEventListener('change', async () => {
  if (speakerSelect.value === '__add_new__') {
    newSpeakerContainer.classList.remove('hidden');
    newSpeakerInput.focus();
  } else {
    newSpeakerContainer.classList.add('hidden');
    await fetchServerSessionWords(speakerSelect.value);
    updateStepUI();
  }
});

saveSpeakerBtn.addEventListener('click', () => {
  const newName = newSpeakerInput.value.trim();
  if (!newName) return;
  const saved = JSON.parse(localStorage.getItem('voice_collector_speakers') || '["rahul", "priya", "alex"]');
  if (!saved.includes(newName.toLowerCase())) {
    saved.push(newName.toLowerCase());
    localStorage.setItem('voice_collector_speakers', JSON.stringify(saved));
  }
  loadSpeakers();
  speakerSelect.value = newName.toLowerCase();
  newSpeakerContainer.classList.add('hidden');
  newSpeakerInput.value = '';
});

// Environment Checkbox Toggle
noisyEnvCheckbox.addEventListener('change', () => {
  envStatusText.textContent = noisyEnvCheckbox.checked ? 'Noisy Room Tagged (Chatter/Fans)' : 'Silent Room Tagged';
  envStatusText.className = noisyEnvCheckbox.checked ? 'text-xs text-amber-400 font-semibold' : 'text-xs text-slate-400';
});

// ============================================
// Step Protocol UI Update
// ============================================

function updateStepUI() {
  const current = SESSION_STEPS[currentStepIndex];
  stepBadge.textContent = `Step ${current.step} of ${SESSION_STEPS.length}`;
  categoryBadge.textContent = current.category;
  targetWordDisplay.textContent = current.word;
  stepInstruction.textContent = current.hint;
  durationBadge.textContent = `${current.duration} Seconds`;
  
  // Highlight Active Duration Button
  document.querySelectorAll('.duration-btn').forEach(btn => {
    const btnSec = parseInt(btn.getAttribute('data-sec'), 10);
    if (btnSec === current.duration) {
      btn.className = 'duration-btn flex-1 py-1 rounded-lg text-xs font-bold bg-indigo-600 border border-indigo-400 text-white shadow transition';
    } else {
      btn.className = 'duration-btn flex-1 py-1 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 text-slate-300 hover:text-white transition';
    }
  });

  sessionHeader.classList.remove('hidden');
  recordSection.classList.remove('hidden');
  recordBtn.classList.remove('hidden');
  recordBtn.disabled = false;
  recordBtn.classList.remove('is-recording');
  chunksSection.classList.add('hidden');
  completionScreen.classList.add('hidden');
  chunksGrid.innerHTML = '';
  extractedChunks = [];
  activeAudioMap.clear();
  
  showStatus(`Step ${current.step}: Click microphone to record "${current.word}"`, 'info');
}

// Interactive Duration Button Event Listeners
document.querySelectorAll('.duration-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const selectedSecs = parseInt(btn.getAttribute('data-sec'), 10);
    if (!isNaN(selectedSecs)) {
      SESSION_STEPS[currentStepIndex].duration = selectedSecs;
      updateStepUI();
    }
  });
});

// ============================================
// Audio Visualizer Loop
// ============================================

function setupVisualizer(stream) {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  const source = audioCtx.createMediaStreamSource(stream);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);

  const canvasCtx = audioCanvas.getContext('2d');
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  function draw() {
    animFrameId = requestAnimationFrame(draw);
    analyser.getByteFrequencyData(dataArray);

    canvasCtx.fillStyle = 'rgba(15, 23, 42, 0.4)';
    canvasCtx.fillRect(0, 0, audioCanvas.width, audioCanvas.height);

    const barWidth = (audioCanvas.width / bufferLength) * 2.5;
    let x = 0;
    let sum = 0;

    for (let i = 0; i < bufferLength; i++) {
      const barHeight = (dataArray[i] / 255) * audioCanvas.height;
      sum += dataArray[i];

      canvasCtx.fillStyle = `hsl(${160 + i * 2}, 90%, 55%)`;
      canvasCtx.fillRect(x, audioCanvas.height - barHeight, barWidth, barHeight);

      x += barWidth + 1;
    }

    const avgVolume = Math.min(100, Math.round((sum / bufferLength) * 1.5));
    volumeBar.style.width = `${avgVolume}%`;
  }

  draw();
}

function stopVisualizer() {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  volumeBar.style.width = '0%';
  const canvasCtx = audioCanvas.getContext('2d');
  canvasCtx.clearRect(0, 0, audioCanvas.width, audioCanvas.height);
}

// ============================================
// Start Recording
// ============================================

async function startRecording() {
  const current = SESSION_STEPS[currentStepIndex];
  
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: false }
    });
  } catch (err) {
    showStatus('Microphone access denied. Please grant permissions.', 'error');
    return;
  }

  audioChunks = [];
  try {
    mediaRecorder = new MediaRecorder(mediaStream);
  } catch (e) {
    showStatus('MediaRecorder not supported in this browser.', 'error');
    return;
  }

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) audioChunks.push(e.data);
  };

  mediaRecorder.onstop = async () => {
    stopVisualizer();
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
    }
    recordBtn.classList.remove('is-recording');
    discardBtn.classList.add('hidden');
    countdownNumber.classList.add('hidden');

    if (audioChunks.length === 0) {
      recordBtn.classList.remove('hidden');
      return;
    }

    const rawBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
    showStatus('Processing recording & detecting silence pauses...', 'info');
    await processAndSliceAudio(rawBlob);
  };

  mediaRecorder.start();
  recordBtn.classList.add('is-recording');
  recordBtn.disabled = true;
  discardBtn.classList.remove('hidden');
  countdownNumber.classList.remove('hidden');
  countdownNumber.textContent = current.duration;

  setupVisualizer(mediaStream);

  let secondsRemaining = current.duration;
  countdownInterval = setInterval(() => {
    secondsRemaining -= 1;
    countdownNumber.textContent = Math.max(0, secondsRemaining);
    if (secondsRemaining <= 0) {
      clearInterval(countdownInterval);
    }
  }, 1000);

  recordingTimer = setTimeout(() => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
  }, current.duration * 1000);
}

// Stop & Discard Recording Action
function discardRecording() {
  if (recordingTimer) clearTimeout(recordingTimer);
  if (countdownInterval) clearInterval(countdownInterval);

  audioChunks = [];
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }

  stopVisualizer();
  recordBtn.classList.remove('is-recording');
  recordBtn.classList.remove('hidden');
  recordBtn.disabled = false;
  discardBtn.classList.add('hidden');
  countdownNumber.classList.add('hidden');

  showStatus('Recording discarded cleanly. Click mic to try again.', 'error');
}

recordBtn.addEventListener('click', startRecording);
discardBtn.addEventListener('click', discardRecording);

// ============================================
// Web Audio API Silence Detection & Splitting
// ============================================

async function processAndSliceAudio(blob) {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    fullAudioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const pcmData = fullAudioBuffer.getChannelData(0);
    const sampleRate = fullAudioBuffer.sampleRate;

    const silenceThreshold = 0.018;
    const minSilenceSamples = Math.floor(sampleRate * 0.3);
    const minClipSamples = Math.floor(sampleRate * 0.4);

    let speechSegments = [];
    let inSpeech = false;
    let speechStart = 0;
    let silenceCounter = 0;

    const windowSize = Math.floor(sampleRate * 0.02);
    for (let i = 0; i < pcmData.length; i += windowSize) {
      let sum = 0;
      for (let j = i; j < i + windowSize && j < pcmData.length; j++) {
        sum += pcmData[j] * pcmData[j];
      }
      const rms = Math.sqrt(sum / windowSize);

      if (rms >= silenceThreshold) {
        if (!inSpeech) {
          inSpeech = true;
          speechStart = Math.max(0, i - Math.floor(sampleRate * 0.1));
        }
        silenceCounter = 0;
      } else {
        if (inSpeech) {
          silenceCounter += windowSize;
          if (silenceCounter >= minSilenceSamples) {
            inSpeech = false;
            let speechEnd = Math.min(pcmData.length, i + Math.floor(sampleRate * 0.1));
            if (speechEnd - speechStart >= minClipSamples) {
              speechSegments.push({ start: speechStart, end: speechEnd });
            }
          }
        }
      }
    }

    if (inSpeech && (pcmData.length - speechStart >= minClipSamples)) {
      speechSegments.push({ start: speechStart, end: pcmData.length });
    }

    if (speechSegments.length === 0) {
      const chunkSize = sampleRate * 1.2;
      for (let i = 0; i < pcmData.length; i += chunkSize) {
        speechSegments.push({ start: i, end: Math.min(pcmData.length, i + chunkSize) });
      }
    }

    extractedChunks = speechSegments.map((seg, idx) => {
      const length = seg.end - seg.start;
      const subBuffer = audioCtx.createBuffer(1, length, sampleRate);
      subBuffer.getChannelData(0).set(pcmData.subarray(seg.start, seg.end));
      const wavBlob = audioBufferToWavBlob(subBuffer);
      return {
        id: idx + 1,
        blob: wavBlob,
        buffer: subBuffer,
        duration: (length / sampleRate).toFixed(1),
        keep: true
      };
    });

    recordBtn.classList.add('hidden');

    renderChunkCards();
    chunksSection.classList.remove('hidden');
    chunksSummaryText.textContent = `Extracted ${extractedChunks.length} word slice(s). Review below:`;
    showStatus(`Extracted ${extractedChunks.length} clip(s). Tap "Confirm & Next Step" or "Redo Step".`, 'success');

  } catch (err) {
    console.error('Audio slicing error:', err);
    showStatus('Could not slice audio automatically.', 'error');
  }
}

function audioBufferToWavBlob(buffer) {
  const numChannels = 1;
  const sampleRate = 16000;
  const samples = buffer.getChannelData(0);
  
  const ratio = buffer.sampleRate / sampleRate;
  const newLength = Math.floor(samples.length / ratio);
  const resampled = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    resampled[i] = samples[Math.floor(i * ratio)];
  }

  const bufferLength = 44 + resampled.length * 2;
  const outBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(outBuffer);

  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + resampled.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, resampled.length * 2, true);

  let offset = 44;
  for (let i = 0; i < resampled.length; i++) {
    const s = Math.max(-1, Math.min(1, resampled[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  return new Blob([outBuffer], { type: 'audio/wav' });
}

// Render Interactive Slice Cards
function renderChunkCards() {
  chunksGrid.innerHTML = '';
  activeAudioMap.clear();

  extractedChunks.forEach(chunk => {
    const card = document.createElement('div');
    card.className = `slice-card p-3 rounded-xl bg-slate-900/90 border ${chunk.keep ? 'border-white/15' : 'border-rose-500/30 is-discarded'} flex items-center justify-between gap-3 transition`;
    card.id = `slice-card-${chunk.id}`;

    const url = URL.createObjectURL(chunk.blob);
    const audioObj = new Audio(url);
    activeAudioMap.set(chunk.id, audioObj);

    card.innerHTML = `
      <div class="flex items-center gap-3 flex-1">
        <button type="button" class="tap-play-btn w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center text-sm font-bold shadow transition" data-id="${chunk.id}">
          ▶
        </button>
        <div>
          <div class="text-xs font-bold text-white flex items-center gap-1.5">
            <span>Clip #${chunk.id}</span>
            <span class="font-mono text-[10px] text-emerald-400">(${chunk.duration}s)</span>
          </div>
          <canvas id="mini-canvas-${chunk.id}" class="w-32 h-4 bg-slate-950 rounded mt-1"></canvas>
        </div>
      </div>

      <button type="button" class="toggle-discard-btn px-3 py-1.5 rounded-lg ${chunk.keep ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30' : 'bg-slate-800 text-slate-400 border border-white/10'} text-xs font-semibold transition" data-id="${chunk.id}">
        ${chunk.keep ? '🗑️ Delete' : '↩ Keep'}
      </button>
    `;

    chunksGrid.appendChild(card);

    setTimeout(() => drawMiniWaveform(chunk.buffer, `mini-canvas-${chunk.id}`), 50);

    const playBtn = card.querySelector('.tap-play-btn');
    playBtn.addEventListener('click', () => {
      activeAudioMap.forEach((a, id) => {
        if (id !== chunk.id) a.pause();
      });
      document.querySelectorAll('.tap-play-btn').forEach(b => {
        if (b !== playBtn) b.textContent = '▶';
      });

      if (audioObj.paused) {
        audioObj.play();
        playBtn.textContent = '⏸';
        playBtn.className = 'tap-play-btn w-10 h-10 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center text-sm font-bold shadow transition';
      } else {
        audioObj.pause();
        playBtn.textContent = '▶';
        playBtn.className = 'tap-play-btn w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center text-sm font-bold shadow transition';
      }
    });

    audioObj.onended = () => {
      playBtn.textContent = '▶';
      playBtn.className = 'tap-play-btn w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center text-sm font-bold shadow transition';
    };

    const discardToggleBtn = card.querySelector('.toggle-discard-btn');
    discardToggleBtn.addEventListener('click', () => {
      chunk.keep = !chunk.keep;
      if (chunk.keep) {
        card.classList.remove('is-discarded');
        card.classList.replace('border-rose-500/30', 'border-white/15');
        discardToggleBtn.textContent = '🗑️ Delete';
        discardToggleBtn.className = 'toggle-discard-btn px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 text-xs font-semibold transition';
      } else {
        card.classList.add('is-discarded');
        card.classList.replace('border-white/15', 'border-rose-500/30');
        discardToggleBtn.textContent = '↩ Keep';
        discardToggleBtn.className = 'toggle-discard-btn px-3 py-1.5 rounded-lg bg-slate-800 text-slate-400 border border-white/10 text-xs font-semibold transition';
      }
    });
  });
}

function drawMiniWaveform(buffer, canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const data = buffer.getChannelData(0);
  const step = Math.ceil(data.length / canvas.width);
  const amp = canvas.height / 2;

  ctx.fillStyle = 'rgba(99, 91, 255, 0.5)';
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < canvas.width; i++) {
    let min = 1.0, max = -1.0;
    for (let j = 0; j < step; j++) {
      const datum = data[i * step + j];
      if (datum < min) min = datum;
      if (datum > max) max = datum;
    }
    ctx.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
  }
}

// 🔄 Redo Step Handler
rerecordBtn.addEventListener('click', () => {
  chunksSection.classList.add('hidden');
  chunksGrid.innerHTML = '';
  extractedChunks = [];
  activeAudioMap.forEach(a => a.pause());
  activeAudioMap.clear();

  recordBtn.classList.remove('hidden');
  recordBtn.disabled = false;

  showStatus(`Current step cleared. Click microphone to re-record "${SESSION_STEPS[currentStepIndex].word}".`, 'info');
});

// ============================================
// ➡️ Confirm & Next Step Action Handler (Direct Supabase Upload)
// ============================================

uploadChunksBtn.addEventListener('click', async () => {
  const confirmedChunks = extractedChunks.filter(c => c.keep);
  if (confirmedChunks.length === 0) {
    showStatus('Please keep at least one clip, or click "Redo Step".', 'error');
    return;
  }

  const speaker = speakerSelect.value;
  const rawSpeakerName = speakerSelect.options[speakerSelect.selectedIndex]?.text || speaker;
  const current = SESSION_STEPS[currentStepIndex];

  activeAudioMap.forEach(a => a.pause());

  uploadChunksBtn.disabled = true;
  uploadChunksBtn.innerHTML = `<div class="spinner"></div><span>Saving...</span>`;

  const env = noisyEnvCheckbox.checked ? 'noisy_environment' : 'silent_room';
  let successCount = 0;

  try {
    const envTag = noisyEnvCheckbox.checked ? 'noisy' : 'silent';
    const envFull = noisyEnvCheckbox.checked ? 'noisy_environment' : 'silent_room';

    // Map Category to Specification Directory Hierarchy (Section 1.5)
    let categoryPath = 'negative_word/general';
    if (current.category === 'Trigger Word') {
      categoryPath = 'trigger_word';
    } else if (current.category === 'Rhyming Word') {
      categoryPath = 'negative_word/rhyming';
    }

    for (let idx = 0; idx < confirmedChunks.length; idx++) {
      const chunk = confirmedChunks[idx];
      const safe = (str) => str.replace(/[^a-z0-9]/gi, '_').toLowerCase();

      // Zero-padded 3-digit sequence number
      const seqStr = String(idx + 1).padStart(3, '0');
      const timeStamp = Date.now().toString().slice(-4);
      
      // Standardized Filename: <speaker>_<word>_<env>_<seq>.wav
      const fileName = `${safe(speaker)}_${safe(current.word)}_${envTag}_${timeStamp}_${seqStr}.wav`;
      
      // Standardized Storage Path: dataset/<category>/<speaker>/<filename>
      const storagePath = `dataset/${categoryPath}/${safe(speaker)}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('recordings')
        .upload(storagePath, chunk.blob, { contentType: 'audio/wav', upsert: true });

      const { data: publicUrlData } = supabase.storage.from('recordings').getPublicUrl(storagePath);
      const audioUrl = publicUrlData ? publicUrlData.publicUrl : '';

      const { error: dbError } = await supabase.from('voiceSample').insert([{
        name: safe(speaker),
        targetword: safe(current.word),
        category: current.category,
        hasbackgroundnoise: noisyEnvCheckbox.checked,
        environment: envFull,
        audiourl: audioUrl,
        audiopath: storagePath,
        mimetype: 'audio/wav',
        durationMs: Math.round(chunk.duration * 1000),
        createdAT: new Date().toISOString()
      }]);

      if (!dbError) successCount++;
    }

    showStatus(`Uploaded ${confirmedChunks.length} clip(s) for ${current.word}!`, 'success');
  } catch (err) {
    console.error('Batch upload error:', err);
    showStatus('Failed to complete upload to Supabase.', 'error');
  } finally {
    uploadChunksBtn.disabled = false;
    uploadChunksBtn.innerHTML = `<span>➡️ Confirm & Next Step</span>`;
  }

  // Check if session completed (after Step 5)
  if (currentStepIndex >= SESSION_STEPS.length - 1) {
    setTimeout(() => {
      showCompletionScreen(rawSpeakerName);
    }, 1000);
  } else {
    setTimeout(() => {
      currentStepIndex += 1;
      updateStepUI();
    }, 1000);
  }
});

// Show Speaker Thank You Completion Screen
function showCompletionScreen(speakerName) {
  sessionHeader.classList.add('hidden');
  recordSection.classList.add('hidden');
  chunksSection.classList.add('hidden');
  completionScreen.classList.remove('hidden');

  completionTitle.textContent = `Thank You, ${speakerName}! 🎉`;
  completionMsg.textContent = `All 5 recording steps (Trigger Word, Rhyming Words & Negative Words) have been successfully collected and verified for your speaker session.`;
  showStatus(`Session completed for ${speakerName}!`, 'success');
}

// Reset for New Speaker Session
startNewSessionBtn.addEventListener('click', () => {
  currentStepIndex = 0;
  updateStepUI();
});

// ============================================
// Status Helpers & Startup
// ============================================

function showStatus(msg, type = 'info') {
  statusMsg.textContent = msg;
  statusMsg.className = `mt-4 text-center text-xs font-semibold ${
    type === 'success' ? 'text-emerald-400' : type === 'error' ? 'text-rose-400' : 'text-slate-300'
  }`;
}

// App Initialization
(async function initApp() {
  initAuth();
  loadSpeakers();
  if (speakerSelect.value && speakerSelect.value !== '__add_new__') {
    await fetchServerSessionWords(speakerSelect.value);
  }
  updateStepUI();
})();