# Voice Sample Collection Web App

A premium, production-ready web application for collecting 15-second voice samples to train keyword-spotting ML models. Built with vanilla HTML/CSS/JS, Firebase Storage, and Firestore.

---

## Features

- **Dark glassmorphism UI** with animated mesh gradient background
- **15-second timed recordings** with circular progress indicator
- **Audio playback** before submission
- **Metadata collection**: contributor name, target word, category (Negative/Trigger/Rhyming), background noise flag
- **Firebase integration**: audio files uploaded to Storage, metadata saved to Firestore
- **Fully accessible** with ARIA labels, keyboard navigation, and screen reader support
- **Mobile responsive** down to 360px width
- **Reduced motion support** for accessibility

---

## File Structure

```
voice-data-collector/
├── index.html          # Main HTML structure
├── styles.css          # All styles and animations
├── app.js             # Recording logic and Firebase integration
├── firebase-config.js  # Firebase configuration (edit this)
└── README.md          # This file
```

---

## Setup Instructions

### 1. Firebase Project Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project (or use an existing one)
3. Enable **Firestore Database** (Start in test mode for development)
4. Enable **Storage** (Start in test mode for development)
5. Go to **Project Settings** → **General** → **Your apps**
6. Click **Web** (</>), register your app, and copy the config object

### 2. Configure Firebase Keys

Open `firebase-config.js` and replace the placeholder values with your Firebase config:

```javascript
const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
};
```

### 3. Run the App Locally

The app **must** be served over HTTP/HTTPS (not via `file://` protocol) for microphone access and ES modules to work.

**Option 1: Using npx serve**
```bash
cd voice-data-collector
npx serve .
```
Then open `http://localhost:3000`

**Option 2: Using Python**
```bash
cd voice-data-collector
python -m http.server 8000
```
Then open `http://localhost:8000`

**Option 3: Using VS Code Live Server**
- Install the "Live Server" extension
- Right-click `index.html` → **Open with Live Server**

---

## How It Works

### User Flow

1. Enter your **Name** and **Target Word**
2. Select **Category**: Negative Word / Trigger Word / Rhyming Word
3. Click the **record button** to start recording (15 seconds, auto-stops)
4. Listen to the playback using the audio player
5. Toggle **background noise flag** if applicable
6. Click **Submit Data** to upload

### Data Schema (Firestore)

Each submission creates a document in the `voiceSamples` collection:

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Contributor's name |
| `targetWord` | string | The word spoken in the clip |
| `category` | string | "Negative Word" / "Trigger Word" / "Rhyming Word" |
| `hasBackgroundNoise` | boolean | Whether background noise was flagged |
| `audioUrl` | string | Firebase Storage download URL |
| `audioPath` | string | Storage path for file reference |
| `mimeType` | string | Recorded audio format (webm/mp4/ogg) |
| `durationMs` | number | Always 15000 (15 seconds) |
| `createdAt` | timestamp | Server timestamp of submission |

### Storage Structure

Audio files are stored at: `recordings/{safe_name}_{safe_word}_{timestamp}.{ext}`

Example: `recordings/john_doe_hello_1725119939000.webm`

---

## Browser Compatibility

- **Chrome/Edge**: ✅ (recommended, best webm/opus support)
- **Firefox**: ✅ (uses ogg/opus)
- **Safari**: ✅ (uses mp4)
- **Mobile browsers**: ✅ (responsive design, touch-friendly)

---

## Security Notes

⚠️ **The default Firebase rules are for TESTING ONLY**

For production, update your Firestore and Storage rules in the Firebase Console:

**Firestore Rules (basic authentication):**
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /voiceSamples/{document=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

**Storage Rules (basic authentication):**
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /recordings/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

---

## Design System

### Color Tokens

| Token | Hex | Usage |
|-------|-----|-------|
| `--accent` | #635BFF | Primary violet-blue |
| `--accent-soft` | #8B7CFF | Gradient partner |
| `--accent-2` | #22D9C0 | Teal (progress ring, success) |
| `--danger` | #FF4D6D | Recording red |
| `--text-primary` | #F5F6FA | Main text |
| `--text-secondary` | #9CA3AF | Labels, helper text |

### Typography

- **Font**: Inter (400/500/600/700)
- **Monospace countdown**: JetBrains Mono (500)
- **Headline**: 28–32px, weight 600
- **Body**: 14–16px, weight 400–500

---

## Troubleshooting

### Microphone Access Denied
- **Chrome**: Click the 🔒 icon in the address bar → Site Settings → Microphone → Allow
- **Firefox**: Click the 🛡️ icon → Permissions → Microphone → Allow
- **Safari**: Safari → Settings → Websites → Microphone → Allow

### CORS / Module Errors
- Ensure you're serving via HTTP/HTTPS, not opening via `file://`
- Check that all four files are in the same directory

### Firebase Errors
- Verify your config values in `firebase-config.js` are correct
- Check that Firestore and Storage are enabled in the Firebase Console
- Ensure security rules allow writes (test mode: `allow read, write: if true;`)

### Recording Doesn't Stop
- The recording auto-stops after exactly 15 seconds via `setTimeout`
- If it hangs, check the browser console for MediaRecorder errors

---

## Customization

### Change Recording Duration

Edit `app.js`:

```javascript
// Find this line (appears twice):
recordingTimeout = setTimeout(() => {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
}, 15000); // Change 15000 to your desired ms

// Also update the countdown:
startCountdownUI(15); // Change 15 to match your duration in seconds

// Update the CSS transition:
// In styles.css, find:
transition: stroke-dashoffset 15s linear; // Change 15s to match

// Update the Firestore field:
durationMs: 15000, // Change to match
```

### Change Color Scheme

Edit `:root` variables in `styles.css`:

```css
:root {
  --accent: #YOUR_PRIMARY_COLOR;
  --accent-2: #YOUR_SECONDARY_COLOR;
  /* etc. */
}
```

### Add Form Fields

1. Add the HTML input in `index.html` inside `<form id="sampleForm">`
2. Get a reference in `app.js`: `const myInput = document.getElementById('myField');`
3. Include it in the Firestore document in the submit handler

---

## Performance

- **Tailwind CDN**: ~50KB gzipped (consider self-hosting for production)
- **Firebase SDK**: ~100KB total (Firestore + Storage)
- **Google Fonts**: ~15KB (Inter + JetBrains Mono)
- **Recorded audio**: ~1MB per 15-second clip (varies by codec)

---

## License

This project is provided as-is for educational and commercial use.

---

## Support

For issues or questions, refer to:
- [Firebase Documentation](https://firebase.google.com/docs)
- [MediaRecorder API](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)

---

**Built with ❤️ for keyword-spotting ML dataset collection**
