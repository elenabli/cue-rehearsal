// Cue proxy: a small Cloudflare Worker that holds the AI keys so the app
// (a static site on GitHub Pages) never sees them. It only does Cue's own
// jobs (reading a play, speaking partner lines, keeping accounts), never general chat. Anyone may use it within a daily
// limit (DAILY_LIMIT in total, PER_IP_LIMIT per address); an invite code skips
// the limits. Plays are passed through and forgotten; only counts are kept.

// Always Sonnet, whatever the caller asks for: the proxy is public, so the caller can't pick a dearer model.
import { accountRoute } from './accounts.js';
export { Account } from './accounts.js';

const MODEL = 'claude-sonnet-5-5';
const MAX_LINES = 20000;
// The app sends a play in parts of about 15,000 letters (at most 6 parts), so one part never needs more than this.
// It keeps the most one request can cost small.
const MAX_CHARS = 60000;
const MAX_TOKENS = 32000;

const SYSTEM = `You read stage plays (Russian or English) for a rehearsal app. The user message is the play's extracted text, one line per row, each row starting with its line number and "| ". Text in [square brackets] was italic in the original, usually a stage direction.

Answer with the cast and with "marks". A mark is a pair [line, code] that says what starts on that line; it lasts until the next mark. Codes:
- 0, 1, 2 …: a speech by that character, by their position in "cast" (0 is the first). Mark the line where the speaker's name stands.
- -1: a stage direction between speeches.
- -2: something to leave out: title page, author, the list of characters, page numbers, running headers or footers, notes, "THE END" / «Конец», «Занавес».
- -3: a heading that starts a new scene.

Mark only where something new starts, never each line. A speech that runs over many lines, including directions inside it, gets one mark. After a direction between speeches, the next speech gets its own mark. The first mark is on the first line you are given.

A long play comes in parts that are read separately. A part says so above its lines. It may begin or end in the middle of a scene: start a scene at its first line only if a heading stands there. The title page and the list of characters may be in another part; list the characters who speak in this part, named as the play's speech labels name them.

Scenes: use the smallest unit the play numbers (scene or явление rather than act). Give each scene in "scenes" as {line, title}, with the line of its -3 mark and a short title as the play writes it («Сцена 3. Квартира Гордеевых. День.», "Act 1, Scene 2"). If the play has no headings, add -3 marks where the place or time changes, on the first line of that stretch, with a short title you write.

Cast: every character who speaks, once, by the name their speech labels use most (keep the play's capitals). Merge spellings of one person («ИВАН», «Иван Петрович», «И. П.») and list the other spellings in "aliases". Groups who speak together («ВСЕ», "BOTH") are characters too. A word in capitals inside a speech or a direction is not a character. Gender: f, m, group or "?"; age: child, young, adult, old or "?".

Never rewrite, correct, translate or summarise the play. Only point at line numbers.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['language', 'title', 'cast', 'scenes', 'marks'],
  properties: {
    language: { type: 'string', enum: ['ru', 'en', 'other'] },
    title: { type: 'string' },
    cast: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'aliases', 'gender', 'age'],
        properties: {
          name: { type: 'string' },
          aliases: { type: 'array', items: { type: 'string' } },
          gender: { type: 'string', enum: ['f', 'm', 'group', '?'] },
          age: { type: 'string', enum: ['child', 'young', 'adult', 'old', '?'] },
        },
      },
    },
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['line', 'title'],
        properties: { line: { type: 'integer' }, title: { type: 'string' } },
      },
    },
    marks: { type: 'array', items: { type: 'array', items: { type: 'integer' } } },
  },
};

function cors(request, env) {
  const origin = request.headers.get('origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || 'https://elenabli.github.io').split(',').map(s => s.trim());
  return {
    'access-control-allow-origin': allowed.includes(origin) ? origin : allowed[0],
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, x-cue-code, authorization',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

const json = (body, status, headers) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, 'content-type': 'application/json' } });

export function validCode(code, env) {
  const codes = (env.INVITE_CODES || '').split(',').map(s => s.trim()).filter(Boolean);
  return !!code && codes.includes(String(code).trim());
}

// Build the Claude request for /import. Exported for tests.
export function importRequest(body) {
  const model = MODEL;
  const lines = body && body.lines;
  if (!Array.isArray(lines) || !lines.length || lines.some(l => typeof l !== 'string')) throw new Error('Send the play as a list of lines.');
  if (lines.length > MAX_LINES) throw new Error(`The play is too long (${lines.length} lines, at most ${MAX_LINES}).`);
  const start = Number.isInteger(body.start) && body.start > 0 ? body.start : 1;
  let text = lines.map((l, i) => `${start + i}| ${l.replace(/\s+/g, ' ').trim()}`).join('\n');
  if (Number.isInteger(body.of) && body.of > 1) {
    const names = Array.isArray(body.names) ? body.names.filter(n => typeof n === 'string').slice(0, 80).map(n => n.slice(0, 60)) : [];
    text = `Part ${Number(body.part) || 1} of ${body.of}, lines ${start}–${start + lines.length - 1}.` +
      (names.length ? ` Speech labels found in the whole play: ${names.join(', ')}.` : '') + '\n\n' + text;
  }
  if (text.length > MAX_CHARS) throw new Error('This part of the play is too long to read in one go.');
  const request = {
    model,
    max_tokens: MAX_TOKENS,
    stream: true,
    system: SYSTEM,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: text }],
    fallbacks: 'default',
  };
  const headers = { 'content-type': 'application/json', 'anthropic-version': '2026-10-21', 'anthropic-beta': 'server-side-fallback-2026-07-01' };
  return { request, headers };
}

// Counts imports per day in a Durable Object (SQLite storage, free plan).
export class DailyCounter {
  constructor(state) { this.state = state; }
  async fetch(request) {
    const { day, ip, total, perIp, kind = '', amount = 1 } = await request.json();
    const allKey = kind + 'all:' + day, ipKey = kind + 'ip:' + day + ':' + ip;
    const [all, mine] = await Promise.all([this.state.storage.get(allKey), this.state.storage.get(ipKey)]);
    // Count what this request adds, so a long line can't run past the limit.
    if ((all || 0) + amount > total) return Response.json({ ok: false, reason: 'day' });
    if ((mine || 0) + amount > perIp) return Response.json({ ok: false, reason: 'ip' });
    await this.state.storage.put({ [allKey]: (all || 0) + amount, [ipKey]: (mine || 0) + amount });
    // Forget earlier days.
    const keys = [...(await this.state.storage.list({ limit: 1000 })).keys()].filter(k => !k.includes(':' + day));
    if (keys.length) await this.state.storage.delete(keys.slice(0, 128));
    return Response.json({ ok: true, left: total - (all || 0) - amount });
  }
}

// Returns null when allowed, or a message when today's limit is used up.
export async function takeQuota(request, env, voice = 0) {
  if (validCode(request.headers.get('x-cue-code'), env)) return null;
  if (!env.COUNTER) return null;
  const day = new Date().toISOString().slice(0, 10);
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const stub = env.COUNTER.get(env.COUNTER.idFromName('imports'));
  if (voice === 'signup') {
    const limits = { kind: 'acct', amount: 1, total: Number(env.SIGNUP_DAILY) || 200, perIp: Number(env.SIGNUP_PER_IP) || 10 };
    const r = await (await stub.fetch('https://counter/take', { method: 'POST', body: JSON.stringify({ day, ip, ...limits }) })).json();
    return r.ok ? null : 'Too many new accounts today. Try again tomorrow.';
  }
  const limits = voice
    ? { kind: 'tts', amount: voice, total: Number(env.VOICE_DAILY_CHARS) || 300000, perIp: Number(env.VOICE_PER_IP_CHARS) || 100000 }
    : { total: Number(env.DAILY_LIMIT) || 20, perIp: Number(env.PER_IP_LIMIT) || 5 };
  const r = await (await stub.fetch('https://counter/take', { method: 'POST', body: JSON.stringify({ day, ip, ...limits }) })).json();
  if (r.ok) return null;
  if (voice) return r.reason === 'ip' ? 'Character voices are used up for today. The phone voice reads the rest.' : 'Character voices are busy today. The phone voice reads the rest.';
  return r.reason === 'ip' ? 'You have read the most plays allowed today. Try again tomorrow.' : 'Smart import is busy today. Try again tomorrow.';
}

// Character voices (Google Cloud Text-to-Speech). Exported for tests.
const VOICE_NAME = /^[a-z]{2,3}-[A-Z]{2}-[A-Za-z0-9-]{1,40}$/;
export function speakRequest(body) {
  const voice = body && body.voice, text = body && typeof body.text === 'string' ? body.text.replace(/\s+/g, ' ').trim() : '';
  if (typeof voice !== 'string' || !VOICE_NAME.test(voice)) throw new Error('Unknown voice.');
  if (!text) throw new Error('Nothing to say.');
  if (text.length > 1500) throw new Error('The line is too long.');
  return {
    input: { text },
    voice: { languageCode: voice.split('-').slice(0, 2).join('-'), name: voice },
    audioConfig: { audioEncoding: 'MP3' },
  };
}
function fromBase64(b64) {
  const bin = atob(b64), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export default {
  async fetch(request, env) {
    const headers = cors(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const url = new URL(request.url);
    if (url.pathname === '/ping' && request.method === 'GET') {
      return json({ ok: true, import: !!env.ANTHROPIC_API_KEY, voices: !!env.GOOGLE_TTS_KEY }, 200, headers);
    }

    if (url.pathname === '/voices' && request.method === 'GET') {
      if (!env.GOOGLE_TTS_KEY) return json({ error: 'The proxy has no voice key yet.' }, 503, headers);
      const lang = url.searchParams.get('lang') || '';
      if (!/^[a-z]{2,3}-[A-Z]{2}$/.test(lang)) return json({ error: 'Unknown language.' }, 400, headers);
      const r = await fetch(`https://texttospeech.googleapis.com/v1/voices?languageCode=${lang}`, { headers: { 'x-goog-api-key': env.GOOGLE_TTS_KEY } });
      if (!r.ok) return json({ error: `The voice service answered with error ${r.status}.` }, 502, headers);
      const body = await r.json();
      const voices = (body.voices || []).filter(v => (v.languageCodes || []).includes(lang)).map(v => ({ name: v.name, gender: v.ssmlGender }));
      return json({ voices }, 200, { ...headers, 'cache-control': 'public, max-age=86400' });
    }

    if (url.pathname === '/speak' && request.method === 'POST') {
      if (!env.GOOGLE_TTS_KEY) return json({ error: 'The proxy has no voice key yet.' }, 503, headers);
      let built;
      try {
        built = speakRequest(await request.json());
      } catch (error) {
        return json({ error: error.message || 'Bad request.' }, 400, headers);
      }
      const limited = await takeQuota(request, env, built.input.text.length);
      if (limited) return json({ error: limited }, 429, headers);
      const r = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GOOGLE_TTS_KEY },
        body: JSON.stringify(built),
      });
      if (!r.ok) {
        let message = `The voice service answered with error ${r.status}.`;
        try { message = (await r.json()).error.message || message; } catch {}
        return json({ error: message }, 502, headers);
      }
      const { audioContent } = await r.json();
      return new Response(fromBase64(audioContent), { status: 200, headers: { ...headers, 'content-type': 'audio/mpeg', 'cache-control': 'no-store' } });
    }

    if (url.pathname === '/import' && request.method === 'POST') {
      if (!env.ANTHROPIC_API_KEY) return json({ error: 'The proxy has no Anthropic key yet.' }, 503, headers);
      let built;
      try {
        built = importRequest(await request.json());
      } catch (error) {
        return json({ error: error.message || 'Bad request.' }, 400, headers);
      }
      const limited = await takeQuota(request, env);
      if (limited) return json({ error: limited }, 429, headers);
      const upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { ...built.headers, 'x-api-key': env.ANTHROPIC_API_KEY },
        body: JSON.stringify(built.request),
      });
      // Pass the stream straight through; parsing happens in the app.
      return new Response(upstream.body, {
        status: upstream.status,
        headers: { ...headers, 'content-type': upstream.headers.get('content-type') || 'text/event-stream', 'cache-control': 'no-store' },
      });
    }

    if (url.pathname === '/account' || url.pathname.startsWith('/account/')) {
      const r = await accountRoute(request, env, url.pathname, () => takeQuota(request, env, 'signup'));
      if (r) return json(r.body, r.status, { ...headers, 'cache-control': 'no-store' });
    }

    return json({ error: 'Not found.' }, 404, headers);
  },
};
