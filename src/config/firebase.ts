// src/config/firebase.ts
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: "AIzaSyAiWqGprlFP_Cc1t4_5R-UDJ15Z12fUTGg",
  authDomain: "peerrentalapp.firebaseapp.com",
  projectId: "peerrentalapp",
  storageBucket: "peerrentalapp.firebasestorage.app",
  messagingSenderId: "562667384657",
  appId: "1:562667384657:web:305a11c63eb4e515486d70"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Auth
export const auth = getAuth(app);

// Initialize other services
export const db = getFirestore(app);
export const storage = getStorage(app);

// For v2 functions, explicitly set region
export const functions = getFunctions(app, 'us-central1');

export default app;