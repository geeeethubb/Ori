# Deploying Ori: one Node web service with a persistent disk

**Live on Render:** the product at https://ori-fjrx.onrender.com/ and the pitch at https://ori-fjrx.onrender.com/pitch/ (health: `/api/health`). What was checked on the live service, and when, is under [Verified on the live service](#verified-on-the-live-service).

One Node process serves everything: the API, the built web app (`dist/client`), each personal app's own URL and install metadata (`/apps/<id>/`, manifest, icons), and the pitch at `/pitch/` with its three recordings. Data lives in one SQLite file (Node's built-in `node:sqlite`, WAL mode) plus uploaded photos as files, both on a persistent disk. Schema migrations are additive and run automatically when the server starts. The database architecture is unchanged for deployment.

## Exact settings

| Setting | Value | Why |
| --- | --- | --- |
| Runtime | Node **24.14.1** (`.node-version` in the repo; on Render also `NODE_VERSION=24.14.1`) | `node:sqlite` and the tested version; `package.json` allows ≥ 22.13 |
| Build command | `npm ci --include=dev && npm run build` | Vite (build) and tsx (start) are dev dependencies; `--include=dev` keeps them even when `NODE_ENV=production` |
| Start command | `npm start` (runs `tsx server/index.ts`) | the existing start script |
| Health check | `/api/health` | returns `{"ok":true,"name":"Ori",…}` |
| Persistent disk | mounted at `/var/data`, 1 GB | the database file, its `-wal`/`-shm` files and the photos |
| Instances | exactly 1 | one SQLite file on one disk; do not scale out |
| Instance type | `starter` or larger (paid) | persistent disks are not available on free instances |

### Environment variables

Server-only means it is read by the Node process at run time and is never compiled into the browser JavaScript. A few of these values are shown to users by design through the API: the AI allowance (`/api/health`, pricing, settings), the resolved model mode (`/api/health`, the Sample mode labels) and the upload limit (in the "too large" message). Secrets (`ANTHROPIC_API_KEY`, `SEED_DEMO_PASSWORD`) never reach the browser; the model mode reveals only whether a live key is in use. Nothing here may be prefixed `VITE_`: Vite compiles `VITE_*` values into the public JavaScript.

| Variable | Value | Server-only | Notes |
| --- | --- | --- | --- |
| `NODE_ENV` | `production` | yes | |
| `PORT` | set by the platform | yes | the server listens on whatever the platform provides (Render injects it) |
| `HOST` | `0.0.0.0` | yes | |
| `DATABASE_PATH` | `/var/data/app.db` | yes | on the persistent disk; WAL files are created beside it |
| `MEDIA_DIR` | `/var/data/media` | yes | uploaded photos; the `media` table is the owner-scoped index |
| `PUBLIC_ORIGIN` | `https://<your-service>.onrender.com` (or your domain), no trailing slash | yes | added to the API's CORS allow-list, which only matters to a page on another origin calling this API; app links, manifests and icons are relative or use the address the page was opened from, so it does not change them |
| `COOKIE_SECURE` | `true` | yes | HTTPS sessions (`auto` also works behind the proxy via `x-forwarded-proto`) |
| `MODEL_PROVIDER` | `auto` (live when a key is set) or `sample` (scripted responses, no model calls, no cost) | yes | the UI labels Sample mode wherever it shows |
| `ANTHROPIC_API_KEY` | your key, as a **secret** | **yes, secret** | never commit it; never in a `VITE_` variable |
| `ANTHROPIC_MODEL` | `claude-opus-5-5` | yes | the configured model |
| `MODEL_TIMEOUT_MS` | `45000` | yes | per-attempt timeout for the model calls that set none of their own: fact extraction (context imports) and improvement suggestions. Whatever this is set to, the Agent reply, Playground ideas and revision previews use 90 s per attempt and app design 120 s. The SDK retries a timed-out attempt up to twice before Ori falls back to a labelled Sample reply. The browser stops waiting after 120 s for the Agent, Playground ideas, app design and the Make page's update preview, and after 90 s for an Edit with Ori preview, a suggestion or an import, so a value above `90000` lets one attempt outlast the browser. On the Render service the four checked live calls took 3–17 s; locally the first live reply to a shared photo took 103 s and still came from the live model. |
| `AI_GENERATION_ALLOWANCE` | `300` | yes | the monthly fair-use number shown on pricing |
| `MAX_IMAGE_BYTES` | `6291456` | yes | 6 MB upload limit |
| `LINK_METADATA` | `on` | yes | allowlisted oEmbed titles only; no page is ever fetched |
| `CORS_ORIGINS` | leave empty | yes | only for extra origins; the Android shell's own origins are built in |
| `SEED_DEMO_PASSWORD` | a dedicated value of at least 12 characters (never the documented development default) | **yes, secret** | used only when the seed creates the demo account `demo@aiappstore.local`; changing it later does not change an existing account's password |
| `SEED_DEMO_ON_START` | `true` to seed the demo account when the server starts; otherwise unset | yes | for hosts without a shell: runs the same additive seed as `npm run seed` before serving; refuses to run without a dedicated `SEED_DEMO_PASSWORD` (only this boot-time path checks; `npm run seed` does not); never logs it |
| `VITE_API_BASE_URL` | **unset** for the web build | build-time, public | only the Android shell build sets it (`scripts/build-apk.mjs --api-base`) |

