import Foundation
import UIKit
import AVFoundation
import Speech
import Capacitor

/// Native speech for Cue on iPhone: Apple's speech recognizer for the actor's lines and
/// AVSpeechSynthesizer for the partner's cues. Both share one audio session that can record
/// and play at the same time, so neither leaves the other deaf or silent (the Safari bug).
///
/// The web page drives it through dist/native.js, which makes it look like the Web Speech API.
/// Every listening session and every utterance carries an id chosen by the page, and events
/// are tagged with it, so a late event from an old session can never reach a new one.
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
        CAPPluginMethod(name: "keepAwake", returnType: CAPPluginReturnPromise)
    ]

    private let synthesizer = AVSpeechSynthesizer()
    private var utteranceIds: [ObjectIdentifier: String] = [:]

    private var engine: AVAudioEngine?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var listeningId: String?
    private var heardSpeech = false
    private var silenceTimer: Timer?
    private var finalTimer: Timer?

    /// How long a pause ends the line, once some words have been heard.
    private let pauseToEnd: TimeInterval = 1.4

    override public func load() {
        synthesizer.delegate = self
    }

    // MARK: Audio session

    private func activateAudio() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .default,
                                options: [.defaultToSpeaker, .allowBluetooth, .allowBluetoothA2DP, .duckOthers])
        try session.setActive(true)
    }

    // MARK: Listening

    private func ensurePermissions(_ done: @escaping (Bool) -> Void) {
        let ask = {
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                DispatchQueue.main.async { done(granted) }
            }
        }
        switch SFSpeechRecognizer.authorizationStatus() {
        case .authorized:
            ask()
        case .notDetermined:
            SFSpeechRecognizer.requestAuthorization { status in
                if status == .authorized { ask() } else { DispatchQueue.main.async { done(false) } }
            }
        default:
            done(false)
        }
    }

    @objc func startListening(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { call.reject("Missing id"); return }
        let lang = call.getString("lang") ?? "ru-RU"
        let phrases = (call.getArray("phrases") as? [String]) ?? []
        call.resolve()
        DispatchQueue.main.async {
            self.endSession(cancel: true)
            self.listeningId = id
            self.ensurePermissions { granted in
                guard self.listeningId == id else { return }
                guard granted else { self.fail(id, "not-allowed"); return }
                self.begin(id: id, lang: lang, phrases: phrases)
            }
        }
    }

    private func begin(id: String, lang: String, phrases: [String]) {
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: lang)) else {
            fail(id, "language-not-supported"); return
        }
        guard recognizer.isAvailable else { fail(id, "network"); return }
        do {
            if synthesizer.isSpeaking { synthesizer.stopSpeaking(at: .immediate) }
            try activateAudio()
            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = true
            request.taskHint = .dictation
            // The words of the line help the recognizer with rare forms («перегарищем»).
            request.contextualStrings = Array(phrases.prefix(100))
            if #available(iOS 16, *) { request.addsPunctuation = false }

            let engine = AVAudioEngine()
            let input = engine.inputNode
            let format = input.outputFormat(forBus: 0)
            guard format.sampleRate > 0 else { fail(id, "audio-capture"); return }
            input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
                request.append(buffer)
            }
            engine.prepare()
            try engine.start()

            self.engine = engine
            self.request = request
            self.heardSpeech = false
            self.task = recognizer.recognitionTask(with: request) { [weak self] result, error in
                DispatchQueue.main.async { self?.handle(id: id, result: result, error: error) }
            }
            emit(id, "start")
            emit(id, "audiostart")
        } catch {
            fail(id, "audio-capture")
        }
    }

    private func handle(id: String, result: SFSpeechRecognitionResult?, error: Error?) {
        guard id == listeningId else { return }
        if let result = result {
            var transcripts: [String] = []
            for t in [result.bestTranscription] + result.transcriptions {
                let text = t.formattedString
                if !text.isEmpty && !transcripts.contains(text) { transcripts.append(text) }
            }
            if !transcripts.isEmpty {
                heardSpeech = true
                notifyListeners("recognition", data: ["id": id, "type": "result",
                                                      "transcripts": Array(transcripts.prefix(5)),
                                                      "isFinal": result.isFinal])
            }
            if result.isFinal { endSession(cancel: false); return }
            scheduleSilence(id)
        }
        if error != nil {
            if !heardSpeech { notifyListeners("recognition", data: ["id": id, "type": "error", "error": "no-speech"]) }
            endSession(cancel: true)
        }
    }

    /// Apple's recognizer keeps listening until told to stop, so a pause after some words ends the line.
    private func scheduleSilence(_ id: String) {
        silenceTimer?.invalidate()
        silenceTimer = Timer.scheduledTimer(withTimeInterval: pauseToEnd, repeats: false) { [weak self] _ in
            guard let self = self, self.listeningId == id else { return }
            self.finishAudio(id)
        }
    }

    /// Stop recording and let the recognizer deliver its final result; end anyway if it doesn't.
    private func finishAudio(_ id: String) {
        silenceTimer?.invalidate()
        stopEngine()
        request?.endAudio()
        finalTimer?.invalidate()
        finalTimer = Timer.scheduledTimer(withTimeInterval: 1.5, repeats: false) { [weak self] _ in
            guard let self = self, self.listeningId == id else { return }
            self.endSession(cancel: true)
        }
    }

    private func stopEngine() {
        if let engine = engine {
            engine.inputNode.removeTap(onBus: 0)
            if engine.isRunning { engine.stop() }
        }
        engine = nil
    }

    private func endSession(cancel: Bool) {
        silenceTimer?.invalidate(); silenceTimer = nil
        finalTimer?.invalidate(); finalTimer = nil
        stopEngine()
        request?.endAudio()
        if cancel { task?.cancel() }
        task = nil
        request = nil
        if let id = listeningId {
            listeningId = nil
            emit(id, "end")
        }
    }

    private func fail(_ id: String, _ error: String) {
        guard id == listeningId else { return }
        notifyListeners("recognition", data: ["id": id, "type": "error", "error": error])
        endSession(cancel: true)
    }

    private func emit(_ id: String, _ type: String) {
        notifyListeners("recognition", data: ["id": id, "type": type])
    }

    @objc func stopListening(_ call: CAPPluginCall) {
        let id = call.getString("id")
        call.resolve()
        DispatchQueue.main.async {
            guard let current = self.listeningId, id == nil || id == current else { return }
            self.finishAudio(current)
        }
    }

    @objc func abortListening(_ call: CAPPluginCall) {
        let id = call.getString("id")
        call.resolve()
        DispatchQueue.main.async {
            guard let current = self.listeningId, id == nil || id == current else { return }
            self.endSession(cancel: true)
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
            if self.listeningId != nil { self.endSession(cancel: true) }
            do { try self.activateAudio() } catch {}
            let utterance = AVSpeechUtterance(string: text)
            utterance.voice = (voiceId.isEmpty ? nil : AVSpeechSynthesisVoice(identifier: voiceId))
                ?? AVSpeechSynthesisVoice(language: lang)
            // Web Speech rate 1 is normal speed; AVSpeech's normal is AVSpeechUtteranceDefaultSpeechRate.
            utterance.rate = min(max(AVSpeechUtteranceDefaultSpeechRate * rate, AVSpeechUtteranceMinimumSpeechRate), AVSpeechUtteranceMaximumSpeechRate)
            self.utteranceIds[ObjectIdentifier(utterance)] = id
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
