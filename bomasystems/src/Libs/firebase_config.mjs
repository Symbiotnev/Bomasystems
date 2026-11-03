// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getStorage } from "firebase/storage";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getMessaging } from "firebase/messaging";

// Your web app's Firebase configuration
const firebaseConfig = {

  apiKey: "AIzaSyDUqLw7RSCU994FWo0A_WLYwsEQrYaawNo",
  authDomain: "ronaju1o.firebaseapp.com",
  projectId: "ronaju1o",
  storageBucket: "ronaju1o.firebasestorage.app",
  messagingSenderId: "21516315001",
  appId: "1:21516315001:web:8b1d749984eb1e1a2de7a8",
  measurementId: "G-SS9ZJZEVBG"
    
  };
// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Cloud Storage and get a reference to the service
const storage = getStorage(app);
const db = getFirestore(app);
const auth = getAuth(app);

// Initialize Firebase Cloud Messaging and get a reference to the service
const messaging = getMessaging(app);

export { app, storage, db, auth, messaging };