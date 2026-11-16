// Cue proxy: a small Cloudflare Worker that holds the AI keys so the app
// (a static site on GitHub Pages) never sees them. It only does Cue's own
// jobs (reading a play), never general chat, and only for invite codes.
// It stores nothing: requests are passed through and forgotten.

const MODELS = { haiku: 'claude-haiku-5-5', sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5' };
// Haiku has no server-side refusal fallback; the others fall back by policy category.
const FALLBACK = new Set(['claude-sonnet-5-5', 'claude-opus-5-5']);
const MAX_LINES = 20000;
const MAX_CHARS = 800000;

export const SYSTEM = `You read stage plays (Russian or English) for a rehearsal app. The user message is the play's extracted text, one line per row, each row starting with its line number and "| ". Text in [square brackets] was italic in the original, usually a stage direction.

Label every line from the first to the last, in order, with no gaps and no overlaps, as consecutive blocks:
- "skip": title page, author, dedication, the list of characters, page numbers, running headers or footers, publisher notes, "THE END" / «Конец», «Занавес».
- "scene": a heading that starts a new scene (act, scene, картина, явление, действие, a numbered part, or a place/time heading). Put the heading lines in this block and a short title in "title" as the play writes it, for example «Действие первое. Картина вторая» or "Act 1, Scene 2".
- "direction": a stage direction outside a speech.
- "speech": one character's speech, from the line where it starts to its last line. Put the character's name in "speaker", spelled exactly as in "cast". In "cut", copy the exact characters at the start of the first line that are the speaker's name with the punctuation right after it (for example «ИВАН ПЕТРОВИЧ.», "HAMLET:", or the whole line when the name stands on its own line); use "" if the line has no name. A direction after the name, as in «Маша (тихо). Вот он», is not part of "cut" («Маша»). A direction inside a speech stays in the speech.

Scenes: use the smallest unit the play numbers (явление or scene rather than act). If the play has no headings at all, start a new scene where the place or time changes or most characters change; use the first line of that stretch as the scene block only if it is a heading, otherwise make no scene block and the app will add one.

Cast: every character who speaks, once, by the fullest name the play's list of characters or speech labels use (keep the play's capitals). Merge spellings of the same person («ИВАН», «Иван Петрович», «И. П.») into one name and list the others in "aliases". Give gender and a rough age from the text; use "unknown" when the text does not say. Groups who speak together («ВСЕ», "BOTH") are characters too.

Never rewrite, correct, translate or summarise the play. Only label line numbers.`;

export const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['language', 'title', 'cast', 'blocks'],
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
          gender: { type: 'string', enum: ['female', 'male', 'group', 'unknown'] },
          age: { type: 'string', enum: ['child', 'young', 'adult', 'old', 'unknown'] },
        },
      },
    },
    blocks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'from', 'to', 'speaker', 'cut', 'title'],
        properties: {
          kind: { type: 'string', enum: ['skip', 'scene', 'direction', 'speech'] },
          from: { type: 'integer' },
          to: { type: 'integer' },
          speaker: { type: 'string' },
          cut: { type: 'string' },
          title: { type: 'string' },
        },
      },
    },
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
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: text }],
  };
  const headers = { 'content-type': 'application/json', 'anthropic-version': '2026-10-21' };
  if (FALLBACK.has(model)) {
    request.fallbacks = 'default';
    headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
  }
  return { request, headers };
}

export default {
  async fetch(request, env) {
    const headers = cors(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const url = new URL(request.url);
    if (!validCode(request.headers.get('x-cue-code'), env)) return json({ error: 'Unknown invite code.' }, 401, headers);

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
