// Smart import: label → script conversion, stream reading, and the proxy's request building.
const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const AI = require('../dist/ai-import.js');
const Pdf = require('../dist/pdf-import.js');
const Core = require('../dist/core.js');

(async () => {
  const text = `ПАЛЕЦ ГЕРОЯ
Пьеса в двух действиях
ДЕЙСТВУЮЩИЕ ЛИЦА
ИВАН ПЕТРОВИЧ
МАША
Действие первое
Комната. Утро.
ИВАН ПЕТРОВИЧ. Где мой палец?
(Ищет под столом.)
Маша (тихо). Вот он,
на полке.
ИВАН
Спасибо.
3
Действие второе
ВСЕ: Ура!`;
  const lines = AI.playLines(text);
  assert.strictEqual(lines.length, 16);
  const labels = {
    language: 'ru', title: 'Палец героя',
    cast: [
      { name: 'ИВАН ПЕТРОВИЧ', aliases: ['ИВАН'], gender: 'm', age: 'adult' },
      { name: 'МАША', aliases: [], gender: 'f', age: 'young' },
      { name: 'ВСЕ', aliases: [], gender: 'group', age: '?' },
    ],
    scenes: [{ line: 6, title: 'Действие первое' }, { line: 15, title: 'Действие второе' }],
    marks: [[1, -2], [6, -3], [7, -1], [8, 0], [10, 1], [12, 0], [14, -2], [15, -3], [16, 2]],
  };
  const r = AI.toScript(lines, labels);
  assert.strictEqual(r.scenes.length, 2);
  assert.deepStrictEqual(r.scenes.map(s => s.title), ['Сцена 1. Действие первое', 'Сцена 2. Действие второе']);
  assert.ok(r.script.includes('ИВАН ПЕТРОВИЧ: Где мой палец? [Ищет под столом.]'), r.script);
  assert.ok(r.script.includes('МАША: [тихо] Вот он, на полке.'), r.script);
  assert.ok(r.script.includes('ИВАН ПЕТРОВИЧ: Спасибо.'), r.script);
  assert.ok(r.script.includes('[Комната. Утро.]'));
  assert.ok(!r.script.includes('3\n'), 'page number dropped');
  // The app's own pipeline reads the result.
  const split = Pdf.splitPlayScenes(r.script);
  assert.strictEqual(split.scenes.length, 2);
  const cast = Pdf.extractCast(r.script);
  assert.deepStrictEqual(cast, ['ИВАН ПЕТРОВИЧ', 'МАША', 'ВСЕ']);
  const parsed = Core.parseScript(split.scenes[0].script, cast);
  assert.deepStrictEqual(parsed.map(l => l.speaker), ['ИВАН ПЕТРОВИЧ', 'МАША', 'ИВАН ПЕТРОВИЧ']);
  assert.deepStrictEqual(r.warnings.filter(w => !/only once/.test(w)), []);

  // Gaps, unknown speakers and speeches before any scene heading.
  const r2 = AI.toScript(['HAMLET: To be.', 'GHOST: Remember me.', 'stray line', 'HORATIO. Hush.'], {
    language: 'en', title: '', scenes: [],
    cast: [{ name: 'HAMLET', aliases: [], gender: 'm', age: 'young' }, { name: 'GHOST', aliases: [], gender: 'm', age: 'old' }],
    marks: [[1, 0], [2, 1], [4, 5], [99, 0]],
  });
  assert.ok(r2.script.startsWith('CHARACTERS\nHAMLET\nGHOST\n\nScene 1'), r2.script);
  assert.ok(r2.script.includes('GHOST: Remember me. stray line'), r2.script);
  assert.ok(r2.warnings.some(w => /not in the cast and were left out/.test(w)));
  // Label stripping: aliases, ё/е, a label the model did not expect.
  assert.strictEqual(AI.stripLabel('Лёха. Привет', ['ЛЕХА']).rest, '. Привет');
  assert.deepStrictEqual(AI.stripLabel('КАБАН: Да', ['ЛЁХА']), { rest: ': Да', label: 'КАБАН' });
  assert.strictEqual(AI.stripLabel('Да, конечно', ['ЛЁХА']).rest, 'Да, конечно');
  const r3 = AI.toScript(['ЛЁХА. Привет.', 'КАБАН. Здорово.'], { language: 'ru', title: '', scenes: [], cast: [{ name: 'ЛЁХА', aliases: [], gender: 'm', age: 'young' }], marks: [[1, 0], [2, 0]] });
  assert.ok(r3.script.includes('ЛЁХА: Здорово.'));
  assert.ok(r3.warnings.some(w => /КАБАН → ЛЁХА/.test(w)), r3.warnings.join('|'));

  // Stream reading.
  const events = [
    { type: 'message_start', message: { model: 'claude-sonnet-5-5', usage: { input_tokens: 1000, output_tokens: 1 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: '' } },
    { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: '{"language":"en","title":"T",' } },
    { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: '"cast":[],"scenes":[],"marks":[]}' } },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 200 } },
    { type: 'message_stop' },
  ];
  const sse = events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
  // Split mid-event to check buffering.
  const bytes = new TextEncoder().encode(sse);
  const stream = new ReadableStream({ start(c) { c.enqueue(bytes.slice(0, 77)); c.enqueue(bytes.slice(77)); c.close(); } });
  const res = await AI.readStream(new Response(stream, { status: 200 }));
  assert.strictEqual(res.labels.title, 'T');
  assert.strictEqual(res.usage.output_tokens, 200);
  assert.strictEqual(res.model, 'claude-sonnet-5-5');
  assert.strictEqual(AI.cost(res.usage, res.model).toFixed(4), '0.0040');
  await assert.rejects(AI.readStream(new Response(JSON.stringify({ error: 'Unknown invite code.' }), { status: 401 })), /Unknown invite code/);

  // Proxy.
  const worker = await import(pathToFileURL(path.join(__dirname, '../proxy/worker.js')).href);
  const built = worker.importRequest({ model: 'opus', lines: ['A', ' B  c '] });
  assert.strictEqual(built.request.model, 'claude-opus-5-5');
  assert.strictEqual(built.request.messages[0].content, '1| A\n2| B c');
  assert.strictEqual(built.request.fallbacks, 'default');
  assert.strictEqual(built.headers['anthropic-beta'], 'server-side-fallback-2026-07-01');
  const haiku = worker.importRequest({ model: 'haiku', lines: ['A'] });
  assert.ok(!('fallbacks' in haiku.request) && !haiku.headers['anthropic-beta']);
  assert.strictEqual(worker.importRequest({ model: 'gpt', lines: ['A'] }).request.model, 'claude-sonnet-5-5');
  assert.throws(() => worker.importRequest({ lines: [] }), /list of lines/);
  assert.ok(worker.validCode(' abc ', { INVITE_CODES: 'xyz, abc' }));
  assert.ok(!worker.validCode('', { INVITE_CODES: '' }));

  const env = { INVITE_CODES: 'lena', ANTHROPIC_API_KEY: 'k', ALLOWED_ORIGINS: 'https://elenabli.github.io' };
  let sent = null;
  globalThis.fetch = async (url, init) => { sent = { url, init }; return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } }); };
  const denied = await worker.default.fetch(new Request('https://p.dev/ping', { headers: { 'x-cue-code': 'nope' } }), env);
  assert.strictEqual(denied.status, 401);
  const ok = await worker.default.fetch(new Request('https://p.dev/import', { method: 'POST', headers: { 'x-cue-code': 'lena', origin: 'https://elenabli.github.io' }, body: JSON.stringify({ model: 'sonnet', lines: ['X: hi'] }) }), env);
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.headers.get('access-control-allow-origin'), 'https://elenabli.github.io');
  assert.strictEqual(sent.init.headers['x-api-key'], 'k');
  const piped = await AI.readStream(ok);
  assert.strictEqual(piped.labels.title, 'T');

  console.log('ai-import tests passed');
})().catch(e => { console.error(e); process.exit(1); });
