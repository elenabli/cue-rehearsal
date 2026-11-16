# Cue on iPhone (native app)

The iPhone app uses the same screens as the web version. Speech goes through Apple's own speech recognizer and voice instead of Safari's. The recognizer is also told the words of the line you're about to say, which helps with rare word forms.

## First install (about 15 minutes)

You need a Mac with Xcode, Node.js (https://nodejs.org, LTS), your iPhone, and a USB cable.

1. **Get the code.** In Terminal:
   ```
   git clone https://github.com/elenabli/cue-rehearsal.git
   cd cue-rehearsal
   git checkout claude/native-lock-screen
   npm install
   npm run ios
   ```
   `npm run ios` copies the app into the iOS project and opens it in Xcode.
2. **Sign in to Xcode with your Apple ID.** In Xcode, open **Settings → Accounts**, click **+** and add your Apple ID. A free one is fine.
3. **Choose your team.** In the left sidebar, click **App** (the blue icon at the top). Select the **App** target, open the **Signing & Capabilities** tab, and pick your name (Personal Team) under **Team**.
   - If Xcode says the bundle identifier isn't available, change `com.elenabli.cue` to something unique, such as `com.elenabli.cue2`.
4. **Connect the iPhone** with the cable and unlock it. Tap **Trust** if the phone asks.
   - On iOS 16 or later, turn on **Settings → Privacy & Security → Developer Mode**, then restart the phone when it asks.
5. **Run it.** At the top of Xcode, choose your iPhone as the destination, then press **▶ (Run)**. The first build takes a few minutes while Xcode downloads Capacitor.
6. **Trust the developer on the phone** the first time: **Settings → General → VPN & Device Management →** your Apple ID **→ Trust**. Then open Cue.
7. When Cue first listens, allow **Microphone** and **Speech Recognition**.

Your plays and progress live inside the app, separate from Safari. To bring them over, save a backup in Safari (**Script → Backup → Save a backup**), then restore it in the app (**Script → Backup → Restore a backup**).

## Locked screen

In the app a scene keeps running when you lock the phone (iOS 17 or later). Locking it, or switching to another app, turns **Hands-free** on, so sounds and spoken hints take over. The orange microphone dot stays on while a scene runs; it goes off when the scene ends or you pause. Unlock and press and hold the screen to pause.

## Every 7 days (free Apple ID)

Apps signed with a free Apple ID stop opening after 7 days. Connect the phone, open the project (`npm run ios` in the `cue-rehearsal` folder), and press ▶ again. Your saved play and progress stay.

## After the code changes

```
cd cue-rehearsal
git checkout claude/native-lock-screen
git pull
npm install
npm run ios
```
Then press ▶ in Xcode.

## If something goes wrong

- **The build fails in Xcode:** take a screenshot of the red error (the ⚠︎ navigator on the left lists it) and send it over.
- **"Untrusted Developer" on the phone:** repeat step 6.
- **No speech recognition for Russian:** check **Settings → General → Keyboard → Enable Dictation** is on, and that Russian is in **Settings → General → Language & Region**.
