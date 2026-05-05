# Ausgaben Tracker — Entwicklungsregeln

## Deployment
- Nach **jeder** Änderung: SW-Cache-Version in `sw.js` hochzählen (v7 → v8 → v9 …) und direkt `git add -A && git commit && git push` ausführen.
- Kein separater "Push"-Schritt nötig — immer alles in einem Commit zusammenfassen.
- Der SW-Bump sorgt dafür dass alle PWA-Installationen auf Endgeräten automatisch aktualisiert werden.

## Projekt-Stack
- Vanilla JS + CSS (kein Framework, kein Bundler)
- Firebase Auth + Firestore (compat SDK v10 via CDN)
- Tesseract.js (lazy-loaded für OCR)
- Formspree (mdabenyb) für Support-Mails → elia@weinheimer-it.de
- GitHub Pages Hosting

## Wichtige Dateien
- `js/firebase-config.js` — Firebase-Konfiguration
- `sw.js` — Service Worker (Cache-Version hier hochzählen!)
- `js/app.js` — Gesamte App-Logik