`render.yaml` in the repository is a Render Blueprint with these settings on the `starter` instance type (persistent disks need a paid instance). `PUBLIC_ORIGIN` and `ANTHROPIC_API_KEY` are declared with `sync: false` and set in the dashboard. `PORT` comes from the platform, and `CORS_ORIGINS`, `SEED_DEMO_ON_START` and `VITE_API_BASE_URL` stay unset. The optional `SEED_DEMO_PASSWORD` is not in the file: add it in the dashboard only when you seed the demo account (see below).

## Steps

1. Push `main` to the repository the service deploys from (done: `https://github.com/geeeethubb/Ori`).
2. Create the service: New → Blueprint (uses `render.yaml`), or a Web Service with the settings above.
3. Attach the disk at `/var/data` (1 GB) before the first deploy, so the first database is created on it.
4. Set the secrets (`ANTHROPIC_API_KEY`, and `SEED_DEMO_PASSWORD` before any demo seeding) and `PUBLIC_ORIGIN` = the service URL (it only adds that URL to the CORS allow-list; links and manifests already use the address the page is opened from).
5. Open `https://<url>/api/health`, then `https://<url>/pitch/`.
6. From the repository root, run the deployment check against the live URL, restart the service, and run it again. The state file holds the throwaway account's email, password and a signed-in session cookie (valid for 30 days), so keep it outside the repository and delete it when you are done (`.gitignore` also ignores `deploy-check*.json`, as a safety net):
   ```bash
   node scripts/verify-deploy.mjs --base https://<url> --phase before --state ../ori-deploy-check.json
   # restart the service (dashboard → Manual Deploy → Restart service)
   node scripts/verify-deploy.mjs --base https://<url> --phase after --state ../ori-deploy-check.json
   ```
   Add `--expect-live yes` to the first run when the service uses the live model (a Sample fallback then counts as a failure), and `--demo-password-file <file outside Git>` to either run to also check the demo account. Each `--phase before` run creates two throwaway accounts: `deploy-check-…@example.test` (display name "Deploy check"; its random password is kept only in the state file) and `deploy-stranger-…@example.test` (used only to confirm the photo is refused to another account; its password is not kept). It also creates one app, named by the designer (the Render run made "Street Light Contact Sheet"), holding one photo entry whose note starts "Deploy check:". To clean up, sign in as the deploy-check account and use Delete this app in the app's settings. The product cannot delete accounts, so the two accounts can only be removed in the database.
7. On a phone: open an app's own link (`https://<url>/apps/<id>/`) in Safari → Share → Add to Home Screen, and launch it from the icon. This has not been verified on a device yet.

## The demo account on a hosted service

The demo account `demo@aiappstore.local` is clearly labelled sample data: Riff, Light and People with example entries and four CC0 example photos, two example Agent conversations and Playground ideas, all made without model calls. To create it on the host:

