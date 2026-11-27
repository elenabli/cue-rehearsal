// Cue accounts: sign up and sign in with a passkey (Face ID, Touch ID or a fingerprint), no password or email.
// Each person's account is its own Durable Object with SQLite storage ("user:<id>"), so accounts never share a
// database and the service grows one person at a time. Sign-in challenges wait in one more object ("challenges").
// Passkeys are checked with @simplewebauthn/server. A session is "<user id>.<secret>"; only a hash of the
// secret is stored, and signing out deletes it.
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} from '@simplewebauthn/server';

const CHALLENGE_MS = 5 * 60 * 1000;
const SESSION_IDLE_MS = 365 * 24 * 60 * 60 * 1000;
const ID = /^[A-Za-z0-9_-]{16,64}$/;

export const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomId = (n = 16) => b64url(crypto.getRandomValues(new Uint8Array(n)));
async function sha256(text) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...d].map(b => b.toString(16).padStart(2, '0')).join('');
}

// The name people type: one line, at most 40 letters.
export function cleanName(name) {
  const n = typeof name === 'string' ? name.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim() : '';
  if (!n) throw new Error('Type your name.');
  return [...n].slice(0, 40).join('');
}

// Which page is asking, and the passkey "site" (rpID) it belongs to. Only Cue's own pages may use accounts.
export function relyingParty(request, env) {
  const origin = request.headers.get('origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || 'https://elenabli.github.io').split(',').map(s => s.trim());
  if (!allowed.includes(origin)) throw new Error('Accounts work only from the Cue app.');
  return { origin, rpID: new URL(origin).hostname };
}

// The challenge the browser signed, read from its clientDataJSON.
export function signedChallenge(response) {
  try {
    const b64 = response.response.clientDataJSON.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64)).challenge || '';
  } catch { return ''; }
}

