# Cue

An installable, responsive rehearsal app for iPhone Safari and modern browsers.

Published privately at https://cue-rehearsal-elenablinova.leena-blinova.chatgpt.site (sign in with the owning ChatGPT account).

## Use

1. In Safari, open the app and choose Share → Add to Home Screen.
2. Open My script. Upload the whole PDF (25 MB per file; all pages are selected by default), or paste `CHARACTER: dialogue` speeches / import a UTF-8 `.txt` file. Review PDF-extracted dialogue and character names before saving. Scanned PDFs require OCR in a PDF app first. Stage directions use `[brackets]`.
3. The play splits at numbered headings such as `Сцена 1`, `СЦЕНА 22`, or `Scene 1`. Review the full draft and save. Use the scene picker to choose any scene; each scene remembers its own progress. Select your character. Choose the script language under Rehearsal settings.
4. Start rehearsal. Other characters are read aloud. Tap the microphone on each of your turns and say the entire line.
5. Only a matching final transcript advances. Incorrect, partial, extra, or missing words keep the current line. Punctuation, capitalization, and apostrophes are ignored. Typed practice follows the same rule.

Voice recognition uses the browser's Web Speech implementation, including `webkitSpeechRecognition` on Safari. It needs microphone permission and may require a network connection or Siri/Dictation availability. A speech recognizer can mishear correct acting; this app compares the recognized transcript, not acoustic pronunciation. The iPhone speech path has not been tested on physical hardware. Use Safari if voice recognition is unavailable in standalone mode.

Scripts and progress are stored in browser localStorage. They do not sync between devices or browser contexts. Export a script to back it up. The service worker caches the app for offline reading; speech recognition may still require internet. The external Google font is optional, with system-font fallbacks.

## Development

No installation or build step. Mozilla PDF.js 6.4.299 (legacy browser build) is vendored under `dist/vendor/pdfjs/` with its Apache-2.0 license and supporting character maps/fonts. PDF parsing runs in a same-origin Web Worker on the device; files are not uploaded. Serve `dist/` from an HTTP server; use HTTPS for microphone access outside localhost.

```sh
python3 -m http.server 4173 --directory dist
node --check dist/app.js
node --check dist/core.js
node --check dist/sw.js
npm test
```

The integration checks simulate browser speech events and verify wrong/interim/correct transcripts, typed checks, spoken cue progression, cancellation, and stale callbacks. Physical iPhone microphone, permission, install, and offline checks remain manual.

PDF importer checks cover positioned text reconstruction, character headings, common dialogue separators, stage directions, Cyrillic, and text without character names. Real two-page PDF extraction, no-text PDF detection, and a 25-page Cyrillic play containing 25 scenes were also verified with the vendored PDF.js build. Scene checks cover 25+ scene selection, independent progress, reload, full-play editing/export, heading variants, repeated numbering across acts, and validation of empty scenes. iPhone file picker and Safari extraction still need physical-device verification.
