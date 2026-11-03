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
2. Open **Script** (**My script** on a computer) and upload the entire play as a text-based PDF, including the cast list. Files can be up to 25 MB. You can also import a UTF-8 `.txt` file or paste text.
3. Extract the play, then review the dialogue and **Characters**. Put one character name on each line in that field.
4. Save the play, choose a scene, and select your character under **I’m playing**.
5. Start rehearsal and allow microphone access. Cue speaks the other characters’ lines and listens on your turns. A matching transcript advances the scene; incorrect or missing words keep you on the same line. Stretched words such as «ну-у» count as the plain word, and longer lines forgive a single misheard word.

If the browser requires a tap to start listening, use **Speak**. If listening seems stuck, tap **Speak** again to start over. You can also choose **Type your line instead** to check a line by typing. The screen stays on while a rehearsal is running. Rehearsal settings let you choose the language and voice, adjust the partner’s pace, hide your lines, or turn automatic microphone activation off.

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

## Speech on iPhone: what went wrong, and what we learned

For a while, rehearsing in iPhone Safari kept breaking. After a missed line, Cue stopped hearing you: the microphone stayed on but no words came back. The partner voice also went silent after a few lines, so the scene stalled.

**We first blamed Safari.** A known WebKit report ([WebAudio/web-speech-api#96](https://github.com/WebAudio/web-speech-api/issues/96)) describes iOS recognition failing silently after its first result. Several web workarounds didn't help on the phone, so we built a native iPhone app that used Apple's own speech framework (#9). It worked on the phone. We later removed it (#11) to keep Cue a single web app.

**A test showed the problem was Cue's own code.** A small Safari test page (#14) ran on the same iPhone. It heard five rounds in a row, both with a new recognition session each round and with one reused session, and it spoke every cue. The app differed from that page in three ways:

- It cancelled speech synthesis before every partner line. On iOS, this can make the next line disappear.
- It aborted recognition sessions: a microphone check at Start, a watchdog that killed "deaf" sessions, and an abort when you tapped Speak. Aborting leaves Safari's recognizer in a bad state.
- It started a new session before the old one had fully ended.

Ironically, some of these were workarounds added to fix the problem. #18 removes them. Speech is cancelled only when something is actually playing, sessions are stopped instead of aborted, and a new session starts only after the old one has ended.

**One real limit remains.** Safari's recognizer can't be told which words to expect, so rare or unusual words can still be misheard. For example, «Господи, перегарищем-то разит!» once came back as «…рящий тормозит». The speech lab page (#12, #17) compares other speech-to-text services for this case.

## Development

Every push to `main` runs the tests and publishes `dist/` to GitHub Pages (`.github/workflows/pages.yml`).


Run the automated checks with Node.js:

```sh
npm test
```

Mozilla PDF.js is bundled in `dist/vendor/pdfjs/`, together with its Apache-2.0 license and supporting font, character-map, and WebAssembly assets. Optional Google Fonts have system-font fallbacks.
