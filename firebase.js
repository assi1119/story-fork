import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

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
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export { db, auth, googleProvider, collection, addDoc, getDocs, query, orderBy, where, GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile };
```

貼り付けて `Ctrl + S` で保存したらGitHubにプッシュしてください👇
```
cd ~/Desktop/分岐ゲーム
git add .
git commit -m "fix firebase imports"
git push origin main