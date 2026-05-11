// Firebase initialization.
//
// Credentials are loaded from Vite env vars (see .env.example). If they're
// missing we still load the app — but the online-room screen will show a
// helpful "Firebase not configured" message instead of crashing.

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(config.apiKey && config.projectId);

let app = null;
let db = null;
let auth = null;

if (isFirebaseConfigured) {
  app = initializeApp(config);
  db = getFirestore(app);
  auth = getAuth(app);
}

// Ensure we have an anonymous user; resolves with the firebase user object.
export function ensureSignedIn() {
  return new Promise((resolve, reject) => {
    if (!auth) { reject(new Error('Firebase not configured')); return; }
    const unsub = onAuthStateChanged(auth, user => {
      if (user) { unsub(); resolve(user); }
    });
    signInAnonymously(auth).catch(err => { unsub(); reject(err); });
  });
}

export { app, db, auth };