// Called through fetch with {method, args}, so it needs nothing beyond the free plan's SQLite Durable Objects.
export class Account {
  constructor(state) {
    this.sql = state.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS profile (id TEXT PRIMARY KEY, name TEXT NOT NULL, joined INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS passkeys (id TEXT PRIMARY KEY, public_key TEXT NOT NULL, counter INTEGER NOT NULL, transports TEXT, created INTEGER NOT NULL, last_used INTEGER);
      CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, created INTEGER NOT NULL, last_used INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS challenges (challenge TEXT PRIMARY KEY, name TEXT, expires INTEGER NOT NULL);`);
  }
  async fetch(request) {
    const { method, args } = await request.json();
    if (!Account.METHODS.includes(method)) return Response.json({ error: 'Unknown method.' }, { status: 400 });
    try { return Response.json({ value: (await this[method](...args)) ?? null }); }
    catch (e) { return Response.json({ error: e.message }, { status: 409 }); }
  }
  // Challenges: each is used once and only within five minutes.
  keepChallenge(challenge, name = null) {
    const now = Date.now();
    this.sql.exec('DELETE FROM challenges WHERE expires < ?', now);
    this.sql.exec('INSERT OR REPLACE INTO challenges VALUES (?, ?, ?)', challenge, name, now + CHALLENGE_MS);
  }
  useChallenge(challenge) {
    const row = this.sql.exec('SELECT name, expires FROM challenges WHERE challenge = ?', challenge).toArray()[0];
    if (!row) return null;
    this.sql.exec('DELETE FROM challenges WHERE challenge = ?', challenge);
    return row.expires >= Date.now() ? { name: row.name } : null;
  }
  profile() {
    const p = this.sql.exec('SELECT id, name, joined FROM profile').toArray()[0];
    return p ? { id: p.id, name: p.name, joined: p.joined } : null;
  }
  create(id, name, credential) {
    if (this.profile()) throw new Error('This account already exists.');
    const now = Date.now();
    this.sql.exec('INSERT INTO profile VALUES (?, ?, ?)', id, name, now);
    this.sql.exec('INSERT INTO passkeys VALUES (?, ?, ?, ?, ?, ?)', credential.id, credential.publicKey, credential.counter,
      JSON.stringify(credential.transports || []), now, now);
    return this.newSession();
  }
  passkey(id) {
    const k = this.sql.exec('SELECT id, public_key, counter, transports FROM passkeys WHERE id = ?', id).toArray()[0];
    return k ? { id: k.id, publicKey: k.public_key, counter: k.counter, transports: JSON.parse(k.transports || '[]') } : null;
  }
  signedIn(id, counter) {
    this.sql.exec('UPDATE passkeys SET counter = ?, last_used = ? WHERE id = ?', counter, Date.now(), id);
    return this.newSession();
  }
  async newSession() {
    const secret = randomId(32), now = Date.now();
    this.sql.exec('INSERT INTO sessions VALUES (?, ?, ?)', await sha256(secret), now, now);
    return secret;
  }
  async checkSession(secret) {
    const hash = await sha256(secret), now = Date.now();
    const s = this.sql.exec('SELECT last_used FROM sessions WHERE hash = ?', hash).toArray()[0];
    if (!s || s.last_used < now - SESSION_IDLE_MS) return null;
    // Note use at most once an hour, so reading the profile stays cheap.
    if (s.last_used < now - 3600000) this.sql.exec('UPDATE sessions SET last_used = ? WHERE hash = ?', now, hash);
    return this.profile();
  }
  // Delete the account: name, passkeys and sessions. The passkey stays on the phone but no longer signs in.
  deleteAccount() {
    this.sql.exec('DELETE FROM sessions; DELETE FROM passkeys; DELETE FROM profile; DELETE FROM challenges;');
  }
  async endSession(secret) {
    this.sql.exec('DELETE FROM sessions WHERE hash = ?', await sha256(secret));
  }
}
Account.METHODS = ['keepChallenge', 'useChallenge', 'profile', 'create', 'passkey', 'signedIn', 'checkSession', 'endSession', 'deleteAccount'];

// A small client for one Account object: account(env, id).profile() and so on.
function stubFor(env, name) {
  const stub = env.ACCOUNTS.get(env.ACCOUNTS.idFromName(name));
  return new Proxy({}, { get: (_, method) => async (...args) => {
    const r = await (await stub.fetch('https://account/', { method: 'POST', body: JSON.stringify({ method, args }) })).json();
    if (r.error) throw new Error(r.error);
    return r.value;
  } });
}
const account = (env, id) => stubFor(env, 'user:' + id);
const challenges = env => stubFor(env, 'challenges');
const fromB64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

// The signed-in person for a request ("Authorization: Bearer <user id>.<secret>"), or null.
export async function whoIs(request, env) {
  const m = /^Bearer ([A-Za-z0-9_-]{16,64})\.([A-Za-z0-9_-]{20,100})$/.exec(request.headers.get('authorization') || '');
  if (!m || !env.ACCOUNTS) return null;
  const profile = await account(env, m[1]).checkSession(m[2]);
  return profile ? { ...profile, token: m[1] + '.' + m[2] } : null;
}

// Handles /account/...; returns a Response body and status, or null when the path isn't an account path.
// `limit(kind)` counts sign-ups per address (see takeQuota in worker.js) and returns a message when used up.
export async function accountRoute(request, env, path, limit) {
  if (!env.ACCOUNTS) return { status: 503, body: { error: 'Accounts are not set up yet.' } };
  const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
  let rp;
  try { rp = relyingParty(request, env); } catch (e) { return { status: 403, body: { error: e.message } }; }

  if (path === '/account/register/options' && request.method === 'POST') {
    let name;
    try { name = cleanName(body.name); } catch (e) { return { status: 400, body: { error: e.message } }; }
    const limited = await limit();
    if (limited) return { status: 429, body: { error: limited } };
    const idBytes = crypto.getRandomValues(new Uint8Array(16)), id = b64url(idBytes);
    const options = await generateRegistrationOptions({
      rpName: 'Cue', rpID: rp.rpID, userName: name, userDisplayName: name,
      userID: idBytes,
      attestationType: 'none',
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
    });
    await account(env, id).keepChallenge(options.challenge, name);
    return { status: 200, body: { user: id, options } };
  }

  if (path === '/account/register/verify' && request.method === 'POST') {
    if (typeof body.user !== 'string' || !ID.test(body.user) || !body.response) return { status: 400, body: { error: 'Bad request.' } };
    const stub = account(env, body.user);
    const challenge = signedChallenge(body.response);
    const pending = challenge && await stub.useChallenge(challenge);
    if (!pending) return { status: 400, body: { error: 'This took too long. Try again.' } };
    let result;
    try {
      result = await verifyRegistrationResponse({ response: body.response, expectedChallenge: challenge, expectedOrigin: rp.origin, expectedRPID: rp.rpID, requireUserVerification: false });
    } catch { result = null; }
    if (!result || !result.verified) return { status: 400, body: { error: 'The passkey could not be checked. Try again.' } };
    const { credential } = result.registrationInfo;
    try {
      const secret = await stub.create(body.user, pending.name, { id: credential.id, publicKey: b64url(credential.publicKey), counter: credential.counter, transports: credential.transports });
      return { status: 200, body: { token: body.user + '.' + secret, name: pending.name } };
    } catch (e) { return { status: 409, body: { error: e.message } }; }
  }

  if (path === '/account/login/options' && request.method === 'POST') {
    const options = await generateAuthenticationOptions({ rpID: rp.rpID, userVerification: 'preferred', allowCredentials: [] });
    await challenges(env).keepChallenge(options.challenge);
    return { status: 200, body: { options } };
  }

  if (path === '/account/login/verify' && request.method === 'POST') {
    const response = body.response;
    const user = response && response.response && response.response.userHandle;
    if (typeof user !== 'string' || !ID.test(user) || typeof response.id !== 'string') return { status: 400, body: { error: 'This passkey is not for Cue.' } };
    const challenge = signedChallenge(response);
    if (!challenge || !await challenges(env).useChallenge(challenge)) return { status: 400, body: { error: 'This took too long. Try again.' } };
    const stub = account(env, user);
    const stored = await stub.passkey(response.id);
    if (!stored) return { status: 404, body: { error: 'No Cue account uses this passkey. It may have been deleted.' } };
    const credential = { ...stored, publicKey: fromB64url(stored.publicKey) };
    let result;
    try {
      result = await verifyAuthenticationResponse({ response, expectedChallenge: challenge, expectedOrigin: rp.origin, expectedRPID: rp.rpID, credential, requireUserVerification: false });
    } catch { result = null; }
    if (!result || !result.verified) return { status: 400, body: { error: 'The passkey could not be checked. Try again.' } };
    const secret = await stub.signedIn(credential.id, result.authenticationInfo.newCounter);
    const profile = await stub.profile();
    return { status: 200, body: { token: user + '.' + secret, name: profile.name } };
  }

  if (path === '/account' && request.method === 'GET') {
    const me = await whoIs(request, env);
    if (!me) return { status: 401, body: { error: 'Signed out.' } };
    return { status: 200, body: { name: me.name, joined: me.joined } };
  }

  if (path === '/account/logout' && request.method === 'POST') {
    const me = await whoIs(request, env);
    if (me) await account(env, me.id).endSession(me.token.split('.')[1]);
    return { status: 200, body: { ok: true } };
  }

  if (path === '/account/delete' && request.method === 'POST') {
    const me = await whoIs(request, env);
    if (!me) return { status: 401, body: { error: 'Signed out.' } };
    await account(env, me.id).deleteAccount();
    return { status: 200, body: { ok: true } };
  }

  return null;
}
