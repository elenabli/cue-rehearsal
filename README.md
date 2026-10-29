# Cue

An iPhone-friendly rehearsal app that reads your scene partners’ lines and checks yours aloud, advancing when you get them right.

I built Cue quickly with AI coding tools, as an experiment in turning an idea into a working app.

## Try it online

[Open Cue](https://elenabli.github.io/cue-rehearsal/) to try the app in your browser. No cloning or local setup is required. On iPhone, open it in Safari and choose **Share → Add to Home Screen** to install it.

You can start with the included demo scene or import your own play. Each visitor’s scripts and progress stay in their own browser.

## Clone and run locally

You need Git and Python 3:

```sh
git clone https://github.com/elenabli/cue-rehearsal.git
cd cue-rehearsal
python3 -m http.server 4173 --directory dist
```

Open [http://localhost:4173](http://localhost:4173) on the same computer. No API keys, package installation, or build step is needed.

For access from an iPhone or another device, serve `dist/` from an HTTPS static host so microphone access is available.

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

## Development

Every push to `main` runs the tests and publishes `dist/` to GitHub Pages (`.github/workflows/pages.yml`).


Run the automated checks with Node.js:

```sh
npm test
```

Mozilla PDF.js is bundled in `dist/vendor/pdfjs/`, together with its Apache-2.0 license and supporting font, character-map, and WebAssembly assets. Optional Google Fonts have system-font fallbacks.
