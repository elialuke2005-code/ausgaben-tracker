// ── Firebase Konfiguration ────────────────────────────────────────
// 1. Gehe zu https://console.firebase.google.com
// 2. Erstelle ein neues Projekt (oder wähle ein bestehendes)
// 3. Klicke auf "Web App hinzufügen" (</>)
// 4. Kopiere deine firebaseConfig hierher

const firebaseConfig = {
  apiKey:            "DEINE_API_KEY",
  authDomain:        "DEINE_PROJECT_ID.firebaseapp.com",
  projectId:         "DEINE_PROJECT_ID",
  storageBucket:     "DEINE_PROJECT_ID.appspot.com",
  messagingSenderId: "DEINE_MESSAGING_SENDER_ID",
  appId:             "DEINE_APP_ID"
};

firebase.initializeApp(firebaseConfig);

const db   = firebase.firestore();
const auth = firebase.auth();

// Offline-Persistenz aktivieren (App funktioniert auch ohne Internet)
db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
