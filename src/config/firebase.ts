// src/config/firebase.ts
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

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

// Initialize services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// For v2 functions, explicitly set region
export const functions = getFunctions(app, 'us-central1');

// Uncomment this if you want to test with local emulator
// connectFunctionsEmulator(functions, 'localhost', 5001);

export default app;