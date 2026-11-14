# AI App Store — prototype setup

**A collection that grows with you.** Import context from your AI conversations, review what it says about you, get apps recommended for your workflows and your curiosity, build one, add it to your phone's home screen, and revise it without losing your entries.

The product vision lives in [`AI_App_Store_README.md`](AI_App_Store_README.md) and [`AI_App_Store_Exec_Summary.pdf`](AI_App_Store_Exec_Summary.pdf). This file covers running the implementation. Build progress and verified results: [`BUILD_STATUS.md`](BUILD_STATUS.md), [`docs/TEST_RESULTS.md`](docs/TEST_RESULTS.md), demo script: [`docs/DEMO.md`](docs/DEMO.md).

## Stack

- **Client:** React 19 + TypeScript, Vite 7, React Router 7 (`client/`)
- **Server:** Node 24, Hono, SQLite via Node's built-in `node:sqlite` (`server/`), migrations in `server/db/migrations`
- **Shared contracts:** zod schemas for the app definition (`AppSpec`), records, rules and revisions (`shared/`)
- **AI:** Anthropic Claude through `@anthropic-ai/sdk` (`server/model/anthropic.ts`) with a deterministic, clearly labelled **Sample mode** fallback (`server/model/sample/`)
- **Android:** Capacitor 8 shell with a pinned-shortcut plugin (`android/`), see [`docs/ANDROID.md`](docs/ANDROID.md)

## Requirements

- Node.js 22.13+ (developed on 24.14). npm 10+.
- Optional: an Anthropic API key for live generation. Without it the app runs in Sample mode.
- Optional (Android): JDK 21 and the Android SDK (Android Studio installs both).

## Run it

```bash
npm install
cp .env.example .env      # then set ANTHROPIC_API_KEY=... for live AI (optional)
npm run seed              # sample demo account: demo@aiappstore.local / demo-pass-2026
npm run dev               # API on http://localhost:8787, UI on http://localhost:5173
```

Production-style (what the tests and phones use — one origin, install metadata injected per app):

```bash
npm run build
npm start                 # http://localhost:8787 serves API + built client
```

For a phone on the same Wi-Fi, set `PUBLIC_ORIGIN=http://<your-laptop-ip>:8787` in `.env` and open that URL on the phone (or use a tunnel such as ngrok for an HTTPS URL, which iOS prefers for home-screen web apps).

## Environment variables

See [`.env.example`](.env.example). Names only; never commit real values.

| Variable | Purpose |
| --- | --- |
| `PORT`, `HOST` | Server bind (default 8787 / 0.0.0.0) |
| `DATABASE_PATH` | SQLite file (default `./data/app.db`) |
| `PUBLIC_ORIGIN` | Absolute origin used in links and CORS |
| `MODEL_PROVIDER` | `auto` (default), `anthropic`, or `sample` |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Live AI (default model `claude-opus-5-5`; `claude-sonnet-5-5` is cheaper/faster) |
| `MODEL_TIMEOUT_MS` | Per-call timeout for the model adapter |
| `SEED_DEMO_PASSWORD` | Password for the seeded demo account |
| `VITE_API_BASE_URL` | Baked into the client at build time; required for the Android APK (the phone cannot reach your laptop's `localhost`) |

## Tests

```bash
npm run typecheck     # tsc, whole repo
npm test              # vitest: schema, rules, revisions, records, sample adapter, API (in-memory DB)
npm run test:e2e      # Playwright: builds, starts the server on :8799 with a throwaway DB in Sample mode, runs the demo journey at phone + desktop widths
```

The live adapter is exercised by `npx tsx server/scripts/ai-generate-smoke.ts` (spends a few cents; needs the key), and the whole journey can run against the real model with `E2E_LIVE=1 npx playwright test tests/e2e/journey.spec.ts --project=desktop`.

## Project layout

```
client/src/pages/      storefront: Welcome, Import, Your Context, For You, Build, Collection, Pricing, Account
client/src/runtime/    the personal-app runtime at /apps/{appId}/ (journal, board, list, summary, settings)
server/routes/         auth, apps/records/versions, context, recommendations, revisions
server/model/          ModelAdapter interface, Anthropic adapter, sample adapter, fallback factory
server/install.ts      per-app web manifests, icons, <head> injection for home-screen installs
shared/                AppSpec schema, records, rules (due-soon, metrics, prompts), revision ops
tests/unit, tests/e2e  vitest and Playwright
docs/                  API contract, demo script, test results, Android, Velocity contribution
```

## Security notes (prototype)

Email/password auth with scrypt hashes and opaque session tokens (cookie on the web, bearer token in the Android shell). Every data query is owner-scoped; foreign IDs return 404. App names and icons are served by unguessable ID for home-screen installs; records never are. Imported text is treated as data by the model adapter, never as instructions. Replace the prototype auth with a managed identity provider before a public launch.
