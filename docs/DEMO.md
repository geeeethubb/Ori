# Three-minute demo — "A collection that grows with you"

All sample data is labelled **Sample** in the product. The demo account is seeded by `npm run seed`
and is fictional: a founder who loves photography and needs to manage follow-ups.

## Before you start (5 minutes)

```bash
npm install
cp .env.example .env            # set ANTHROPIC_API_KEY for live AI; otherwise Sample mode is shown
npm run build && npm run seed && npm start
```

Open http://localhost:8787 on the laptop. For the phone part, make the server reachable from the phone:
`PUBLIC_ORIGIN=http://<laptop-lan-ip>:8787` in `.env` (same Wi-Fi), or an HTTPS tunnel. Open that URL in Safari on the iPhone and sign in once.

Demo sign-in: `demo@aiappstore.local` / `demo-pass-2026` (or `SEED_DEMO_PASSWORD`).
A clean run: `npm run seed -- --reset` recreates the demo account and its three sample apps.

Mode badge: **Live AI** (key configured) or **Sample mode** (deterministic catalog). Say which one you are showing. In Live AI mode the app names vary run to run (for example "Light Study Walk Journal" instead of "Photo Walk Journal"); pick the photography card. Generation takes 15 to 40 seconds per step, so narrate while it thinks.

## The script

| Time | Screen | Say / do |
| --- | --- | --- |
| 0:00 | Welcome → sign in | "People tell their AI everything, then still configure every tool by hand." |
| 0:15 | **Bring your context** | Show the copyable export prompt. Click **Founder who loves photography** (Sample). "We only use what you paste; nothing is read from your accounts." |
| 0:35 | **Your Context** | Point at a *Confirmed* vs an *Inferred* fact, the source label, remove one fact. "You edit the portrait before it shapes anything." |
| 0:55 | **For You** | Three or four cards, work and exploration side by side. Read one **Why this fits you** aloud: it quotes the profile. |
| 1:15 | **Photo Walk Journal → Build** | Type: *"Make it a weekly photography challenge and add a reflection field about what I learned."* Preview, then **Build this for me**. |
| 1:40 | The app at `/apps/{id}/` | This week's challenge is on top. **New walk**, write a reflection, **Save**. Reload: still there. |
| 2:00 | Phone | Safari → Share → **Add to Home Screen**. Leave the browser, tap the icon: the journal opens directly with the saved reflection. (Second icon for the follow-up board opens a different app.) |
| 2:25 | **Settings → Make a change** | *"Add a field for the next experiment I want to try."* Preview the change list, **Accept**. Back in the app: the reflection is retained, the new field appears. Show **Undo**. |
| 2:45 | **People to Follow Up With** | Open the sample board: one card overdue, one due today, one due soon. Move the overdue card to **Done**: it leaves the attention list. |
| 2:58 | **My Collection** | "A collection that grows with you." Mention the 14-day trial and pricing page. |

## What to say about limits

- "Build" means a validated app definition rendered by our runtime (journal, board, tracker, rules). We do not run generated code.
- No social connections are read. The vision slide covers supported, authorized integrations later.
- Android: the shared APK pins shortcuts into individual apps; see `docs/ANDROID.md` for its verification state.

## Reset between runs

```bash
npm run seed -- --reset      # recreate the demo account and sample apps
```

To remove apps built during a demo, delete them from each app's settings, or reset as above.

## Observed first-use session (for the five user trials)

1. Ask the person to paste a profile (or use a sample). Watch where they hesitate on **Your Context**.
2. Ask: "Which card would you tap first, and why?" Note whether the reason felt personal.
3. Let them customize and build. Note the first real entry they save.
4. Ask them to add the app to their home screen and open it from there.
5. Ask for one change. Watch the preview; note whether they trust that their entries are safe.
