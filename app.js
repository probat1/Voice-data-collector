import { supabase } from './supabase-config.js';

// ============================================
// DOM Elements
// ============================================

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

// ============================================
// State
// ============================================

let mediaRecorder = null;
let audioChunks = [];
let recordedBlob = null;
let recordingTimeout = null;
let countdownInterval = null;


// ============================================
// MIME Type Detection
// ============================================

function pickMimeType() {
    const candidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus'
    ];

    return candidates.find(type =>
        MediaRecorder.isTypeSupported(type)
    ) || '';
}


// ============================================
// Start Recording
// ============================================

async function startRecording() {
    let stream;

    try {
        stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: false,
                autoGainControl: false
            }
        });

    } catch (err) {
        console.error('Microphone error:', err);

        showStatus(
            'Microphone access is required to record a sample. Enable it in your browser settings and try again.',
            'error'
        );

        return;
    }

    audioChunks = [];

    const mimeType = pickMimeType();

    try {
        mediaRecorder = new MediaRecorder(
            stream,
            mimeType ? { mimeType } : undefined
        );
    } catch (err) {
        console.error('MediaRecorder error:', err);

        stream.getTracks().forEach(track => track.stop());

        showStatus(
            'Your browser does not support audio recording.',
            'error'
        );

        return;
    }

    // --------------------------------------------
    // Audio data
    // --------------------------------------------

    mediaRecorder.ondataavailable = event => {
        if (event.data.size > 0) {
            audioChunks.push(event.data);
        }
    };


    // --------------------------------------------
    // Recording stopped
    // --------------------------------------------

    mediaRecorder.onstop = () => {

        recordedBlob = new Blob(audioChunks, {
            type: mediaRecorder.mimeType || 'audio/webm'
        });

        // Stop microphone
        stream.getTracks().forEach(track => track.stop());

        // Reset recording UI
        recordBtn.classList.remove('is-recording');
        recordBtn.disabled = false;

        progressRing.classList.add('hidden');
        countdownNumber.classList.add('hidden');
        helperText.classList.remove('is-visible');

        // Reset progress ring
        progressRingFg.style.transition = 'none';
        progressRingFg.style.strokeDashoffset = '439.8';

        setTimeout(() => {
            progressRingFg.style.transition =
                'stroke-dashoffset 15s linear';
        }, 50);

        // Show recorded audio
        renderAudioPlayer(recordedBlob);

        // Enable submit button
        updateSubmitState();
    };


    // --------------------------------------------
    // Start MediaRecorder
    // --------------------------------------------

    mediaRecorder.start();

    recordBtn.classList.add('is-recording');
    recordBtn.disabled = true;

    progressRing.classList.remove('hidden');
    countdownNumber.classList.remove('hidden');


    // Show helper text
    setTimeout(() => {
        helperText.classList.add('is-visible');
    }, 300);


    // Start countdown
    startCountdownUI(15);


    // --------------------------------------------
    // Hard stop after exactly 15 seconds
    // --------------------------------------------

    recordingTimeout = setTimeout(() => {

        if (
            mediaRecorder &&
            mediaRecorder.state !== 'inactive'
        ) {
            mediaRecorder.stop();
        }

    }, 15000);
}


// ============================================
// Countdown UI
// ============================================

function startCountdownUI(seconds) {

    progressRingFg.style.strokeDashoffset = '0';

    countdownNumber.textContent = seconds;

    countdownInterval = setInterval(() => {

        seconds -= 1;

        countdownNumber.textContent =
            Math.max(seconds, 0);

        if (seconds <= 0) {
            clearInterval(countdownInterval);
        }

    }, 1000);
}


// ============================================
// Audio Playback
// ============================================

function renderAudioPlayer(blob) {

    // Remove old player
    playerContainer.innerHTML = '';

    const url = URL.createObjectURL(blob);

    const audio = document.createElement('audio');

    audio.controls = true;
    audio.src = url;
    audio.style.width = '100%';

    playerContainer.appendChild(audio);

    // Show noise question
    noiseToggleRow.classList.remove('hidden');
}


// ============================================
// Form Validation
// ============================================

function updateSubmitState() {

    const valid =
        nameInput.value.trim() &&
        targetWordInput.value.trim() &&
        recordedBlob;

    submitBtn.disabled = !valid;
}


// ============================================
// Input Events
// ============================================

[nameInput, targetWordInput].forEach(element => {

    element.addEventListener(
        'input',
        updateSubmitState
    );

});


// ============================================
// Record Button
// ============================================

recordBtn.addEventListener(
    'click',
    startRecording
);


// ============================================
// Submit → Supabase
// ============================================

