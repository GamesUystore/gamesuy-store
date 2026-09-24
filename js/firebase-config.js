// ============================================================
// GAMESUY STORE — Inicialización de Firebase
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth }     from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
  apiKey:            "AIzaSyCiaH01U2mvmsd_co8gSmXBiBkbcgCPBh0",
  authDomain:        "gamesuy-store.firebaseapp.com",
  projectId:         "gamesuy-store",
  storageBucket:     "gamesuy-store.firebasestorage.app",
  messagingSenderId: "355638213510",
  appId:             "1:355638213510:web:731f923f6bb033bf7cca07",
  measurementId:     "G-7NQZMZRPHZ"
};

const app  = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);
