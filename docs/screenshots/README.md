# Screenshots

## Before (session 1, 2026-11-14 morning)

- `web-*-phone.png`: the previous prototype (cream/brown "AI App Store"), Playwright Pixel 7 profile, Sample mode: import, context, for-you, build, journal, board.
- `android-*.png`: Android emulator `Pixel_9_Pro` (Android 17) running the session-1 shell: storefront, pin dialog, cold launch into the board via the shortcut intent, warm launch into the journal, two shortcuts on the home screen.

## After (redesign, 2026-11-14 afternoon)

`after/*.jpg`, taken with `node scripts/screenshots.mjs --base http://localhost:8798` against the production build in Sample mode on a throwaway database (phone 390 px and desktop 1440 px, device scale 1.5, saved as JPEG). The account, apps and the capture are created by the script; everything shown is example content.

| File | Screen |
| --- | --- |
| `landing-390/1440` | Landing: promise, phone compositions of Agent, Playground, Riff and Light, one transformation story, three steps |
| `agent-390/1440` | Agent thread: typed note with an unread Instagram link, honest reply, proposals (update Riff, exploration, keep) |
| `playground-390/1440` | Playground editorial grid with pattern-aware previews and one-sentence reasons |
| `make-390/1440`, `make-preview-390/1440` | Make mine for an update proposal: why it fits, the proposed change, the readable preview with a declined request shown honestly |
| `apps-390/1440` | My apps launcher |
| `riff-390/1440` | Riff: ink room, 15:00 timer, tempo helper, recent sessions |
| `light-390/1440` | Light: paper contact sheet of CC0 photographs, light exercise, Add photo |
| `people-390/1440` | People: next-action queue grouped by due state |
| `memory-390/1440` | What you've shared: facts by group, sources, captures with read status |
| `settings-390/1440` | Settings |

Browser-test screenshots at 320/390/768/1440 for the same screens are produced by `tests/e2e/mobile.spec.ts` into `test-results/screens/` on every `npm run test:e2e` run (not committed).
