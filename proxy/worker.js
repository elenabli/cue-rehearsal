// Cue proxy: a small Cloudflare Worker that holds the AI keys so the app
// (a static site on GitHub Pages) never sees them. It only does Cue's own
// jobs (reading a play), never general chat. Anyone may use it within a daily
// limit (DAILY_LIMIT in total, PER_IP_LIMIT per address); an invite code skips
// the limits. Plays are passed through and forgotten; only counts are kept.

const MODELS = { haiku: 'claude-haiku-5-5', sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5' };
// Haiku has no server-side refusal fallback; the others fall back by policy category.
const FALLBACK = new Set(['claude-sonnet-5-5', 'claude-opus-5-5']);
const MAX_LINES = 20000;
const MAX_CHARS = 800000;

export const SYSTEM = `You read stage plays (Russian or English) for a rehearsal app. The user message is the play's extracted text, one line per row, each row starting with its line number and "| ". Text in [square brackets] was italic in the original, usually a stage direction.

Answer with the cast and with "marks". A mark is a pair [line, code] that says what starts on that line; it lasts until the next mark. Codes:
- 0, 1, 2 …: a speech by that character, by their position in "cast" (0 is the first). Mark the line where the speaker's name stands.
- -1: a stage direction between speeches.
- -2: something to leave out: title page, author, the list of characters, page numbers, running headers or footers, notes, "THE END" / «Конец», «Занавес».
- -3: a heading that starts a new scene.

Mark only where something new starts, never each line. A speech that runs over many lines, including directions inside it, gets one mark. After a direction between speeches, the next speech gets its own mark. The first mark is on line 1.

Scenes: use the smallest unit the play numbers (scene or явление rather than act). Give each scene in "scenes" as {line, title}, with the line of its -3 mark and a short title as the play writes it («Сцена 3. Квартира Гордеевых. День.», "Act 1, Scene 2"). If the play has no headings, add -3 marks where the place or time changes, on the first line of that stretch, with a short title you write.

Cast: every character who speaks, once, by the name their speech labels use most (keep the play's capitals). Merge spellings of one person («ИВАН», «Иван Петрович», «И. П.») and list the other spellings in "aliases". Groups who speak together («ВСЕ», "BOTH") are characters too. A word in capitals inside a speech or a direction is not a character. Gender: f, m, group or "?"; age: child, young, adult, old or "?".

Never rewrite, correct, translate or summarise the play. Only point at line numbers.`;

export const SCHEMA = {
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
    'access-control-allow-headers': 'content-type, x-cue-code',
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
  const model = MODELS[body && body.model] || MODELS.sonnet;
  const lines = body && body.lines;
  if (!Array.isArray(lines) || !lines.length || lines.some(l => typeof l !== 'string')) throw new Error('Send the play as a list of lines.');
  if (lines.length > MAX_LINES) throw new Error(`The play is too long (${lines.length} lines, at most ${MAX_LINES}).`);
  const text = lines.map((l, i) => `${i + 1}| ${l.replace(/\s+/g, ' ').trim()}`).join('\n');
  if (text.length > MAX_CHARS) throw new Error('The play is too long to read in one go.');
  const request = {
    model,
    max_tokens: 64000,
    stream: true,
    system: SYSTEM,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: text }],
  };
  const headers = { 'content-type': 'application/json', 'anthropic-version': '2026-10-21' };
  if (FALLBACK.has(model)) {
    request.fallbacks = 'default';
    headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
  }
  return { request, headers };
}

// Counts imports per day in a Durable Object (SQLite storage, free plan).
export class DailyCounter {
  constructor(state) { this.state = state; }
  async fetch(request) {
    const { day, ip, total, perIp } = await request.json();
    const [all, mine] = await Promise.all([this.state.storage.get('all:' + day), this.state.storage.get('ip:' + day + ':' + ip)]);
    if ((all || 0) >= total) return Response.json({ ok: false, reason: 'day' });
    if ((mine || 0) >= perIp) return Response.json({ ok: false, reason: 'ip' });
    await this.state.storage.put({ ['all:' + day]: (all || 0) + 1, ['ip:' + day + ':' + ip]: (mine || 0) + 1 });
    // Forget earlier days.
    const keys = [...(await this.state.storage.list({ limit: 1000 })).keys()].filter(k => !k.includes(':' + day));
    if (keys.length) await this.state.storage.delete(keys.slice(0, 128));
    return Response.json({ ok: true, left: total - (all || 0) - 1 });
  }
}

// Returns null when allowed, or a message when today's limit is used up.
export async function takeQuota(request, env) {
  if (validCode(request.headers.get('x-cue-code'), env)) return null;
  if (!env.COUNTER) return null;
  const day = new Date().toISOString().slice(0, 10);
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const stub = env.COUNTER.get(env.COUNTER.idFromName('imports'));
  const r = await (await stub.fetch('https://counter/take', { method: 'POST', body: JSON.stringify({ day, ip, total: Number(env.DAILY_LIMIT) || 20, perIp: Number(env.PER_IP_LIMIT) || 5 }) })).json();
  if (r.ok) return null;
  return r.reason === 'ip' ? 'You have read the most plays allowed today. Try again tomorrow.' : 'Smart import is busy today. Try again tomorrow.';
}

export default {
  async fetch(request, env) {
    const headers = cors(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const url = new URL(request.url);
    if (url.pathname === '/ping' && request.method === 'GET') {
      return json({ ok: true, import: !!env.ANTHROPIC_API_KEY }, 200, headers);
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

    return json({ error: 'Not found.' }, 404, headers);
  },
};
