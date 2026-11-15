# Ori — your AI companion. Your world, in your pocket.

**Your interests have somewhere to go.** Ori is your AI companion for turning your interests and everyday needs into personal apps that live on your home screen. Share a thought, a photo or a link; Ori says what it actually read and offers a next step (explore it, make an app, add an entry to an app you have, change an app, or just keep it). The app you make lives at its own URL with its own icon, opens directly from your home screen, and changes when you ask, without losing what you saved.

The name is decided: **Ori** (`shared/brand.ts`; internal ids keep their original values). Design direction: [`docs/ori/ORI_DESIGN_SPEC.md`](docs/ori/ORI_DESIGN_SPEC.md) and its reference images; visual review: [`docs/ori/VISUAL_REVIEW.md`](docs/ori/VISUAL_REVIEW.md). Contracts: [`docs/redesign-contract.md`](docs/redesign-contract.md), [`docs/api-contract.md`](docs/api-contract.md). Progress and evidence: [`BUILD_STATUS.md`](BUILD_STATUS.md), [`docs/TEST_RESULTS.md`](docs/TEST_RESULTS.md). Demo: [`docs/DEMO.md`](docs/DEMO.md). Live: https://ori-fjrx.onrender.com/ (pitch: https://ori-fjrx.onrender.com/pitch/); deployment settings in [`docs/DEPLOY.md`](docs/DEPLOY.md). Pitch: `/pitch/` on any running server (source in `client/public/pitch/`, inputs in [`docs/ori-pitch-kit/`](docs/ori-pitch-kit/), judge's-view check: `node scripts/check-pitch.mjs --base <url>/pitch/`). Velocity: [`docs/velocity-contribution.md`](docs/velocity-contribution.md).

## Stack

- **Client:** React 19 + TypeScript, Vite 7, React Router 7 (`client/`), plain CSS with the Electric Playground tokens, self-hosted Manrope and DM Sans (OFL), Lucide icon paths (ISC). Individual apps carry their own Studio Pop identity (theme, typography, density, primary action).
- **Server:** Node 24, Hono, SQLite via `node:sqlite` (`server/`), additive migrations in `server/db/migrations`, owner-scoped repos.
- **Shared contracts:** zod schemas for the app definition (`AppSpec`), records, rules, revisions, captures and proposals (`shared/`).
- **AI:** Anthropic Claude through `@anthropic-ai/sdk` (`server/model/anthropic.ts`) with a deterministic, clearly labelled **Sample mode** fallback (`server/model/sample/`). The live adapter reads attached screenshots; the sample adapter says it cannot.
- **Android:** one Capacitor 8 shell APK with a pinned-shortcut plugin (`android/`); each app gets a shortcut, not its own APK. See [`docs/ANDROID.md`](docs/ANDROID.md).

## What the product does (and does not)

- **Agent** (`/agent`): capture a note, a link or a screenshot. A saved URL is not read content: the capture carries an honest read status (`read`, `metadata_only` for public titles from YouTube/Vimeo/SoundCloud/Spotify, `not_read`, `unavailable`). No page is ever fetched server-side; nothing is read from your accounts or other AI chats. The reply is short and grounded, with up to four proposals: explore (steps, no app), make a new app, update an existing app, or keep the source.
- **Playground** (`/playground`): a varied set of possibilities grounded in what you shared, with real previews and a one-sentence reason; "Why this?" shows the facts and captures it cites.
- **Make mine** (`/make/:id`): the real preview first with labelled example content, one or two choices (a focus, the practice length, a layout), then "Making <App> yours…" and Ready: Open, Add to home screen, Copy app link. One intent makes one app.
- **Apps** (`/apps/{id}/`): the runtime renders validated definitions only (gallery with real photo uploads, practice timer with tempo helper and saved sources, next-action queue, journal, board, list, summary, due-soon and rotating-prompt rules). Every app has its own URL, title, icon, manifest and look. "Edit with Ori" previews a change on your own entry, keeps every record, and can be undone. No generated code runs anywhere.
- **What you've shared** (`/settings/memory`): editable facts (confirmed vs inferred, conflicts), sources and captures; forgetting stops something from informing suggestions and never deletes an app's records.
- Business model shown, not faked: 14 days free, then $7.50/month for two months, then $15/month; a disclosed AI generation allowance; no payment is collected in the prototype.

## Requirements

- Node.js 22.13+ (developed on 24.14). npm 10+.
- Optional: an Anthropic API key for live generation. Without it the app runs in Sample mode.
- Optional (Android): JDK 21 and the Android SDK (Android Studio installs both).

## Run it

