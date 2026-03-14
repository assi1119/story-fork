import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC8qxvsemRnRBdIH1gykS4u0d1Se9BalJE",
  authDomain: "story-fork-a6bda.firebaseapp.com",
  projectId: "story-fork-a6bda",
  storageBucket: "story-fork-a6bda.firebasestorage.app",
  messagingSenderId: "236161867155",
  appId: "1:236161867155:web:fab7c1fd7eb9ad000d5c66"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db, collection, addDoc, getDocs, query, orderBy };