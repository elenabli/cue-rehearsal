// Character voices: voice choice per character, long lines in pieces, and the proxy's /voices and /speak.
const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const V = require('../dist/voices.js');

(async () => {
  const list = [
    ...['Aoede', 'Kore', 'Leda'].map(n => ({ name: 'ru-RU-Chirp3-HD-' + n, gender: 'FEMALE' })),
    ...['Charon', 'Puck', 'Orus'].map(n => ({ name: 'ru-RU-Chirp3-HD-' + n, gender: 'MALE' })),
    { name: 'ru-RU-Wavenet-A', gender: 'FEMALE' }, { name: 'ru-RU-Standard-B', gender: 'MALE' },
  ];
  const map = V.assign(list, ['СВЕТЛАНА', 'НИКОЛАЙ РОМАНОВИЧ', 'ТАМАРА ПЕТРОВНА', 'ЛЁХА', 'ВСЕ'], { 'СВЕТЛАНА': { gender: 'f' }, 'ЛЁХА': { gender: 'm' }, 'ВСЕ': { gender: 'group' } });
  assert.strictEqual(map['СВЕТЛАНА'], 'ru-RU-Chirp3-HD-Aoede');
  assert.strictEqual(map['НИКОЛАЙ РОМАНОВИЧ'], 'ru-RU-Chirp3-HD-Charon', 'patronymic says male');
  assert.strictEqual(map['ТАМАРА ПЕТРОВНА'], 'ru-RU-Chirp3-HD-Kore');
  assert.strictEqual(map['ЛЁХА'], 'ru-RU-Chirp3-HD-Puck');
  assert.ok(map['ВСЕ'].includes('Chirp3-HD'));
  assert.strictEqual(new Set(Object.values(map)).size, 5, 'all different');
  // Without Chirp 3 HD: WaveNet and the rest.
  assert.strictEqual(V.assign([{ name: 'en-GB-Wavenet-A', gender: 'FEMALE' }, { name: 'en-GB-Standard-B', gender: 'MALE' }], ['ANNA'], { ANNA: { gender: 'f' } }).ANNA, 'en-GB-Wavenet-A');
  assert.strictEqual(V.genderOf('Иван Петрович', {}), 'm');
  assert.strictEqual(V.genderOf('КАБАН', {}), '?');
  // Long speeches split at sentence ends.
  const long = ('Это длинное предложение для проверки. ').repeat(80);
  const parts = V.pieces(long);
  assert.ok(parts.length >= 3 && parts.every(p => p.length <= 1400 && /\.$/.test(p)), parts.map(p => p.length).join());
  assert.strictEqual(parts.join(' '), long.trim());
  assert.deepStrictEqual(V.pieces('Коротко.'), ['Коротко.']);

  // Proxy.
  const worker = await import(pathToFileURL(path.join(__dirname, '../proxy/worker.js')).href);
  const req = worker.speakRequest({ voice: 'ru-RU-Chirp3-HD-Aoede', text: ' Привет,\n мир ' });
  assert.deepStrictEqual(req, { input: { text: 'Привет, мир' }, voice: { languageCode: 'ru-RU', name: 'ru-RU-Chirp3-HD-Aoede' }, audioConfig: { audioEncoding: 'MP3' } });
  assert.throws(() => worker.speakRequest({ voice: 'x/../y', text: 'a' }), /Unknown voice/);
  assert.throws(() => worker.speakRequest({ voice: 'ru-RU-Wavenet-A', text: 'а'.repeat(1501) }), /too long/);

  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('/v1/voices')) return Response.json({ voices: [{ name: 'ru-RU-Chirp3-HD-Aoede', ssmlGender: 'FEMALE', languageCodes: ['ru-RU'] }, { name: 'uk-UA-Wavenet-A', ssmlGender: 'FEMALE', languageCodes: ['uk-UA'] }] });
    return Response.json({ audioContent: Buffer.from('ID3fake').toString('base64') });
  };
  const store = new Map();
  const counter = new worker.DailyCounter({ storage: {
    get: async k => store.get(k), put: async o => { for (const [k, v] of Object.entries(o)) store.set(k, v); },
    list: async () => new Map(store), delete: async keys => keys.forEach(k => store.delete(k)),
  } });
  const env = { GOOGLE_TTS_KEY: 'g', VOICE_PER_IP_CHARS: '20', VOICE_DAILY_CHARS: '1000', COUNTER: { idFromName: n => n, get: () => ({ fetch: (u, init) => counter.fetch(new Request(u, init)) }) } };
  const ping = await (await worker.default.fetch(new Request('https://p.dev/ping'), env)).json();
  assert.strictEqual(ping.voices, true);
  const voices = await (await worker.default.fetch(new Request('https://p.dev/voices?lang=ru-RU'), env)).json();
  assert.deepStrictEqual(voices, { voices: [{ name: 'ru-RU-Chirp3-HD-Aoede', gender: 'FEMALE' }] });
  assert.strictEqual(calls[0].init.headers['x-goog-api-key'], 'g');
  const speak = text => worker.default.fetch(new Request('https://p.dev/speak', { method: 'POST', headers: { 'cf-connecting-ip': '1.1.1.1' }, body: JSON.stringify({ voice: 'ru-RU-Chirp3-HD-Aoede', text }) }), env);
  const ok = await speak('Привет, мир, как дела');
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.headers.get('content-type'), 'audio/mpeg');
  assert.strictEqual(Buffer.from(await ok.arrayBuffer()).toString(), 'ID3fake');
  assert.strictEqual(JSON.parse(calls[1].init.body).voice.name, 'ru-RU-Chirp3-HD-Aoede');
  assert.strictEqual(store.get('ttsip:' + new Date().toISOString().slice(0, 10) + ':1.1.1.1'), 21, 'letters counted');
  const over = await speak('Ещё');
  assert.strictEqual(over.status, 429);
  assert.match((await over.json()).error, /used up for today/);
  const noKey = await worker.default.fetch(new Request('https://p.dev/speak', { method: 'POST', body: '{}' }), {});
  assert.strictEqual(noKey.status, 503);
  console.log('Character voices passed: a different voice per character, long lines in pieces, proxy voices and speech with daily letters.');
})().catch(e => { console.error(e); process.exit(1); });
