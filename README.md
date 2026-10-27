# Cue

An installable, responsive rehearsal app for iPhone Safari and modern browsers.

Published privately at https://cue-rehearsal-elenablinova.leena-blinova.chatgpt.site (sign in with the owning ChatGPT account).

## Use

1. In Safari, open the app and choose Share → Add to Home Screen.
2. Open My script. Paste `CHARACTER: dialogue` speeches or import a UTF-8 `.txt` file. Stage directions use `[brackets]`.
3. Save and select your character. Choose the script language under Rehearsal settings.
4. Start rehearsal. Other characters are read aloud. Tap the microphone on each of your turns and say the entire line.
5. Only a matching final transcript advances. Incorrect, partial, extra, or missing words keep the current line. Punctuation, capitalization, and apostrophes are ignored. Typed practice follows the same rule.

Voice recognition uses the browser's Web Speech implementation, including `webkitSpeechRecognition` on Safari. It needs microphone permission and may require a network connection or Siri/Dictation availability. A speech recognizer can mishear correct acting; this app compares the recognized transcript, not acoustic pronunciation. The iPhone speech path has not been tested on physical hardware. Use Safari if voice recognition is unavailable in standalone mode.

Scripts and progress are stored in browser localStorage. They do not sync between devices or browser contexts. Export a script to back it up. The service worker caches the app for offline reading; speech recognition may still require internet. The external Google font is optional, with system-font fallbacks.

## Development

No dependencies or build step. Serve `dist/` from an HTTP server; use HTTPS for microphone access outside localhost.

```sh
python3 -m http.server 4173 --directory dist
node --check dist/app.js
node --check dist/core.js
node --check dist/sw.js
node tests/rehearsal.cjs
```

The integration checks simulate browser speech events and verify wrong/interim/correct transcripts, typed checks, spoken cue progression, cancellation, and stale callbacks. Physical iPhone microphone, permission, install, and offline checks remain manual.