1. In the service's environment set `SEED_DEMO_PASSWORD` to a dedicated value (at least 12 characters; keep it in a password manager, never in Git or the pitch) and `SEED_DEMO_ON_START=true`. Saving the environment redeploys the service.
2. At the next start the server logs `[seed] demo account created; Riff added, Light added, People added; 4 example photos copied` (on later starts: `kept`). It only ever adds what is missing to the demo account; it never resets the database, never touches other accounts and never changes an existing demo password.
3. Once the account exists, remove `SEED_DEMO_ON_START` (or set it to anything but `true`): the seed recognises the demo apps by name, so if someone renames one, a later start would add a fresh copy. With a shell (Render's Shell tab on paid instances), `npm run seed` runs the same additive seed, but without the boot-time password check: if the demo account is missing it creates it with `SEED_DEMO_PASSWORD` exactly as set (no length or default check), or with the public development default when the variable is unset, so set the dedicated value before running it. Never pass `--reset` on a host.

## Verified on the live service

Checks against https://ori-fjrx.onrender.com on 2026-11-15 (times CST). Browser sizes are emulated viewports, not physical phones.

- 00:47–00:49, deployed commit `809eed0`: `node scripts/verify-deploy.mjs --phase before --pitch no --expect-live yes`: **19/19**. The Agent reply (10.5 s), the app design (16.5 s) and the revision (3.1 s) came from the live model with no Sample fallback. So did a photo shared right after (17.3 s, read status "read").
- 00:54:59, after the redeploy with the new environment and the deploy of `5704696`: `--phase after`: **10/10**. The demo account signs in and has Light, People and Riff; the session from before still works; the app, its revision (11 fields), the observation and the photo are all still there.
- About 01:00, commit `5704696`: a browser check (Playwright Chromium, 390 × 844) signed in as the demo account and opened Light at its own link, with its four photos and its install manifest: **9/10**. The one miss is two 401 console lines from the signed-out session check on the landing and login pages.
- 01:24, interim pitch (15 scenes), commit `b8a1808` (first served 01:24:01): `--phase after`: **19/19**. These are the ten checks above, run again after the service's restarts since 00:47, plus `/pitch` → `/pitch/`, the deck, and its three recordings in MP4 and WebM (six files, each served as 206). Also `node scripts/check-pitch.mjs --base https://ori-fjrx.onrender.com/pitch/`: **52/52** in Chromium and Edge. A 16-slide revision of the deck is in progress; these checks cover the interim deck only.
- 05:34, the revised pitch (15 presented scenes, 3:58), commit `17a7ac2` (first served 05:34:16): `--phase after`: **21/21** (all eight recordings served, including the founder's `ori-context-demo.mp4`; the demo account; records, photo and revision kept across the restarts); `check-pitch.mjs --scenes 15` in Chromium and Edge: **68/68**; `check-pitch-density.mjs`: **15/15**; the final slide's QR decodes to https://ori-fjrx.onrender.com/ at 1366, 1600 and 1920 wide (`docs/ori/evidence/render/pitch-revised-live-check-2026-11-15.txt`).
- 06:08, the final pitch after the live audit's stage fixes, commit `67f627e` (first served 06:07:53): a presentation-clicker test in Edge (PageDown only: the five-stage reveal, and each demo clip starting before the deck moves on): **16/16**; `check-pitch.mjs --scenes 15` in Chromium and Edge: **68/68**; `--phase after`: **21/21**; density **15/15**; the QR decodes to the product root at 1366, 1600 and 1920 wide (`docs/ori/evidence/render/pitch-final-live-check-2026-11-15.txt`).

Evidence: `docs/ori/evidence/render-live-check-2026-11-15.txt`, `docs/ori/evidence/render/hosted-ui-check-2026-11-15.txt`, `docs/ori/evidence/render/pitch-live-check-2026-11-15.txt` and the screenshots beside them. Summary: `docs/TEST_RESULTS.md` section 8.

## Verified locally (stand-in for the service)

`npm start` with production settings on `PORT=8856`, Sample mode, a throwaway database and media folder, `SEED_DEMO_ON_START=true` with a test password, restarted once (2026-11-15 00:46):

- `node scripts/verify-deploy.mjs --base http://localhost:8856 --phase before --state <state file outside Git> --pitch no --demo-password-file <file>`: **18/18** (demo account signs in and has Riff, Light and People; sign up, log out, log in; share → reply → design → Make mine; photo upload; an observation with the photo; the photo refused to another account; revision preview and apply with the observation unchanged; the app's own link).
- After the restart, the same command with `--phase after`: **10/10** (the old session still works, log in, the app with its revision, the observation and the photo are all there).
- Two boots with seeding on: first `demo account created; Riff added, Light added, People added; 4 example photos copied`, then `kept … 0 example photos copied`; the password appears in neither log.

## Notes and limits

- One instance only. A deploy restarts the process (a short gap); services with a disk cannot do zero-downtime deploys on Render.
- Back up the disk: the platform's disk snapshots, or an online SQLite backup of `/var/data/app.db`. Never copy a local `data/app.db` to the server unless you mean to: the deployed database starts empty.
- Live model calls bill to the configured key, and sign-up on the live service is open: anyone with the URL can create accounts (there is no email check, and the sign-up limit counts IP and email together). Each new account gets a 14-day trial with 300 AI generations a month, and importing context (`POST /api/context/sources`) calls the model without that check. Before sharing the URL, give the key a monthly spend limit (its own workspace in the Anthropic Console). When judging ends, set `MODEL_PROVIDER=sample` (free, scripted, labelled Sample mode in the UI) and revoke the key.
- The Android shell talks to the deployed API when built with `node scripts/build-apk.mjs --api-base https://<url>`.
- iOS "Add to Home Screen" and installable web apps need the HTTPS origin; a `localhost` link cannot be opened on a phone (the install sheet says so).
