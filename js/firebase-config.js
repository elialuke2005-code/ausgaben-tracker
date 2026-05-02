// ── Firebase Konfiguration ────────────────────────────────────────
// 1. Gehe zu https://console.firebase.google.com
// 2. Erstelle ein neues Projekt (oder wähle ein bestehendes)
// 3. Klicke auf "Web App hinzufügen" (</>)
// 4. Kopiere deine firebaseConfig hierher

const firebaseConfig = {
  apiKey:            "AIzaSyDHyFO8L7BuhyvT2Ad_CP1oJ-jEKAIFJ-k",
  authDomain:        "finance-tracker-9381e.firebaseapp.com",
  projectId:         "finance-tracker-9381e",
  storageBucket:     "finance-tracker-9381e.firebasestorage.app",
  messagingSenderId: "725463053346",
  appId:             "1:725463053346:web:3dc34ae1a655bd1cfd867b"
};

firebase.initializeApp(firebaseConfig);

const db   = firebase.firestore();
const auth = firebase.auth();

// Offline-Persistenz aktivieren (App funktioniert auch ohne Internet)
db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
