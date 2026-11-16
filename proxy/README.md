# Cue proxy

A small Cloudflare Worker that holds Cue's AI keys, so the app (a static site on GitHub Pages) never sees them. It does only Cue's own jobs, and only for invite codes. It stores nothing.

| Path | What it does |
| --- | --- |
| `GET /ping` | Checks the invite code and whether the Anthropic key is set |
| `POST /import` | `{model: "haiku"\|"sonnet"\|"opus", lines: [...]}` → Claude labels each line (scene, speech, direction, skip) and lists the cast; the answer streams back to the app, which rebuilds the play from its own lines (`dist/ai-import.js`) |

## Setup (once)

1. **Anthropic key.** In [console.anthropic.com](https://console.anthropic.com) → API keys → Create key. Copy it.
2. **Cloudflare.** In [dash.cloudflare.com](https://dash.cloudflare.com) open Workers & Pages once (it asks you to pick a `workers.dev` name the first time). Copy your **Account ID** from that page. Then My Profile → API Tokens → Create Token → template **Edit Cloudflare Workers** → Create. Copy the token.
3. **GitHub secrets.** In this repository → Settings → Secrets and variables → Actions → New repository secret, add four:
   - `CLOUDFLARE_API_TOKEN`: the token from step 2
   - `CLOUDFLARE_ACCOUNT_ID`: the account ID from step 2
   - `ANTHROPIC_API_KEY`: the key from step 1
   - `INVITE_CODES`: any word you make up, for example `curtain-call` (several codes: separate with commas)
4. **Deploy.** Actions → **Deploy the AI proxy** → Run workflow (it also runs by itself when `proxy/` changes on main). The log of the "Deploy" step shows the address, like `https://cue-proxy.your-name.workers.dev`.
5. **Try it.** Open `https://elenabli.github.io/cue-rehearsal/ai-test.html`, paste the address and your invite code, press **Check the proxy**, then choose a play and **Read the play**.

To change a key later, update the GitHub secret and run the workflow again.

If a model answers with a rate-limit error, the Anthropic account is on its first usage tier; buying more credit raises the limit.
