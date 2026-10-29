# Cue

An iPhone-friendly rehearsal app that reads your scene partners’ lines and checks yours aloud, advancing when you get them right.

## Rehearse a play

1. Open Cue in Safari. To install it on iPhone, choose **Share → Add to Home Screen**.
2. Open **My script** and upload the entire play as a text-based PDF, including the cast list. Files can be up to 25 MB. You can also import a UTF-8 `.txt` file or paste text.
3. Extract the play, then review the dialogue and **Персонажи пьесы** (characters). Put one character name on each line in that field.
4. Save the play, choose a scene, and select your character under **I’m playing**.
5. Start rehearsal and allow microphone access. Cue speaks the other characters’ lines and listens on your turns. A matching transcript advances the scene; incorrect or missing words keep you on the same line.

If the browser requires a tap to start listening, use **Говорить**. You can also type a line to check it. Rehearsal settings let you choose the language and voice, adjust the partner’s pace, hide your lines, or turn automatic microphone activation off.

## Script format

Numbered headings such as `Сцена 1`, `СЦЕНА 22`, and `Scene 1` divide the play into scenes. Put headings on their own lines.

```text
ДЕЙСТВУЮЩИЕ ЛИЦА
Анна
Борис

Сцена 1
Анна: Ты уже здесь?
Борис: Я пришёл пораньше. [Смотрит на часы.]
```

The cast list before the scenes supplies the available roles. Italic PDF text and text in `[brackets]` are stage directions: they appear separately and are excluded from character speech and line checking. Scenes containing only directions can be read or listened to before moving on. Scenes whose dialogue cannot be interpreted retain their text and are marked for review.

Punctuation, capitalization, apostrophes, and Russian `ё`/`е` do not affect matching. A correctly recognized beginning can be continued after a pause. Page numbers in PDF margins are excluded from dialogue.

Scanned PDFs need text recognition (OCR) in a PDF app before import. Review extracted text because PDF reading order and font metadata can vary.

## Data and browser support

PDF extraction happens on your device. Scripts, the selected character, and progress for each scene are saved in that browser. They do not sync between devices; clearing website data removes them. Use **Export whole play** to keep a copy of the script.

Speech input uses the browser’s Web Speech service. It needs microphone permission and may require an internet connection. Audio may be processed by the browser vendor’s speech service, and recognition can mishear spoken lines. After an initial visit, the app is cached for offline reading; speech input may still need a connection.

## Run your own copy

The source is a static web app with no installation or build step. Serve the `dist/` directory:

```sh
python3 -m http.server 4173 --directory dist
```

Open `http://localhost:4173`. For use on another device, deploy `dist/` to a static host with HTTPS so microphone access is available. Each visitor’s play and progress remain in their own browser.

Run the automated checks with Node.js:

```sh
npm test
```

Mozilla PDF.js is bundled in `dist/vendor/pdfjs/`, together with its Apache-2.0 license and supporting font, character-map, and WebAssembly assets. Optional Google Fonts have system-font fallbacks.
