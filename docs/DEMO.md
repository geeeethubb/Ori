# Ori demo: inspiration → personal app → home-screen entry → safe revision

Ori is an AI-native phone experience on the phone you already own: your AI companion turns a spark into a personal app you can open from your home screen and keep changing by asking. This script follows **one** real Light journey. Everything example-like in the product is labelled **Example**; the demo account is fictional.

There are two ways to show it:

- **In the pitch (`/pitch/`)**: scenes 6–8 play three real recordings of the same Light app and the same saved photo. They were recorded in **Sample mode (scripted responses, not live AI)** and say so on screen. Scene 8 reopens the app by its own link in a fresh browser session; it is not a home-screen launch.
- **Live in the product** (below), in Sample mode for timing, or Live AI if you want real model replies and can wait.

## Before you start

```bash
npm install
npm run build
npm start            # http://localhost:8787 with your configured .env (never copy .env.example over it)
```

- Demo account: `demo@aiappstore.local`, password = `SEED_DEMO_PASSWORD` from your `.env` (default `demo-pass-2026`). For a clean creation journey, sign up a fresh account instead: an account that already has Light is offered "Open Light" rather than a new app (by design).
- **Sample mode** (`MODEL_PROVIDER=sample`): deterministic scripted responses, no model calls, about one second per step. **Live AI** (`MODEL_PROVIDER=auto` with a key): real model replies; the first reply to a shared photo took about 100 s in our checks, later ones 5–20 s. Say which mode you are showing; the UI shows a Sample mode badge.
- Phone: a phone cannot open `localhost`. Use the hosted URL (see `docs/DEPLOY.md`). Adding to the home screen has not yet been verified on a physical phone; the Android shell opens an app directly from its launcher shortcut on the emulator.

## The live script (about three minutes)

| Time | Screen | Do / say |
| --- | --- | --- |
| 0:00 | Landing `/` | "Your interests have somewhere to go." Point at the home-screen strip: Ori, Light, Riff, People, each its own app. **Make it yours** (sign up, or sign in). |
| 0:15 | **Agent** | Attach a street photo and type: *"I keep stopping for long shadows on brick walls in the late afternoon. I want to get better at noticing light on my walks."* **Send**. |
| 0:30 | Agent reply | Read it: it says what it read (the note; Sample mode cannot read the photo) and offers **Light: a photo journal shaped around you**, a one-off light walk, or **Keep inspiration**. Open **Why this?** for a second. **Preview Light**. |
| 0:50 | **Make Light yours** | The real app with labelled example photos. Type the focus *"Focus on shadows and reflections"* → **Update preview**: it becomes this week's prompt. **Make mine** → "Making Light yours…" → **Light is yours**: Open Light, Add to home screen, Copy app link. |
| 1:15 | **Light** at `/apps/{id}/` | Its own URL, its own icon, no Ori navigation. Your photo is already the first entry. Open it, write what you noticed ("Low sun turns the brick wall gold"), **Save**. Reload: still there. |
| 1:40 | **Add to home screen** | From the "…" menu: the steps for this phone's browser and Copy app link. Say plainly: "On a phone you add it from Safari's Share menu; it then opens Light directly." (Device check pending.) |
| 1:55 | **Edit with Ori** | Ask: *"Add camera settings to my photo notes."* **Preview change**: the review lists Camera, Shutter and Aperture, says your photos and notes stay, and shows the change on your own photo. **Apply change** → "Updated. Existing photos and notes kept." with **Undo**. |
| 2:20 | The same photo | Open it: the same photo and note, now with Camera. Type "Fuji X100V", save. |
| 2:35 | Other apps (optional) | My apps: Riff (a timer that keeps planned and measured time apart) and People (a queue with Today and Upcoming; drafts are copied, never sent). |
| 2:50 | Close | "Tell Ori what caught your eye. It makes the app, and you keep making it yours." |

## If something goes wrong

- A live reply is slow: say what is happening, or switch the server to Sample mode (restart with `MODEL_PROVIDER=sample`) and say so.
- Undo is in the app's "…" menu → History and undo: it keeps every entry and the camera value typed since.
- Never present the pitch's concept images or the Sample-mode recordings as live AI output.