```bash
npm install
# First time only: create .env from .env.example and set ANTHROPIC_API_KEY for live AI (optional).
# Never copy .env.example over an existing .env.
npm run seed              # adds the example demo account and apps (idempotent): demo@aiappstore.local / SEED_DEMO_PASSWORD (default demo-pass-2026)
npm run dev               # API on http://localhost:8787, UI on http://localhost:5173
```

Production-style (what the tests and phones use — one origin, install metadata injected per app):

```bash
npm run build
npm start                 # http://localhost:8787 serves API + built client
```

For a phone on the same Wi-Fi, open `http://<your-laptop-ip>:8787` on the phone (the server listens on all interfaces by default, `HOST=0.0.0.0`), or use a tunnel such as ngrok for an HTTPS URL, which iOS prefers for home-screen web apps.

## Environment variables

See [`.env.example`](.env.example). Names only; never commit real values.

| Variable | Purpose |
| --- | --- |
| `PORT`, `HOST` | Server bind (default 8787 / 0.0.0.0) |
| `DATABASE_PATH` | SQLite file (default `./data/app.db`) |
| `MEDIA_DIR`, `MAX_IMAGE_BYTES` | Uploaded photos (owner-scoped files; default `./data/media`, 6 MB) |
| `LINK_METADATA` | `on` (default) looks up public titles from allowlisted oEmbed providers only; `off` saves links without any lookup |
| `PUBLIC_ORIGIN` | Origin added to the API's CORS allow-list; links and manifests use the address the page was opened from |
| `MODEL_PROVIDER` | `auto` (default), `anthropic`, or `sample` |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Live AI (default model `claude-opus-5-5`; `claude-sonnet-5-5` is cheaper/faster) |
| `MODEL_TIMEOUT_MS` | Per-attempt timeout for the model calls that set none of their own (fact extraction, improvement suggestions); the Agent reply, Playground ideas and revision previews always use 90 s and app design 120 s (`docs/DEPLOY.md`) |
| `AI_GENERATION_ALLOWANCE` | Disclosed monthly fair-use allowance |
| `SEED_DEMO_PASSWORD` | Password for the seeded demo account |
| `VITE_API_BASE_URL` | Baked into the client at build time; required for the Android APK |

## Tests

```bash
npm run typecheck     # tsc, whole repo
npm test              # vitest: schema, rules, revisions, records, captures/media/proposals API, sample adapter (in-memory DB, Sample mode)
npm run test:e2e      # Playwright: builds, starts the server on :8799 with a throwaway DB in Sample mode, runs the guitar journey and layout checks
```

Live-model checks are bounded scripts: `npx tsx server/scripts/ai-agent-smoke.ts` (agent reply with and without a screenshot, practice and gallery spec generation; four calls) and `npx tsx server/scripts/ai-generate-smoke.ts`. `E2E_LIVE=1 npx playwright test tests/e2e/journey.spec.ts --project=desktop` runs the journey against the real model.

## Project layout

```
client/src/pages/      Landing, Agent, Playground, Make mine, My apps, Settings, memory, import, pricing, login
client/src/runtime/    the app runtime at /apps/{appId}/ (gallery, practice, links, queue, journal, board, list, summary, settings)
server/routes/         auth, apps/records/versions, agent (captures), media, recommendations (proposals), context, revisions
server/model/          ModelAdapter interface, Anthropic adapter, sample adapter, fallback factory
server/services/       link metadata (allowlisted oEmbed), preview content, context import
server/install.ts      per-app web manifests, icons, <head> injection, example photos
shared/                brand, AppSpec, records, rules, revision ops, captures/proposals contracts
tests/unit, tests/e2e  vitest and Playwright
docs/                  contract, demo script, test results, Android, asset sources, Velocity state
```

## Security notes (prototype)

Email/password auth with scrypt hashes and opaque session tokens (cookie on the web, bearer token in the Android shell). Every data query is owner-scoped; foreign ids return 404; photos are served only to their owner. App names and icons are readable by anyone holding the unguessable app id (needed for a fresh iOS install request); records never are. User-supplied URLs are never fetched by the server; only allowlisted oEmbed endpoints are called with the URL as a parameter. Shared text and images are treated as data by the model adapter, never as instructions. Replace the prototype auth with a managed identity provider before a public launch.

## Known limits

- No physical iPhone or Android phone was attached while building; home-screen launch on a physical device is pending (`docs/TEST_RESULTS.md`).
- Velocity outputs were not available; `docs/velocity-contribution.md` records the pending state and the prompts.
- Links to Instagram, TikTok, X and similar are saved, not read. Music is linked out; there is no playback, transcription or generation.
- The client bundle is a single chunk (~530 KB minified); no service worker yet, so a cold start needs the network.
