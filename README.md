# Cue

A phone-friendly rehearsal app (iPhone and Android) that reads your scene partners’ lines and checks yours aloud, advancing when you get them right.

I built Cue quickly with AI coding tools, as an experiment in turning an idea into a working app.

## Try it online

[Open Cue](https://elenabli.github.io/cue-rehearsal/) to try the app in your browser. No cloning or local setup is required. On iPhone, open it in Safari and choose **Share → Add to Home Screen** to install it. On Android, open it in Chrome and tap **Install** (or **⋮ → Install app**).

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

1. Open Cue in Safari on iPhone or Chrome on Android. To install it, choose **Share → Add to Home Screen** on iPhone, or **⋮ → Install app** on Android.
2. Open **Script** (**My script** on a computer) and upload the entire play as a text-based PDF or a Word `.docx` file, including the cast list. Files can be up to 25 MB. You can also import a UTF-8 `.txt` file or paste text. Older Word `.doc` files need to be saved as `.docx` or PDF first.
   Scenes split at headings such as «Сцена 1». Plays that number scenes on their own line («( 4 A )», «12.») or head them with an all-caps place («ДОМ СЕМЬИ ЭЙСКОНЕН») get «Сцена …» headings added, which you can edit before saving. Foreign phrases with a Russian transcription («Tyst! [Тюст!]») are checked against the transcription.
3. Extract the play, then review the dialogue and **Characters**. Put one character name on each line in that field.
4. Save the play and select your character under **I’m playing**. The scene list shows the scenes you speak in, with your line count and a tick for each scene you have finished; scenes without you are folded away below. Tap a scene to choose it.
5. Start rehearsal and allow microphone access. Cue speaks the other characters’ lines and listens on your turns. A matching transcript advances the scene; incorrect or missing words keep you on the same line. Stretched words such as «ну-у» count as the plain word, and longer lines forgive a single misheard word. At the end of a scene Cue offers your next scene, the same scene again, or a return to the list.

If the browser requires a tap to start listening, use **Speak**. If listening seems stuck, tap **Speak** again to start over. If the mic can’t hear you, turn on **Settings → If listening fails → Type my lines instead of speaking** to check lines by typing. The screen stays on while a rehearsal is running. Rehearsal settings let you choose the language and voice, adjust the partner’s pace, hide your lines, or turn automatic microphone activation off.

## Hands-free (phone in your pocket)

Turn on **Hands-free** before you start to rehearse with the phone in your pocket, for example on a walk. Sounds tell you what happened, so you never need to look:

- a rising chime when the line is right;
- a low tone when it's wrong. After the first miss you hear your cue again; after the second, Cue reads your line to you; after the third, it reads the line and moves on;
- if you stop to remember, what you've said so far is kept. After a quiet spell (about 10 seconds) Cue says the next few words, and you carry on from there. Each further quiet spell gives a longer hint, up to the whole line; after that Cue pauses and says so;
- a short fanfare and "Scene complete" at the end.

Taps are ignored while hands-free runs, so the phone can't press buttons in your pocket. Press and hold the screen to pause. The screen stays on: if the phone locks, Safari stops listening, so leave it unlocked. Headphones such as AirPods work as microphone and speaker. On iPhone the sounds follow the silent switch, so turn silent mode off.

Without hands-free, a pause partway through a line is also thinking time: Cue keeps what you said and waits, and only checks a half line after a long silence.

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

PDF extraction happens on your device. Scripts, the selected character, and progress for each scene are saved in that browser. Cue keeps several plays, each with its own character, scene and progress: **Script → Add a play** imports another one, and tapping a play in the list opens it. They do not sync between devices, and clearing website data removes them. **Script → Backup → Save a backup** writes one file with every play and its progress; **Restore a backup** brings it back on this or another device.

On Android, use Chrome: it has speech input (through Google's speech service), and the app installs from Chrome with its own icon. Firefox on Android has no speech input, so lines can only be typed there. On Android the mic opens fresh for each of your lines; the iPhone-only settings (one open mic for the whole scene, sharing the audio session) are hidden.

Speech input uses the browser’s Web Speech service. It needs microphone permission and may require an internet connection. Audio may be processed by the browser vendor’s speech service, and recognition can mishear spoken lines. After an initial visit, the app is cached for offline reading; speech input may still need a connection.

## Development

Every push to `main` runs the tests and publishes `dist/` to GitHub Pages (`.github/workflows/pages.yml`).


Run the automated checks with Node.js:

```sh
npm test
```

Mozilla PDF.js is bundled in `dist/vendor/pdfjs/`, together with its Apache-2.0 license and supporting font, character-map, and WebAssembly assets. Optional Google Fonts have system-font fallbacks.
