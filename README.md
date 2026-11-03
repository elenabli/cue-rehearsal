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

Speech input uses the browser’s Web Speech service (on iPhone, see [iPhone app](#iphone-app)). It needs microphone permission and may require an internet connection. Audio may be processed by the browser vendor’s speech service, and recognition can mishear spoken lines. After an initial visit, the app is cached for offline reading; speech input may still need a connection.

## Development

Every push to `main` runs the tests and publishes `dist/` to GitHub Pages (`.github/workflows/pages.yml`).


Run the automated checks with Node.js:

```sh
npm test
```

Mozilla PDF.js is bundled in `dist/vendor/pdfjs/`, together with its Apache-2.0 license and supporting font, character-map, and WebAssembly assets. Optional Google Fonts have system-font fallbacks.

## iPhone app

On iPhone, use the native app in `ios/` rather than Safari. It has the same screens as the web version, but listens and speaks through Apple's own speech engine. See [docs/IOS.md](docs/IOS.md) to install it with Xcode. The web version still works unchanged in desktop browsers and is a fine way to try Cue.

### Why we moved off Safari

Cue depends on two browser features: speech recognition to hear your lines, and speech synthesis to read your partners' lines. On iPhone Safari, rehearsal kept breaking in three ways:

- **Listening went deaf after a mistake.** The first attempt at a line worked. If it didn't match and Cue started listening again, Safari kept the microphone open but returned no words.
- **Unusual play words were misheard.** Safari's recognizer can't be told what words to expect. A line like «Господи, перегарищем-то разит!» came back as «…рящий тормозит», so a correctly spoken line still failed.
- **The partner voice went silent.** After the microphone had been used, partners' lines often weren't read aloud, and the rehearsal stalled after a few lines.

**How much of this was Safari, and how much was Cue?** We don't know for certain. The web version starts a new, short recognition session for every line and every retry (`continuous = false`). Starting and stopping sessions this often is exactly the pattern that a known WebKit problem describes ([WebAudio/web-speech-api#96](https://github.com/WebAudio/web-speech-api/issues/96)): on iOS, recognition can fail silently after its first result. So our own design may have triggered the "deaf" behaviour. One long-running session for the whole scene was never tried, and it might have avoided it.

Workarounds we did try in the web app: a watchdog that restarts listening when it hears nothing, waiting for the old session to fully close before starting a new one, replacing sessions that never receive audio, a Speak button that always starts fresh, and replaying the cue before each retry. None of these fixed it on the phone.

We moved to a native app anyway, because it solves all three problems together. Safari cannot be told the words of the next line, and on iOS it gives no control over how the microphone and voice share audio. The native app can do both.

### What the native app does differently

The iPhone app wraps the same web interface with [Capacitor](https://capacitorjs.com) and adds a small Swift plugin (`native/cue-speech`):

- **Recognition** uses Apple's Speech framework (`SFSpeechRecognizer`) directly. Each listening attempt is a clean new session, so retries keep working.
- **The recognizer is told the words of your next line** (contextual strings), which helps it get rare words and unusual word forms right.
- **Partner lines** are spoken with `AVSpeechSynthesizer`, with the audio session set up for playing and recording together, so the voice and microphone no longer interfere.
- The app's JavaScript is shared with the web version. On iPhone, `dist/native.js` stands in for the browser's speech features, so both versions run the same rehearsal logic.

The trade-off is installation: the app is installed from Xcode on a Mac rather than from a link. With a free Apple ID it must be re-installed every 7 days (your play and progress stay). The steps are in [docs/IOS.md](docs/IOS.md).
