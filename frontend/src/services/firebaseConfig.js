// =============================================================================
// FIREBASE CLIENT SDK CONFIGURATION
// =============================================================================
// This file initializes Firebase on the FRONTEND (client-side) for authentication.
// The BACKEND uses firebase-admin SDK separately (see backend/database.py).
//
// HOW TO SET UP:
// 1. Go to https://console.firebase.google.com/
// 2. Select your project (or create one)
// 3. Go to Project Settings > General > Your Apps > Web App
// 4. Copy the firebaseConfig object and paste the values below
// 5. Enable "Email/Password" sign-in in Authentication > Sign-in method
// =============================================================================

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyB-kwuiYAhpgjIzK0yhKFivHlhZrE4XpOI",
  authDomain: "flood-risk-f3fae.firebaseapp.com",
  projectId: "flood-risk-f3fae",
  storageBucket: "flood-risk-f3fae.firebasestorage.app",
  messagingSenderId: "135970584513",
  appId: "1:135970584513:web:9901c57a37665cbf08e140",
  measurementId: "G-E486CFRSK9"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication
export const auth = getAuth(app);

// Initialize Cloud Firestore
export const db = getFirestore(app);

// =============================================================================
// AUTH HELPER FUNCTIONS
// =============================================================================

/**
 * Login with email and password using Firebase Client SDK.
 * Returns the Firebase ID Token that should be sent to the backend as a Bearer token.
 */
export async function loginWithEmail(email, password) {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  // Get the ID Token to send to the backend for verification
  const idToken = await userCredential.user.getIdToken();
  return { user: userCredential.user, idToken };
}

/**
 * Register a new user with Firebase Client SDK.
 * NOTE: The backend also has /api/auth/register which creates the user via firebase-admin.
 * You can choose to use either approach. Client-side registration is shown here.
 */
export async function registerWithEmail(email, password) {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const idToken = await userCredential.user.getIdToken();
  return { user: userCredential.user, idToken };
}

/**
 * Sign out the current user.
 */
export async function logoutUser() {
  await signOut(auth);
}

export default app;
