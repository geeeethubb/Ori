# Ori demo: inspiration → personal app → home-screen entry → safe revision

Ori is an AI-native phone experience on the phone you already own: your AI companion turns a spark into a personal app you can open from your home screen and keep changing by asking. This script follows **one** real Light journey. Everything example-like in the product is labelled **Example**; the demo account is fictional.

There are two ways to show it:

- **In the pitch (`/pitch/`)**: 15 presented scenes, about four minutes (3:58). #5 and #6 play two real recordings of the same Light app and saved photo, made in **Sample mode (scripted responses, not live AI)**, and say so on screen. #7 plays the founder's own recording of bringing context from an AI and the Playground's suggestions, filmed on a phone against the live service in **Live AI** (labelled so; waiting may have been trimmed). The return-to-Light clip (a fresh browser session opening the app by its own link; not a home-screen launch) is in the appendix.
- **Live in the product** (below). The names and replies in the script are Sample mode's (`MODEL_PROVIDER=sample`). The hosted service (https://ori-fjrx.onrender.com), which is the URL a phone uses, runs Live AI (its `/api/health` reports `"modelMode":"anthropic"`). There Ori reads the photo, and the reply, the proposed app's name and the change summary come from the model, so they differ from the script (the hosted check proposed "Street Light Contact Sheet", not Light). If a live call fails, Ori answers with a labelled Sample reply instead. Putting the hosted service in Sample mode means setting `MODEL_PROVIDER=sample` in Render, which redeploys it for everyone.

## Before you start

```bash
npm install
npm run seed         # adds the labelled demo account and its example apps if missing (additive; never pass --reset)
npm run build
npm start            # http://localhost:8787 with your configured .env (never copy .env.example over it)
```

- Demo account: `demo@aiappstore.local`, created by `npm run seed`. Locally its password is the `SEED_DEMO_PASSWORD` from your `.env` when the account was first seeded (default `demo-pass-2026`). On the hosted service it is the dedicated value the founder set in Render before running `npm run seed` there once (the seed uses `SEED_DEMO_PASSWORD` exactly as set; see `docs/DEPLOY.md`). For a clean creation journey, sign up a fresh account instead: an account that already has Light is offered "Open Light" rather than a new app (by design). The optional 2:35 step needs the demo account, the only one with Riff and People: sign in to it before you start, in a private window or another browser.
- **Sample mode** (`MODEL_PROVIDER=sample`): deterministic scripted responses, no model calls, about one second per step. **Live AI** (`MODEL_PROVIDER=auto` with a key; what the hosted service runs): real model replies, usually 3–22 s per call in our checks (on the hosted service the Agent reply took 10.5 s and a shared photo 17.3 s), but the first call of two local runs took about 100 s. Say which mode you are showing; the UI shows a Sample mode badge.
- Phone: a phone cannot open `localhost`. Use the hosted URL (see `docs/DEPLOY.md`). The hosted service runs Live AI, so its names and replies differ from the script (see above). Adding to the home screen has not yet been verified on a physical phone. On the Android emulator, the Ori shell opens an app directly when its shortcut's intent is sent with adb, warm and cold. Tapping a pinned icon was last checked with an earlier build, where it opened the app while the shell was running; a tap from cold was intercepted by Play Protect on the emulator image when it was last tried (`docs/ANDROID.md`).

## The live script (about three minutes)

| Time | Screen | Do / say |
| --- | --- | --- |
| 0:00 | Landing `/` | "Your interests have somewhere to go." Point at the home-screen strip: Ori, Light, Riff, People, each its own app. **Make it yours** (sign up, or sign in). |
| 0:15 | **Agent** | Attach a street photo and type: *"I keep stopping for long shadows on brick walls in the late afternoon. I want to get better at noticing light on my walks."* **Send**. |
| 0:30 | Agent reply | Read it: it says what it read (in Sample mode only the note, since Sample mode cannot read the photo; in Live AI the photo too) and offers a photo app (in Sample mode **Light: a photo journal shaped around you**; in Live AI a name the model picks), a one-off light walk, or **Keep inspiration**. Open **Why this?** for a second. **Preview** it. |
| 0:50 | **Make Light yours** | The real app with labelled example photos. Type the focus *"Focus on shadows and reflections"* → **Update preview**: it becomes this week's prompt. **Make mine** → "Making Light yours…" → **Light is yours**: Open Light, Add to home screen, Copy app link. |
| 1:15 | **Light** at `/apps/{id}/` | Its own URL, its own icon, no Ori navigation. Your photo is already the first entry. Open it, write what you noticed ("Low sun turns the brick wall gold"), **Save**. Reload: still there. |
| 1:40 | **Add to home screen** | From the "…" menu: the steps for this phone's browser and Copy app link. Say plainly: "On an iPhone you add it from Safari's Share menu; on Android, from Chrome's menu. It is set up to open Light directly, but we have not yet tried that on a physical phone." |
| 1:55 | **Edit with Ori** | Ask: *"Add camera settings to my photo notes."* **Preview change**: the review lists Camera, Shutter and Aperture, says your photos and notes stay, and shows the change on your own photo. **Apply change** → "Updated. Existing photos and notes kept." with **Undo**. |
| 2:20 | The same photo | Open it: the same photo and note, now with Camera. Type "Fuji X100V", save. |
| 2:35 | Other apps (optional; demo account only) | A fresh account holds only the Light you just made, so show these from the demo account. Sign in to it before you start, in a private window or another browser: a second tab in the same browser shares the session and would switch accounts. There, My apps: Riff (a timer that keeps planned and measured time apart) and People (a queue with Today and Upcoming; drafts are copied, never sent). |
| 2:50 | Close | "Tell Ori what caught your eye. It makes the app, and you keep making it yours." |

## If something goes wrong

- A live reply is slow: say what is happening. On a local server you can switch to Sample mode by restarting it with `MODEL_PROVIDER=sample`, and say so. On the hosted service that is an environment change in Render, which redeploys the service (a build, then a restart with a short gap), so it is not something to do mid-demo: check `modelMode` at `/api/health` and choose the mode before you start.
- Undo is in the app's "…" menu → History and undo: it keeps every entry and the camera value typed since.
- Never present the pitch's concept images or the Sample-mode recordings as live AI output.
