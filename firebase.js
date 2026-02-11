import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBLyoIoXp2aJCnhFqIFufMVBz0fzCS-FYY",
  authDomain: "game-303eb.firebaseapp.com",
  databaseURL: "https://game-303eb-default-rtdb.firebaseio.com",
  projectId: "game-303eb",
  storageBucket: "game-303eb.firebasestorage.app",
  messagingSenderId: "22261863844",
  appId: "1:22261863844:web:66f8541079b9025ec69d31",
  measurementId: "G-RKN2F3HVHS"
};

const app = initializeApp(firebaseConfig);

export const db = getDatabase(app);
