// Accounts: names, which pages may sign in, the signed challenge, sign-up limits, and the app's passkey JSON.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

(async () => {
  const acc = await import(pathToFileURL(path.join(__dirname, '../proxy/accounts.js')).href);
  const worker = await import(pathToFileURL(path.join(__dirname, '../proxy/worker.js')).href);
  assert.equal(acc.cleanName('  Лена \n Блинова '), 'Лена Блинова');
  assert.equal([...acc.cleanName('я'.repeat(60))].length, 40, 'names are cut to 40 letters');
  assert.throws(() => acc.cleanName('   '), /Type your name/);
  assert.throws(() => acc.cleanName(5), /Type your name/);

  const env = { ALLOWED_ORIGINS: 'https://elenabli.github.io,http://localhost:4173' };
  const req = origin => new Request('https://p.dev/account/login/options', { method: 'POST', headers: origin ? { origin } : {} });
  assert.deepEqual(acc.relyingParty(req('https://elenabli.github.io'), env), { origin: 'https://elenabli.github.io', rpID: 'elenabli.github.io' });
  assert.equal(acc.relyingParty(req('http://localhost:4173'), env).rpID, 'localhost');
  assert.throws(() => acc.relyingParty(req('https://evil.example'), env), /only from the Cue app/);
  assert.throws(() => acc.relyingParty(req(''), env), /only from the Cue app/);

  const client = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: 'abc_-1', origin: 'https://elenabli.github.io' })).toString('base64url');
  assert.equal(acc.signedChallenge({ response: { clientDataJSON: client } }), 'abc_-1');
  assert.equal(acc.signedChallenge({ response: { clientDataJSON: '%%%' } }), '');
  assert.equal(acc.signedChallenge(null), '');

  // Routes: other pages are refused, a missing database is reported, unknown passkeys are refused.
  const accounts = { idFromName: n => n, get: () => ({ fetch: async () => Response.json({ value: null }) }) };
  const call = (p, body, origin = 'https://elenabli.github.io', e = { ...env, ACCOUNTS: accounts }) =>
    worker.default.fetch(new Request('https://p.dev' + p, { method: body ? 'POST' : 'GET', headers: { origin }, body: body ? JSON.stringify(body) : undefined }), e);
  assert.equal((await call('/account/login/options', {}, 'https://evil.example')).status, 403);
  assert.equal((await call('/account/login/options', {}, undefined, env)).status, 503);
  const opts = await call('/account/login/options', {});
  assert.equal(opts.status, 200);
  const { options } = await opts.json();
  assert.equal(options.rpId, 'elenabli.github.io');
  assert.deepEqual(options.allowCredentials, [], 'any Cue passkey on the phone may sign in');
  assert.equal((await call('/account/login/verify', { response: { id: 'x', response: { userHandle: 'bad!' } } })).status, 400);
  assert.equal((await call('/account', null)).status, 401, 'no session, signed out');
  assert.equal((await call('/account/register/options', { name: ' ' })).status, 400);
  const cors = await worker.default.fetch(new Request('https://p.dev/account', { method: 'OPTIONS', headers: { origin: 'https://elenabli.github.io' } }), env);
  assert.match(cors.headers.get('access-control-allow-headers'), /authorization/);

  // Sign-ups per address per day.
  const store = new Map();
  const counter = new worker.DailyCounter({ storage: {
    get: async k => store.get(k), put: async o => { for (const [k, v] of Object.entries(o)) store.set(k, v); },
    list: async () => new Map(store), delete: async keys => keys.forEach(k => store.delete(k)),
  } });
  const limited = { ...env, SIGNUP_PER_IP: '2', SIGNUP_DAILY: '10', COUNTER: { idFromName: n => n, get: () => ({ fetch: (u, init) => counter.fetch(new Request(u, init)) }) } };
  const signup = () => worker.takeQuota(new Request('https://p.dev/', { headers: { 'cf-connecting-ip': '1.1.1.1' } }), limited, 'signup');
  assert.equal(await signup(), null);
  assert.equal(await signup(), null);
  assert.match(await signup(), /Too many new accounts today/);

  // The app turns the proxy's options into browser objects and the browser's answer back into JSON.
  const ctx = { localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, atob, btoa, Uint8Array, JSON };
  ctx.window = ctx;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dist/account.js'), 'utf8'), ctx);
  const J = ctx.CueAccount._json;
  const made = J.creationOptions({ challenge: 'AAEC', user: { id: '_-8', name: 'L' }, excludeCredentials: [] });
  assert.deepEqual([...made.challenge], [0, 1, 2]);
  assert.deepEqual([...made.user.id], [255, 239]);
  const buf = n => Uint8Array.from(n).buffer;
  const got = J.credentialJSON({ id: 'id1', rawId: buf([1]), type: 'public-key', getClientExtensionResults: () => ({}),
    response: { clientDataJSON: buf([123]), authenticatorData: buf([2]), signature: buf([3]), userHandle: buf([255, 239]) } });
  assert.equal(got.response.userHandle, '_-8', 'user handle comes back as the account id');
  assert.equal(got.response.signature, 'Aw');
  assert.equal(ctx.CueAccount.current, null);
  console.log('Accounts passed: names, Cue pages only, signed challenge, routes, sign-up limits, passkey JSON.');
})().catch(e => { console.error(e); process.exit(1); });
