// Firebase v10 modular SDK — CDN imports, no npm install required.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';

// NOTE: Security rules must be configured in the Firebase Console before production deployment.
// For Firestore: allow read, write: if true; (for testing only)
// For Storage: allow read, write: if true; (for testing only)

// >>> PASTE YOUR CONFIG HERE — from Firebase Console → Project Settings → Your apps
const firebaseConfig = {
  apiKey: "AIzaSyD929...",
  authDomain: "voice-recorder-for-sih.firebaseapp.com",
  projectId: "voice-recorder-for-sih",
  storageBucket: "voice-recorder-for-sih.firebasestorage.app",
  messagingSenderId: "996232834008",
  appId: "1:996232834008:web:...",
  measurementId: "G-D10E27358Y"
};
// <<< END CONFIG

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
