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

### Environment variables

Server-only means it is read by the Node process at run time and never reaches the browser. Nothing here may be prefixed `VITE_`: Vite compiles `VITE_*` values into the public JavaScript.

| Variable | Value | Server-only | Notes |
| --- | --- | --- | --- |
| `NODE_ENV` | `production` | yes | |
| `PORT` | set by the platform | yes | the server listens on whatever the platform provides (Render injects it) |
| `HOST` | `0.0.0.0` | yes | |
| `DATABASE_PATH` | `/var/data/app.db` | yes | on the persistent disk; WAL files are created beside it |
| `MEDIA_DIR` | `/var/data/media` | yes | uploaded photos; the `media` table is the owner-scoped index |
| `PUBLIC_ORIGIN` | `https://<your-service>.onrender.com` (or your domain), no trailing slash | yes | used for app links, manifests and allowed origins; set it once the service URL exists, then redeploy |
| `COOKIE_SECURE` | `true` | yes | HTTPS sessions (`auto` also works behind the proxy via `x-forwarded-proto`) |
| `MODEL_PROVIDER` | `auto` (live when a key is set) or `sample` (scripted responses, no model calls, no cost) | yes | the UI labels Sample mode wherever it shows |
| `ANTHROPIC_API_KEY` | your key, as a **secret** | **yes, secret** | never commit it; never in a `VITE_` variable |
| `ANTHROPIC_MODEL` | `claude-opus-5-5` | yes | the configured model |
| `MODEL_TIMEOUT_MS` | `45000` | yes | the first live reply took about 100 s in our checks; at 45 s it falls back to a labelled Sample reply. Raise to `120000` if you prefer waiting for the live reply |
| `AI_GENERATION_ALLOWANCE` | `300` | yes | the monthly fair-use number shown on pricing |
| `MAX_IMAGE_BYTES` | `6291456` | yes | 6 MB upload limit |
| `LINK_METADATA` | `on` | yes | allowlisted oEmbed titles only; no page is ever fetched |
| `CORS_ORIGINS` | leave empty | yes | only for extra origins; the Android shell's own origins are built in |
| `SEED_DEMO_PASSWORD` | a dedicated value of at least 12 characters (never the documented development default) | **yes, secret** | used only when the seed creates the demo account `demo@aiappstore.local`; changing it later does not change an existing account's password |
| `SEED_DEMO_ON_START` | `true` to seed the demo account when the server starts; otherwise unset | yes | for hosts without a shell: runs the same additive seed as `npm run seed` before serving; refuses to run without a dedicated `SEED_DEMO_PASSWORD`; never logs it |
| `VITE_API_BASE_URL` | **unset** for the web build | build-time, public | only the Android shell build sets it (`scripts/build-apk.mjs --api-base`) |

`render.yaml` in the repository is a Render Blueprint with exactly these settings; `PUBLIC_ORIGIN` and `ANTHROPIC_API_KEY` are left for the dashboard (`sync: false`).

## Steps

1. Push `main` to the repository the service deploys from (done: `https://github.com/geeeethubb/Ori`).
2. Create the service: New → Blueprint (uses `render.yaml`), or a Web Service with the settings above.
3. Attach the disk at `/var/data` (1 GB) before the first deploy, so the first database is created on it.
4. Set the secrets (`ANTHROPIC_API_KEY`, optionally `SEED_DEMO_PASSWORD`) and `PUBLIC_ORIGIN` = the service URL; deploy again so links and manifests use it.
5. Open `https://<url>/api/health`, then `https://<url>/pitch/`.
6. Run the deployment check against the live URL, restart the service, and run it again:
   ```bash
   node scripts/verify-deploy.mjs --base https://<url> --phase before --state deploy-check.json
   # restart the service (dashboard → Manual Deploy → Restart service)
   node scripts/verify-deploy.mjs --base https://<url> --phase after --state deploy-check.json
   ```
   It creates one throwaway account and one app ("Deploy check …"); delete them afterwards if you like.
7. On a phone: open an app's own link (`https://<url>/apps/<id>/`) in Safari → Share → Add to Home Screen, and launch it from the icon. This has not been verified on a device yet.

## The demo account on a hosted service

The demo account `demo@aiappstore.local` is clearly labelled sample data: Riff, Light and People with example entries and four CC0 example photos, two example Agent conversations and Playground ideas, all made without model calls. To create it on the host:

1. In the service's environment set `SEED_DEMO_PASSWORD` to a dedicated value (at least 12 characters; keep it in a password manager, never in Git or the pitch) and `SEED_DEMO_ON_START=true`. Saving the environment redeploys the service.
2. At the next start the server logs `[seed] demo account created; Riff added, Light added, People added; 4 example photos copied` (on later starts: `kept`). It only ever adds what is missing to the demo account; it never resets the database, never touches other accounts and never changes an existing demo password.
3. Leave the flag on (it is idempotent) or remove it. With a shell (Render's Shell tab on paid instances), `npm run seed` does the same; never pass `--reset` on a host.

## Verified on the live service

_Filled in after the final deployment; see the handoff in `BUILD_STATUS.md`._

## Verified locally (stand-in for the service)

`npm start` with production settings, Sample mode, a throwaway database and media folder, `SEED_DEMO_ON_START=true` with a test password, restarted once (2026-11-15 00:46):

- `node scripts/verify-deploy.mjs --phase before --pitch no --demo-password-file …`: **18/18** (demo account signs in and has Riff, Light and People; sign up, log out, log in; share → reply → design → Make mine; photo upload; an observation with the photo; the photo refused to another account; revision preview and apply with the observation unchanged; the app's own link).
- After the restart, `--phase after`: **10/10** (the old session still works, log in, the app with its revision, the observation and the photo are all there).
- Two boots with seeding on: first `demo account created; Riff added, Light added, People added; 4 example photos copied`, then `kept … 0 example photos copied`; the password appears in neither log.

## Notes and limits

- One instance only. A deploy restarts the process (a short gap); services with a disk cannot do zero-downtime deploys on Render.
- Back up the disk: the platform's disk snapshots, or an online SQLite backup of `/var/data/app.db`. Never copy a local `data/app.db` to the server unless you mean to: the deployed database starts empty.
- Live model calls bill to the configured key. `MODEL_PROVIDER=sample` gives a free, scripted demo, labelled as Sample mode in the UI.
- The Android shell talks to the deployed API when built with `node scripts/build-apk.mjs --api-base https://<url>`.
- iOS "Add to Home Screen" and installable web apps need the HTTPS origin; a `localhost` link cannot be opened on a phone (the install sheet says so).
