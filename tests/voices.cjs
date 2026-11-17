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
  const cast = ['СВЕТЛАНА', 'НИКОЛАЙ РОМАНОВИЧ', 'ТАМАРА ПЕТРОВНА', 'ЛЁХА', 'ВСЕ', 'АЛИНА', 'ДЕДУШКА'];
  const info = { 'СВЕТЛАНА': { gender: 'f', age: 'adult' }, 'ЛЁХА': { gender: 'm', age: 'young' }, 'ВСЕ': { gender: 'group', age: '?' }, 'АЛИНА': { gender: 'f', age: 'child' }, 'ТАМАРА ПЕТРОВНА': { gender: 'f', age: 'old' } };
  const all = ['Aoede', 'Kore', 'Leda', 'Zephyr', 'Gacrux', 'Sulafat'].map(n => ({ name: 'ru-RU-Chirp3-HD-' + n, gender: 'FEMALE' }))
    .concat(['Charon', 'Puck', 'Orus', 'Algenib', 'Fenrir'].map(n => ({ name: 'ru-RU-Chirp3-HD-' + n, gender: 'MALE' })), list.slice(6));
  const map = V.assign(all, cast, info);
  const v = n => map[n].voice.split('-').pop();
  assert.strictEqual(v('СВЕТЛАНА'), 'Aoede');
  assert.strictEqual(v('НИКОЛАЙ РОМАНОВИЧ'), 'Charon', 'patronymic says male');
  assert.strictEqual(v('ТАМАРА ПЕТРОВНА'), 'Gacrux', 'old woman, mature voice');
  assert.strictEqual(v('ЛЁХА'), 'Puck', 'young man');
  assert.strictEqual(v('АЛИНА'), 'Leda', 'child, youthful voice');
  assert.strictEqual(v('ДЕДУШКА'), 'Algenib', 'old from the name');
  assert.strictEqual(map['АЛИНА'].tune, 1.08);
  assert.strictEqual(map['ДЕДУШКА'].tune, 0.96);
  assert.strictEqual(map['СВЕТЛАНА'].tune, 1);
  assert.strictEqual(new Set(Object.values(map).map(m => m.voice)).size, cast.length, 'all different');
  // More characters than voices: voices repeat instead of failing.
  const many = V.assign(list.slice(0, 2), ['A', 'B', 'C'], { A: { gender: 'f' }, B: { gender: 'f' }, C: { gender: 'f' } });
  assert.ok(many.C.voice.includes('Chirp3-HD'));
  // Without Chirp 3 HD: WaveNet and the rest.
  assert.strictEqual(V.assign([{ name: 'en-GB-Wavenet-A', gender: 'FEMALE' }, { name: 'en-GB-Standard-B', gender: 'MALE' }], ['ANNA'], { ANNA: { gender: 'f' } }).ANNA.voice, 'en-GB-Wavenet-A');
  assert.strictEqual(V.genderOf('Иван Петрович', {}), 'm');
  assert.strictEqual(V.genderOf('КАБАН', {}), '?');
  assert.strictEqual(V.ageOf('СТАРУХА', {}), 'old');
  assert.strictEqual(V.ageOf('ДЕДОК', {}), '?');
  assert.strictEqual(V.ageOf('Little Boy', {}), 'child');
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
  console.log('Character voices passed: a different voice per character by gender and age, long lines in pieces, proxy voices and speech with daily letters.');
})().catch(e => { console.error(e); process.exit(1); });
