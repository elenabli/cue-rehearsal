// Natural voices play through Web Audio, so the iPhone mic still hears after them; the <audio> element is
// used only for a non-Natural pace, and it is emptied afterwards.
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const code = fs.readFileSync(require('path').join(__dirname, '../dist/voices.js'), 'utf8');
const sources = [], elements = [], logs = [];
class FakeContext {
  constructor() { this.state = 'suspended'; this.destination = {}; }
  resume() { this.state = 'running'; return Promise.resolve(); }
  decodeAudioData(bytes, ok) { const b = { duration: 0.05 }; ok(b); return Promise.resolve(b); }
  createBufferSource() { const s = { playbackRate: { value: 1 }, connect() {}, start() { s.started = true; setTimeout(() => s.onended?.(), 5); }, stop() { s.stopped = true; } }; sources.push(s); return s; }
}
class FakeAudio {
  constructor() { this.attrs = {}; this.loads = 0; elements.push(this); }
  setAttribute(k, v) { this.attrs[k] = v; }
  removeAttribute(k) { if (k === 'src') this.src = ''; }
  load() { this.loads++; }
  pause() { this.paused = true; }
  play() { this.paused = false; setTimeout(() => { this.onplaying?.(); setTimeout(() => this.onended?.(), 5); }, 2); return Promise.resolve(); }
}
const window = { AudioContext: FakeContext, Audio: FakeAudio, CueVoiceLog: m => logs.push(m), localStorage: { getItem: () => null, setItem() {} } };
const ctx = vm.createContext({ window, Audio: FakeAudio, localStorage: window.localStorage, fetch: async () => ({ arrayBuffer: async () => new ArrayBuffer(4) }), setTimeout, clearTimeout, Promise, console });
vm.runInContext(code, ctx);
const V = window.CueVoices;
const play = (parts, rate, tune) => new Promise((ok, no) => V.playClips(parts, rate, { start() {}, end: ok, fail: no }, tune));
(async () => {
  V.unlock();
  const unlockEl = elements[0];
  await new Promise(r => setTimeout(r, 10));
  assert.strictEqual(unlockEl.src, '', 'the silent unlock sound does not stay loaded');
  await play(['blob:a', 'blob:b'], 1, 1);
  assert.strictEqual(sources.length, 2, 'both pieces through web audio');
  assert.ok(sources.every(s => s.started));
  assert.ok(logs.includes('voices: playing through web audio'));
  await play(['blob:c'], 1, 1.08);
  assert.strictEqual(sources.at(-1).playbackRate.value, 1.08, 'a child plays a little higher');
  // Slower or Faster pace keeps its pitch on the audio element, which lets go of the audio afterwards.
  const before = sources.length;
  await play(['blob:d'], 0.8, 1);
  assert.strictEqual(sources.length, before, 'not web audio');
  assert.strictEqual(elements[0].playbackRate, 0.8);
  assert.strictEqual(elements[0].src, '', 'element emptied after the line');
  // Stopping in the middle stops the sound.
  V.playClips(['blob:e'], 1, { start() {}, end() { throw Error('should not end'); }, fail() {} }, 1);
  await new Promise(r => setTimeout(r, 1));
  V.stop();
  assert.ok(sources.at(-1).stopped, 'stop() stops the web audio source');
  await new Promise(r => setTimeout(r, 20));
  console.log('Voice player passed: web audio for natural voices, the element only for another pace and emptied after use.');
})().catch(err => { console.error(err); process.exit(1); });
