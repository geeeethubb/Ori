# Three-minute demo — "Your interests have somewhere to go"

The product name is undecided; the UI shows the temporary label from `shared/brand.ts` ("Your Playground").
Everything seeded is labelled **Example** in the product. The demo account is fictional.

## Before you start (5 minutes)

```bash
npm install
npm run build && npm run seed && npm start
```

Open http://localhost:8787 on the laptop. For the phone part the server must be reachable from the phone:
set `PUBLIC_ORIGIN=http://<laptop-lan-ip>:8787` in your existing `.env` (same Wi-Fi) or use an HTTPS tunnel, then open that URL in Safari on the iPhone and sign in once.

Demo sign-in: `demo@aiappstore.local` / `demo-pass-2026` (or `SEED_DEMO_PASSWORD`). `npm run seed` is additive: it adds whatever example content is missing and never touches your own apps. `npm run seed -- --reset` recreates only the demo account.

Mode badge: **Live AI** (key configured) or **Sample mode** (deterministic catalog). Say which one you are showing. In Live AI mode names vary run to run; the agent takes 10 to 30 seconds per reply and 15 to 40 seconds to design an app, so narrate while it thinks.

## The script

| Time | Screen | Say / do |
| --- | --- | --- |
| 0:00 | Landing | "Your interests have somewhere to go." Point at the phone composition: one agent, one playground, two apps that look nothing alike. **Make it yours** (or sign in). |
| 0:15 | **Agent** | Type (or use the labelled example): *"I like this sound and have 15 minutes to practice."* Paste a reel link. **Share**. |
| 0:35 | Agent reply | Read the first line aloud: it says it saved the link but did **not** read the reel, and works from the note. Three directions appear: a 15-minute exploration, a practice app, or just keep it. |
| 0:55 | **Make mine** | Open the app proposal. The only choices: 15 minutes (preselected) and the look. **Preview**: the real app renders with example content and a yellow "example" banner. **Make mine**. |
| 1:20 | **Riff** at `/apps/{id}/` | Dark room, big timer. Pick 15, **Start**, let it run a few seconds, **Pause**, **Save session**: minutes, tempo and date are prefilled; add what you worked on. Reload: the session is there. |
| 1:45 | **Light** (My apps) | Open the photography app next to it: a contact sheet of real photos, "Add photo" as the primary action, a weekly light exercise. Say: "Same engine, different app: layout, content, typography, primary action." |
| 2:05 | **People** | A queue of who, what you promised and by when, grouped by what needs attention today. Complete one. The draft is copied, never sent. |
| 2:20 | Phone | Safari → Share → **Add to Home Screen** on Riff. Leave the browser, tap the icon: Riff opens directly with the saved session. |
| 2:35 | Riff → Settings → **Make this more me** | *"Add a field for which song I practised."* Preview the change list, **Accept**. Back in the app: the session is intact, the new field appears. Show **Undo**. |
| 2:50 | **Playground** | "A few things you might be into": one featured possibility, an exploration that needs no app, one everyday need. Close on the vision and say plainly what is pending (Velocity, physical device checks). |

## What to say about limits

- "Make mine" produces a validated app definition rendered by our runtime (gallery, practice timer, saved sources, next-action queue, journal, board, list, summary, rules). We do not run generated code; the model chooses and composes real capabilities and a design.
- Links are saved, not read. Only public titles from YouTube, Vimeo, SoundCloud and Spotify are looked up. Instagram and TikTok posts are kept as links; the agent works from your note or screenshot. In Live AI mode screenshots are read; in Sample mode they are not, and the reply says so.
- No social accounts or other AI chats are read. Context comes from what the person shares here.
- Android: one shared shell APK with pinned shortcuts per app (`docs/ANDROID.md`), not one APK per app.

## Reset between runs

```bash
npm run seed -- --reset      # recreates only the demo account and its example apps
```

Apps made during a demo can be deleted from each app's settings.

## Observed first-use session (for the five user trials)

1. Ask the person to share one real inspiration (a note, a link, a screenshot). Watch what they expect the agent to have read.
2. Ask: "Which direction would you take, and why?" Note whether the reason felt personal.
3. Let them customize one thing and make the app. Note the first real action they take inside it.
4. Ask them to add the app to their home screen and open it from there.
5. Ask for one change with "Make this more me". Watch the preview; note whether they trust that their entries are safe.
