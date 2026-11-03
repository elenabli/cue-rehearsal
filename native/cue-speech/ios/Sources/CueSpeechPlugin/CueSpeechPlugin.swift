import Foundation
import UIKit
import AVFoundation
import Speech
import Capacitor

/// Native speech for Cue on iPhone: Apple's speech recognizer for the actor's lines and
/// AVSpeechSynthesizer for the partner's cues, sharing one play-and-record audio session.
///
/// The page drives it through dist/native.js, which makes it look like the Web Speech API.
/// Every listening session and utterance carries an id chosen by the page; events are tagged
/// with it, so a late event from an old session can never reach a new one.
///
/// Session lifecycle (one at a time, never overlapping):
///   start → [old task still shutting down? wait for it, up to 1.5 s] → audio tap → recognition task
///   → "audiostart" only when the first microphone buffer actually arrives
///   → results → pause or stop → final result → task completes → "end"
/// Every step is written to a log (no audio, no words) that Settings can show and copy.
@objc(CueSpeechPlugin)
public class CueSpeechPlugin: CAPPlugin, CAPBridgedPlugin, AVSpeechSynthesizerDelegate {
    public let identifier = "CueSpeechPlugin"
    public let jsName = "CueSpeech"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startListening", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopListening", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "abortListening", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "speak", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelSpeech", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getVoices", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "keepAwake", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getLog", returnType: CAPPluginReturnPromise)
    ]

    /// One listening session. Lives until Apple's task has really finished, not just until the page is told "end".
    private final class Session {
        let id: String
        let request: SFSpeechAudioBufferRecognitionRequest
        var task: SFSpeechRecognitionTask?
        var gotAudio = false
        var heardWords = false
        var endSent = false
        var stopping = false
        var finished = false
        var peak: Float = 0
        init(id: String, request: SFSpeechAudioBufferRecognitionRequest) { self.id = id; self.request = request }
    }

    private struct PendingStart { let id: String; let lang: String; let phrases: [String] }

    private let synthesizer = AVSpeechSynthesizer()
    private var utteranceIds: [ObjectIdentifier: String] = [:]
    private let engine = AVAudioEngine()
    private var recognizer: SFSpeechRecognizer?
    private var session: Session?          // the live session the page knows about
    private var draining: Session?         // an older session whose task is still shutting down
    private var pending: PendingStart?
    private var tapInstalled = false
    private var silenceTimer: Timer?
    private var finalTimer: Timer?
    private var drainTimer: Timer?
    private var noAudioTimer: Timer?
    private var logLines: [String] = []
    private let started = Date()

    /// How long a pause ends the line, once some words have been heard.
    private let pauseToEnd: TimeInterval = 1.4

    override public func load() {
        synthesizer.delegate = self
        do {
            try AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .default,
                options: [.defaultToSpeaker, .allowBluetooth, .allowBluetoothA2DP])
        } catch {
            log("audio category failed: \(describe(error))")
        }
        NotificationCenter.default.addObserver(self, selector: #selector(audioInterrupted(_:)),
                                               name: AVAudioSession.interruptionNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(routeChanged(_:)),
                                               name: AVAudioSession.routeChangeNotification, object: nil)
        log("loaded, iOS \(UIDevice.current.systemVersion)")
    }

    // MARK: Log (no audio, no transcripts)

    private func log(_ text: String) {
        let line = String(format: "%7.2f ", Date().timeIntervalSince(started)) + text
        logLines.append(line)
        if logLines.count > 400 { logLines.removeFirst(logLines.count - 400) }
        notifyListeners("log", data: ["line": line])
    }

    private func describe(_ error: Error) -> String {
        let e = error as NSError
        return "\(e.domain) \(e.code): \(e.localizedDescription)"
    }

    @objc func getLog(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(["lines": self.logLines]) }
    }

    @objc private func audioInterrupted(_ note: Notification) {
        let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
        let type = raw.flatMap { AVAudioSession.InterruptionType(rawValue: $0) }
        DispatchQueue.main.async {
            self.log("audio interruption \(type == .began ? "began" : "ended")")
            if type == .began { self.audioActive = false }
            if type == .began, let s = self.session { self.fail(s, "audio-capture", "interrupted") }
        }
    }

    @objc private func routeChanged(_ note: Notification) {
        let reason = (note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt) ?? 0
        let inputs = AVAudioSession.sharedInstance().currentRoute.inputs.map { $0.portType.rawValue }.joined(separator: ",")
        DispatchQueue.main.async { self.log("route change \(reason), inputs: \(inputs)") }
    }

    /// Activating the audio session blocks briefly (Xcode warns about it on the main thread), so it is done
    /// once and again only after an interruption, not before every line and cue.
    private var audioActive = false

    private func activateAudio() -> Bool {
        if audioActive { return true }
        do {
            try AVAudioSession.sharedInstance().setActive(true)
            audioActive = true
            log("audio session active")
            return true
        } catch {
            log("audio activate failed: \(describe(error))")
            return false
        }
    }

    // MARK: Permissions

    private func ensurePermissions(_ done: @escaping (Bool) -> Void) {
        let askMic = {
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                DispatchQueue.main.async { done(granted) }
            }
        }
        switch SFSpeechRecognizer.authorizationStatus() {
        case .authorized:
            askMic()
        case .notDetermined:
            SFSpeechRecognizer.requestAuthorization { status in
                if status == .authorized { askMic() } else { DispatchQueue.main.async { done(false) } }
            }
        default:
            done(false)
        }
    }

    // MARK: Listening

    @objc func startListening(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { call.reject("Missing id"); return }
        let lang = call.getString("lang") ?? "ru-RU"
        let phrases = (call.getArray("phrases") as? [String]) ?? []
        call.resolve()
        DispatchQueue.main.async {
            self.log("start \(id) requested (\(lang), \(phrases.count) phrases)")
            if let old = self.session { self.stopSession(old, cancel: true, reason: "replaced by \(id)") }
            if let skipped = self.pending { self.send(skipped.id, ["type": "end"]) }
            self.pending = PendingStart(id: id, lang: lang, phrases: phrases)
            self.startPendingWhenFree()
        }
    }

    /// Start the queued session only once no older task is still shutting down.
    private func startPendingWhenFree() {
        guard let next = pending else { return }
        if let old = draining, !old.finished {
            log("waiting for \(old.id) to finish")
            if drainTimer == nil {
                drainTimer = Timer.scheduledTimer(withTimeInterval: 1.5, repeats: false) { [weak self] _ in
                    guard let self = self else { return }
                    self.drainTimer = nil
                    if let old = self.draining, !old.finished {
                        self.log("\(old.id) did not finish in 1.5 s, starting anyway")
                        old.finished = true
                        self.draining = nil
                    }
                    self.startPendingWhenFree()
                }
            }
            return
        }
        drainTimer?.invalidate(); drainTimer = nil
        pending = nil
        ensurePermissions { granted in
            guard self.pending == nil, self.session == nil else {  // superseded meanwhile
                self.send(next.id, ["type": "end"])
                return
            }
            guard granted else {
                self.log("\(next.id) permission denied")
                self.send(next.id, ["type": "error", "error": "not-allowed"])
                self.send(next.id, ["type": "end"])
                return
            }
            self.begin(next)
        }
    }

    private func begin(_ next: PendingStart) {
        let id = next.id
        if recognizer?.locale.identifier != Locale(identifier: next.lang).identifier {
            recognizer = SFSpeechRecognizer(locale: Locale(identifier: next.lang))
        }
        guard let recognizer = recognizer else {
            log("\(id) no recognizer for \(next.lang)")
            send(id, ["type": "error", "error": "language-not-supported"]); send(id, ["type": "end"]); return
        }
        guard recognizer.isAvailable else {
            log("\(id) recognizer unavailable")
            send(id, ["type": "error", "error": "network", "detail": "recognizer unavailable"]); send(id, ["type": "end"]); return
        }
        if synthesizer.isSpeaking { synthesizer.stopSpeaking(at: .immediate) }
        guard activateAudio() else {
            send(id, ["type": "error", "error": "audio-capture", "detail": "audio session"]); send(id, ["type": "end"]); return
        }

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.taskHint = .dictation
        // The words of the line help the recognizer with rare forms («перегарищем»).
        request.contextualStrings = Array(next.phrases.prefix(100))
        if #available(iOS 16, *) { request.addsPunctuation = false }
        let s = Session(id: id, request: request)
        session = s

        let input = engine.inputNode
        if tapInstalled { input.removeTap(onBus: 0); tapInstalled = false }
        let format = input.outputFormat(forBus: 0)
        log("\(id) input format \(Int(format.sampleRate)) Hz, \(format.channelCount) ch")
        guard format.sampleRate > 0, format.channelCount > 0 else {
            fail(s, "audio-capture", "no input format"); return
        }
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self, weak s] buffer, _ in
            guard let s = s else { return }
            s.request.append(buffer)
            var peak: Float = 0
            if let data = buffer.floatChannelData?[0] {
                for i in stride(from: 0, to: Int(buffer.frameLength), by: 8) { peak = max(peak, abs(data[i])) }
            }
            DispatchQueue.main.async { self?.audioArrived(s, peak: peak) }
        }
        tapInstalled = true
        do {
            engine.prepare()
            try engine.start()
        } catch {
            fail(s, "audio-capture", describe(error)); return
        }

        s.task = recognizer.recognitionTask(with: request) { [weak self, weak s] result, error in
            DispatchQueue.main.async {
                guard let self = self, let s = s else { return }
                self.handle(s, result: result, error: error)
            }
        }
        log("\(id) listening (engine running: \(engine.isRunning))")
        send(id, ["type": "start"])

        noAudioTimer?.invalidate()
        noAudioTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: false) { [weak self, weak s] _ in
            guard let self = self, let s = s, self.session === s, !s.gotAudio else { return }
            self.log("\(s.id) no microphone audio after 2 s")
            self.fail(s, "audio-capture", "no microphone audio")
        }
    }

    private func audioArrived(_ s: Session, peak: Float) {
        guard session === s, !s.stopping else { return }
        if !s.gotAudio {
            s.gotAudio = true
            noAudioTimer?.invalidate(); noAudioTimer = nil
            log("\(s.id) first microphone audio")
            send(s.id, ["type": "audiostart"])
        }
        if peak > s.peak + 0.05 { s.peak = peak; log("\(s.id) level " + String(format: "%.2f", Double(peak))) }
    }

    private func handle(_ s: Session, result: SFSpeechRecognitionResult?, error: Error?) {
        if let result = result {
            if session === s, !s.endSent {
                var transcripts: [String] = []
                for t in [result.bestTranscription] + result.transcriptions {
                    let text = t.formattedString
                    if !text.isEmpty && !transcripts.contains(text) { transcripts.append(text) }
                }
                if !transcripts.isEmpty {
                    if !s.heardWords { log("\(s.id) first words") }
                    s.heardWords = true
                    send(s.id, ["type": "result", "transcripts": Array(transcripts.prefix(5)), "isFinal": result.isFinal])
                }
                if !result.isFinal && !s.stopping { scheduleSilence(s) }
            }
            if result.isFinal {
                log("\(s.id) final result")
                taskFinished(s)
                return
            }
        }
        if let error = error {
            let e = error as NSError
            log("\(s.id) task error \(describe(error))")
            if session === s, !s.endSent, !s.heardWords {
                // Apple uses 1110 for "no speech detected"; anything else is a real failure worth naming.
                let kind = e.code == 1110 ? "no-speech" : (e.code == 203 || e.domain == NSURLErrorDomain ? "network" : "service")
                send(s.id, ["type": "error", "error": kind, "detail": "\(e.domain) \(e.code)"])
            }
            taskFinished(s)
        }
    }

    /// Apple's task has completed (final result or error): its resources are free for the next session.
    private func taskFinished(_ s: Session) {
        guard !s.finished else { return }
        s.finished = true
        log("\(s.id) task finished")
        if session === s { stopSession(s, cancel: false, reason: "task finished") }
        if draining === s { draining = nil }
        startPendingWhenFree()
    }

    /// Apple's recognizer keeps listening until told to stop, so a pause after some words ends the line.
    private func scheduleSilence(_ s: Session) {
        silenceTimer?.invalidate()
        silenceTimer = Timer.scheduledTimer(withTimeInterval: pauseToEnd, repeats: false) { [weak self, weak s] _ in
            guard let self = self, let s = s, self.session === s else { return }
            self.log("\(s.id) pause, finishing")
            self.finishAudio(s)
        }
    }

    /// Stop recording and let the recognizer deliver its final result; end anyway if it doesn't.
    private func finishAudio(_ s: Session) {
        guard session === s, !s.stopping else { return }
        s.stopping = true
        silenceTimer?.invalidate(); silenceTimer = nil
        noAudioTimer?.invalidate(); noAudioTimer = nil
        stopEngine()
        s.request.endAudio()
        finalTimer?.invalidate()
        finalTimer = Timer.scheduledTimer(withTimeInterval: 1.5, repeats: false) { [weak self, weak s] _ in
            guard let self = self, let s = s, self.session === s else { return }
            self.log("\(s.id) no final result in 1.5 s")
            self.stopSession(s, cancel: true, reason: "no final result")
        }
    }

    private func stopEngine() {
        if tapInstalled { engine.inputNode.removeTap(onBus: 0); tapInstalled = false }
        if engine.isRunning { engine.stop() }
    }

    /// Tell the page the session is over (once) and, if its task is still running, keep it as `draining`
    /// until Apple reports it finished, so the next session never overlaps it.
    private func stopSession(_ s: Session, cancel: Bool, reason: String) {
        guard session === s else { return }
        session = nil
        silenceTimer?.invalidate(); silenceTimer = nil
        finalTimer?.invalidate(); finalTimer = nil
        noAudioTimer?.invalidate(); noAudioTimer = nil
        s.stopping = true
        stopEngine()
        s.request.endAudio()
        if s.task == nil {
            s.finished = true  // never got as far as a recognition task: nothing to wait for
        } else if !s.finished {
            if cancel { s.task?.cancel() }
            draining = s
        }
        log("\(s.id) ended (\(reason))")
        if !s.endSent { s.endSent = true; send(s.id, ["type": "end"]) }
    }

    private func fail(_ s: Session, _ error: String, _ detail: String) {
        guard session === s, !s.endSent else { return }
        log("\(s.id) fail \(error): \(detail)")
        send(s.id, ["type": "error", "error": error, "detail": detail])
        stopSession(s, cancel: true, reason: error)
    }

    private func send(_ id: String, _ data: [String: Any]) {
        var payload = data
        payload["id"] = id
        notifyListeners("recognition", data: payload)
    }

    @objc func stopListening(_ call: CAPPluginCall) {
        let id = call.getString("id")
        call.resolve()
        DispatchQueue.main.async {
            if let s = self.session, s.id == id {
                self.log("\(s.id) stop requested")
                self.finishAudio(s)
            } else if let next = self.pending, next.id == id {
                self.pending = nil
                self.send(next.id, ["type": "end"])
            }
        }
    }

    @objc func abortListening(_ call: CAPPluginCall) {
        let id = call.getString("id")
        call.resolve()
        DispatchQueue.main.async {
            if let s = self.session, s.id == id {
                self.log("\(s.id) abort requested")
                self.stopSession(s, cancel: true, reason: "aborted")
            } else if let next = self.pending, next.id == id {
                self.pending = nil
                self.send(next.id, ["type": "end"])
            }
        }
    }

    // MARK: Partner voice

    @objc func speak(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let text = call.getString("text") else { call.reject("Missing text"); return }
        let lang = call.getString("lang") ?? "ru-RU"
        let rate = Float(call.getDouble("rate") ?? 1)
        let voiceId = call.getString("voice") ?? ""
        call.resolve()
        DispatchQueue.main.async {
            if let s = self.session { self.stopSession(s, cancel: true, reason: "partner speaks") }
            _ = self.activateAudio()
            let utterance = AVSpeechUtterance(string: text)
            utterance.voice = (voiceId.isEmpty ? nil : AVSpeechSynthesisVoice(identifier: voiceId))
                ?? AVSpeechSynthesisVoice(language: lang)
            // Web Speech rate 1 is normal speed; AVSpeech's normal is AVSpeechUtteranceDefaultSpeechRate.
            utterance.rate = min(max(AVSpeechUtteranceDefaultSpeechRate * rate, AVSpeechUtteranceMinimumSpeechRate), AVSpeechUtteranceMaximumSpeechRate)
            self.utteranceIds[ObjectIdentifier(utterance)] = id
            self.log("speak \(id) (\(text.count) chars)")
            self.synthesizer.speak(utterance)
        }
    }

    @objc func cancelSpeech(_ call: CAPPluginCall) {
        call.resolve()
        DispatchQueue.main.async {
            self.utteranceIds.removeAll()
            if self.synthesizer.isSpeaking { self.synthesizer.stopSpeaking(at: .immediate) }
        }
    }

    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        DispatchQueue.main.async {
            guard let id = self.utteranceIds.removeValue(forKey: ObjectIdentifier(utterance)) else { return }
            self.log("spoke \(id)")
            self.notifyListeners("speech", data: ["id": id, "type": "end"])
        }
    }

    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        DispatchQueue.main.async {
            guard let id = self.utteranceIds.removeValue(forKey: ObjectIdentifier(utterance)) else { return }
            self.notifyListeners("speech", data: ["id": id, "type": "error"])
        }
    }

    @objc func getVoices(_ call: CAPPluginCall) {
        let voices = AVSpeechSynthesisVoice.speechVoices().map { voice -> [String: Any] in
            ["voiceURI": voice.identifier, "name": voice.name, "lang": voice.language]
        }
        call.resolve(["voices": voices])
    }

    // MARK: Screen

    @objc func keepAwake(_ call: CAPPluginCall) {
        let on = call.getBool("on") ?? false
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = on
            call.resolve()
        }
    }
}