sampleForm.addEventListener(
    'submit',
    async event => {

        event.preventDefault();

        if (!recordedBlob) {
            showStatus(
                'Please record an audio sample first.',
                'error'
            );

            return;
        }

        setSubmitting(true);

        try {

            // ----------------------------------------
            // Get form data
            // ----------------------------------------

            const categoryElement =
                document.querySelector(
                    'input[name="category"]:checked'
                );

            const category =
                categoryElement
                    ? categoryElement.value
                    : 'Trigger Word';

            const name =
                nameInput.value.trim();

            const targetWord =
                targetWordInput.value.trim();

            const hasNoise =
                noiseToggleInput.checked;


            // ----------------------------------------
            // Determine file extension
            // ----------------------------------------

            const mimeType =
                recordedBlob.type || 'audio/webm';

            let ext = 'webm';

            if (mimeType.includes('mp4')) {
                ext = 'mp4';
            } else if (mimeType.includes('ogg')) {
                ext = 'ogg';
            } else if (mimeType.includes('wav')) {
                ext = 'wav';
            }


            // ----------------------------------------
            // Make safe filename
            // ----------------------------------------

            const safe = value =>
                value
                    .replace(/[^a-z0-9]/gi, '_')
                    .toLowerCase();

            const fileName =
                `${safe(name)}_${safe(targetWord)}_${Date.now()}.${ext}`;

            const storagePath =
                `recordings/${fileName}`;


            console.log(
                'Uploading:',
                storagePath
            );


            // ========================================
            // 1. Upload audio to Supabase Storage
            // ========================================

            const {
                error: uploadError
            } = await supabase
                .storage
                .from('recordings')
                .upload(
                    storagePath,
                    recordedBlob,
                    {
                        contentType: mimeType,
                        upsert: false
                    }
                );


            if (uploadError) {
                console.error(
                    'Storage upload error:',
                    uploadError
                );

                throw uploadError;
            }


            // ========================================
            // 2. Get public audio URL
            // ========================================

            const {
                data: publicUrlData
            } = supabase
                .storage
                .from('recordings')
                .getPublicUrl(storagePath);


            if (!publicUrlData ||
                !publicUrlData.publicUrl) {

                throw new Error(
                    'Could not generate audio URL.'
                );
            }


            const audioUrl =
                publicUrlData.publicUrl;


            console.log(
                'Audio URL:',
                audioUrl
            );


            // ========================================
            // 3. Save metadata in PostgreSQL
            // ========================================

            const {
                error: databaseError
            } = await supabase
                .from('voiceSample')
                .insert([
                    {
                        name: name,

                        targetword: targetWord,

                        category: category,

                        hasbackgroundnoise: hasNoise,

                        audiourl: audioUrl,

                        audiopath: storagePath,

                        mimetype: mimeType,

                        durationMs: 15000,

                        createdAT:
                            new Date().toISOString()
                    }
                ]);


            if (databaseError) {

                console.error(
                    'Database error:',
                    databaseError
                );

                throw databaseError;
            }


            // ========================================
            // SUCCESS
            // ========================================

            showStatus(
                'Sample submitted. Thank you — you can record another one.',
                'success'
            );

            resetForm();


        } catch (error) {

            console.error(
                'Supabase upload failed:',
                error
            );

            showStatus(
                'Something went wrong uploading your sample. Please try again.',
                'error'
            );

        } finally {

            setSubmitting(false);
        }

    }
);


// ============================================
// Submit Button State
// ============================================

function setSubmitting(isSubmitting) {

    submitBtn.disabled = isSubmitting;

    if (isSubmitting) {

        submitBtn.innerHTML =
            `<div class="spinner"></div>
             <span>Uploading…</span>`;

    } else {

        submitBtn.innerHTML =
            'Submit Data';
    }
}


// ============================================
// Reset Form
// ============================================

function resetForm() {

    nameInput.value = '';

    targetWordInput.value = '';

    const triggerCategory =
        document.getElementById(
            'categoryTrigger'
        );

    if (triggerCategory) {
        triggerCategory.checked = true;
    }

    playerContainer.innerHTML = '';

    recordedBlob = null;

    noiseToggleRow.classList.add('hidden');

    noiseToggleInput.checked = false;

    updateSubmitState();
}


// ============================================
// Status Message
// ============================================

function showStatus(message, type) {

    statusMsg.textContent = message;

    statusMsg.className =
        `mt-4 text-center text-sm ${type}`;


    if (type === 'success') {

        setTimeout(() => {

            statusMsg.textContent = '';

            statusMsg.className =
                'mt-4 text-center text-sm';

        }, 6000);
    }
}