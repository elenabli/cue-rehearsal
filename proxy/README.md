# Cue proxy

A small Cloudflare Worker that holds Cue's AI keys, so the app (a static site on GitHub Pages) never sees them. It does only Cue's own jobs. Anyone using Cue may send up to `PER_IP_LIMIT` requests a day, with `DAILY_LIMIT` a day in total (see `wrangler.toml`); a long play is read in up to 6 parts at once, one request each, so 30 is about 5 plays; an invite code skips both. It stores no plays, only today's counts and accounts.

| Path | What it does |
| --- | --- |
| `GET /ping` | Checks whether the Anthropic key is set |
| `GET /voices?lang=ru-RU` | The Google voices for a language: `{voices: [{name, gender}]}` |
| `POST /speak` | `{voice, text}` → one partner line as MP3, made by Google Cloud Text-to-Speech. Counts letters per day (`VOICE_PER_IP_CHARS`, `VOICE_DAILY_CHARS`); the app keeps each line on the phone, so it is made only once |
| `POST /account/register/options`, `/account/register/verify` | Create an account: `{name}` → passkey options; then the phone's passkey → `{token, name}`. At most `SIGNUP_PER_IP` new accounts per address a day |
| `POST /account/login/options`, `/account/login/verify` | Sign in with any Cue passkey on the device → `{token, name}` |
| `GET /account`, `POST /account/logout` | With `Authorization: Bearer <token>`: the profile `{name, joined}`; sign out ends that session |
| `POST /import` | `{lines: [...], start?, part?, of?, names?}` (one part of a play, at most 60,000 letters) → Claude Sonnet labels each line (scene, speech, direction, skip) and lists the cast; the answer streams back to the app, which rebuilds the play from its own lines (`dist/ai-import.js`) |

## Setup (once)

1. **Anthropic key.** In [console.anthropic.com](https://console.anthropic.com) → API keys → Create key. Copy it.
2. **Cloudflare.** In [dash.cloudflare.com](https://dash.cloudflare.com) open Workers & Pages once (it asks you to pick a `workers.dev` name the first time). Copy your **Account ID** from that page. Then My Profile → API Tokens → Create Token → template **Edit Cloudflare Workers** → Create. Copy the token.
3. **GitHub secrets.** In this repository → Settings → Secrets and variables → Actions → New repository secret, add four:
   - `CLOUDFLARE_API_TOKEN`: the token from step 2
   - `CLOUDFLARE_ACCOUNT_ID`: the account ID from step 2
   - `ANTHROPIC_API_KEY`: the key from step 1
   - `GOOGLE_TTS_KEY`: a Google Cloud key limited to Cloud Text-to-Speech (for character voices; optional)
   - `INVITE_CODES`: any word you make up, for example `curtain-call` (several codes: separate with commas). A code skips the daily limits.
4. **Deploy.** Actions → **Deploy the AI proxy** → Run workflow (it also runs by itself when `proxy/` changes on main). The log of the "Deploy" step shows the address, like `https://cue-proxy.your-name.workers.dev`.
5. **Try it.** Open `https://elenabli.github.io/cue-rehearsal/ai-test.html`, paste the address and your invite code, press **Check the proxy**, then choose a play and **Read the play**.

To change a key later, update the GitHub secret and run the workflow again.

If a model answers with a rate-limit error, the Anthropic account is on its first usage tier; buying more credit raises the limit.

**Spending cap.** In the Anthropic console → Settings → Limits, set a monthly spend limit (for example $10). It is the hard ceiling whatever happens to the proxy.

## Spending limits

The proxy is public within its daily limits, and it always uses Sonnet whatever the app asks for. As a last safety net, also set a monthly spend limit in the Anthropic Console (Settings → Limits) and a budget alert for the Text-to-Speech project in Google Cloud (Billing → Budgets & alerts).

## Accounts

Each account is its own Durable Object (SQLite, free plan) named `user:<id>`, holding the name, its passkeys and hashed sessions; one more object holds sign-in challenges for five minutes. Passkeys are checked with [@simplewebauthn/server](https://simplewebauthn.dev); no password or email is stored. A passkey belongs to the page's address, so accounts made at `elenabli.github.io` work only there (and `localhost` for testing). Nothing to set up: the deploy creates the storage.

