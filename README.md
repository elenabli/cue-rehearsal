# Cue

An installable, responsive rehearsal app for iPhone Safari and modern browsers.

Published privately at https://cue-rehearsal-elenablinova.leena-blinova.chatgpt.site (sign in with the owning ChatGPT account).

## Use

1. In Safari, open the app and choose Share → Add to Home Screen.
2. Open My script. Upload the whole PDF (25 MB per file; all pages are selected by default), or paste `CHARACTER: dialogue` speeches / import a UTF-8 `.txt` file. Review PDF-extracted dialogue and character names before saving. Scanned PDFs require OCR in a PDF app first. Stage directions use `[brackets]`.
3. The play splits at numbered headings such as `Сцена 1`, `СЦЕНА 22`, or `Scene 1`. Review the full draft and save. Use the scene picker to choose any scene; each scene remembers its own progress. Select your character. Choose the script language under Rehearsal settings.
4. Start rehearsal. Other characters are read aloud. The microphone starts automatically on your turns. The visible «Говорить» button is the manual fallback when browser permissions prevent automatic start.
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

PDF importer checks cover positioned text reconstruction, character headings, common dialogue separators, stage directions, Cyrillic, and text without character names. Real two-page PDF extraction, no-text PDF detection, and a 25-page Cyrillic play containing 25 scenes were also verified with the vendored PDF.js build. Scene checks cover 25+ scene selection, independent progress, reload, full-play editing/export, heading variants, repeated numbering across acts, and retention of empty scenes for review. iPhone file picker and Safari extraction still need physical-device verification.

Scenes without spoken lines are retained verbatim as stage directions. The actor can read or listen to them and move explicitly to the next scene, without a speech-recognition gate. A regression check covers the reported scene 12, transition to scene 13, persistence, and unchanged checking of actual dialogue.

Unrecognized or empty scenes no longer block saving a whole play. They remain in the scene picker with an explicit review label and original text, without voice validation or a learned/completed state. Other scenes remain usable. Use the edit arrow beside the scene title to jump to its heading in the full-play editor.

Character selection captures the native select value before pausing and rendering the screen. A regression check uses the same select element as the change-event target and verifies selection persistence, switching both ways, and the correct cue/listening turn.

PDF italic/oblique spans are imported as bracketed stage directions using the font metadata from the pinned PDF.js build. Mixed-format lines, wrapped directions, italic scene headings, and opening directions are covered by checks. A real PDF fixture with embedded Cyrillic Arial Italic and standard Helvetica Oblique was verified. Stage directions display separately in rehearsal and the scene preview and are excluded from character speech synthesis and matching. Previously imported plain text must be re-imported from the PDF once because its font formatting was not saved by older versions.

The cast list is extracted from the front matter under Действующие лица / Персонажи / Cast / Characters and retained during PDF conversion. It is editable under «Персонажи пьесы». When present, only names from that roster (plus unambiguous first-name aliases) delimit speeches and appear in the role picker. A colon inside ordinary dialogue cannot create a new role. Russian plays default to ru-RU unless the language was manually selected. Ё/е are equivalent for matching; wrong or missing words still do not advance.

Automatic microphone mode is enabled by default. A manually started microphone also starts the rehearsal loop. After each spoken partner cue, recognition starts on the actor’s turn; correct final transcripts advance, partial exact prefixes can continue over another recognition session, and mismatches retry the same line. Recognition permission/network failures stop with a clear manual action. Three silent sessions pause listening. The mode can be turned off in settings. Actual iPhone speech service accuracy and activation behavior still require device testing.

The cast-aware path was also verified on a real two-page PDF with the roster on its first page, Cyrillic dialogue on its second page, a colon inside a speech, and an italic stage direction.
