# AI-native phone audit: finding-by-finding status

Source: `AI_Native_Phone_Audit_Claude_Brief.md` (audited 2026-11-14), an audit brief the founder supplied to the build session; it is not in this repository. The later Ori brief (`docs/ori/ORI_CLAUDE_BUILD_PROMPT.md`, `ORI_DESIGN_SPEC.md`) settled the name, messaging and navigation, so where the two conflict the Ori wording wins; the audit's functional findings were implemented under Ori's vocabulary ("Edit with Ori" for "Ask AI to change this", "Make mine"/"Add to home screen" for the action states). Status: **implemented**, **superseded** (by the Ori brief, with what replaced it), **partial**, **blocked** (with the reason). Evidence is Sample mode unless it says live; no physical device was available.

| Finding | Status | What exists now | Evidence |
| --- | --- | --- | --- |
| P0-01 The promise on the first screen | **Implemented in Ori's words; "AI-native phone" headline superseded** | Landing: companion + `ori`, "Your interests have somewhere to go.", "Your AI companion turns interests and everyday needs into apps made for you. Open them right from your home screen.", Make it yours / Try an example, a home-screen composition with Ori, Light, Riff, People. Agent first use: "What caught your eye?" with starters and one labelled example. The pitch uses "AI-native phone experience" once, as the vision. | `docs/ori/screens/landing-*`, `agent-first-*`; the ten-second comprehension test with a real first-time observer was **not run** (no observer): an unvalidated design target |
| P0-02 Previews match the requested app | **Implemented** | Proposal illustrations read the proposal's domain from two agreeing signals and its minutes (sketching at 10:00, music, people, photos, newsletter, neutral when unsure); preview records come from `shared/previewContent.ts` with eight more domains; the Sample Agent now knows sketching. Example content is labelled and never saved. | `client/src/pages/parts/preview.test.ts`, `tests/unit/previewContent.test.ts`; screenshots |
| P0-03 The mobile creation footer covered the app | **Implemented** | No sticky creation panel: the preview comes first (a compact strip on phones, "Show the whole preview"), choices below it, one Make mine; full-screen preview with an obvious exit and the same single Make mine. At 320 × 568 Make mine needs a short scroll; it is never covered. | browser suite: no horizontal overflow at 320/390/768/1440 on the Make page and its states; `make-*` screenshots |
| P0-04 The phone payoff (install) | **Implemented; physical device blocked** | Ready screen: Open, Add to home screen, Copy app link; every app's "…" menu and the My apps tile offer Add to home screen; a small one-time offer after the first saved entry; platform steps (iOS Safari, Android Chrome, the Ori Android shell); a `localhost` link is detected and the sheet says a phone cannot open it; sign-in keeps the app destination; no cross-device sign-in promise. | `tests/e2e/light.spec.ts`, `installGuide.test.ts`; Android emulator: the shell's shortcut intent opens Light directly, cold and warm (`docs/ori/evidence/android/`). **Blocked:** a physical phone (none was available). The HTTPS origin a phone needs is live at https://ori-fjrx.onrender.com and serves each app's manifest and icons (`docs/DEPLOY.md`). |
| P1-01 Explicit requirements before defaults | **Implemented** | Duration words in a request ("ten-minute", "10 min", "half an hour") become the proposal's minutes, the Make page starts there, the designer makes it the first preset. | `tests/unit/ori-model.test.ts` (two different durations); live designer kept "20 minutes" (`docs/velocity/evidence/live-smoke-2026-11-14.txt`) |
| P1-02 Revisions update dependent copy | **Implemented for new changes** | A change to a practice default rewrites the duration claims in the tagline, empty-state hint and description; previews are in the future tense with before/after lines ("Default session: 10 min → 5 min"); history records the applied change, not the preview wording. The audit's existing sketch app keeps its recorded history (never rewritten). | `tests/unit/ori-model.test.ts`, `tests/unit/revision.test.ts`; reproduced on the real sketch app before the fix |
| P1-03 Carry inspiration into the made app | **Implemented** | Make mine saves the shared photo as the first Light entry (or the shared link as a Riff source), once. | `tests/e2e/light.spec.ts` asserts the carried entry; Ready says "Your photo is the first entry" |
| P1-04 Example-profile provenance | **Implemented** | "From the example profile" / "Example · confirmed" on cards, Why this?, the Make page and Memory; never "From your memory" for example facts. | agent/playground tests; screenshots |
| P1-05 AI editing where people use the app | **Implemented as "Edit with Ori"** | A pill in every app's header, the "…" menu and My apps' tile action; outcome example chips; review with an affected-screen preview, Apply change / Keep current version, Undo. | `tests/e2e/light.spec.ts`, `revisionReview.test.ts`; `flow-edit-*` screenshots |
| P1-06 My apps as the personal launcher | **Implemented** | "Your little world": Continue in <app>, icon tiles, Open / Edit with Ori / Add to home screen, Make something new → the Agent composer; pin/archive in a secondary menu. | `tests/e2e/launcher.spec.ts`; `apps-*` screenshots |
| P1-07 Shorter agent replies | **Implemented** | At most two short sentences before the cards; read status kept compact ("Sample mode cannot read images, so I'm using your words."). | `sample-respond` tests; live check: 2 sentences (`docs/ori/evidence/live-smoke-2026-11-15.txt`) |
| P1-08 Promises tied to capabilities | **Implemented** | No daily/weekly/"writes itself" claim without a rule; Light's "This week's prompt" is a real weekly rotation; focus words become that week's prompt. | live check: no such promise in the reply or the design |
| P1-09 Elapsed vs manually logged time | **Implemented** | Typed-in logs say "Minutes practiced" and are labelled typed in; timed sessions show what the clock measured; the plan is never saved as time played; task verbs from each app (Save sketch, Add photo, Add person). | `practiceTimer.test.ts`, Velocity runtime tests |
| P2-01 One refresh control | **Implemented** | One small "Update app ideas"; current cards stay readable while it runs and their actions wait instead of breaking. | playground tests; screenshots |
| P2-02 Accessibility | **Partial** | Named icon controls; one h1 per page (an embedded preview's name is an h2); dialogs trap focus, close on Escape and return focus; 44 px targets on the Ori screens; a solid 3 px focus ring; AA-checked text pairs; reduced motion respected. | browser tap-target and overflow checks; theme contrast tests. **Not done:** a screen-reader pass and text-enlargement review |
| P2-03 Pricing | **Implemented** | "Early access pricing": 14 days free, $7.50/month for two months, then $15/month; no payment is collected; allowance in plain words; viewing and export stay. No billing was built. | `pricing-*` screenshots |
| Navigation labels (Your AI / App Store / My Apps) | **Superseded** | The Ori spec keeps Agent / Playground / My apps (same routes). | — |
| Section 9 three-minute demo | **Superseded by the Ori demo** | `docs/DEMO.md`: inspiration → personal app → home-screen entry → safe revision, with the real recordings. | — |

## Acceptance checklist (audit section 8)

| Item | Status |
| --- | --- |
| The first viewport explains the product and that AI makes the apps | Implemented (Ori wording; observer test not run) |
| A first-time user can start from one idea without importing a profile | Implemented (Agent first use, starters, example) |
| Guest examples are usable and fictional; guest and signed-in flows checked | Implemented; landing "Try an example" signs up and arrives with the labelled example (browser test) |
| Sketching, music, People, photography and newsletter previews match their domains | Implemented (tests) |
| An explicit session duration survives prompt → customization → preview → creation → reload | Implemented (tests; the guitar journey checks 15 and 25) |
| The made app matches the approved preview; example records are not saved | Implemented (tests) |
| No duplicate apps from repeated clicks or retries | Implemented (idempotent build; browser test checks exactly one app) |
| A promised source appears once in the right place | Implemented (carry-over, deduplicated) |
| Read limits and example provenance stay accurate | Implemented |
| A real action and saved record survive reload | Implemented (Light, People, Riff browser tests) |
| AI editing previews, applies only after acceptance, keeps records, updates dependent text | Implemented |
| Undo restores behaviour and keeps entries | Implemented (data-safe undo) |
| Music, photography and People keep different layouts and interactions | Implemented |
| The library offers open, create, AI editing and installation without a settings hunt | Implemented |
| 320/390/768/1440 without clipped or trapped content | Implemented (browser suite, screenshots) |
| Keyboard, focus, names, targets, contrast, text enlargement | Partial (no screen-reader or enlargement pass) |
| Loading and failure states keep input and offer a next action | Implemented (composer keeps input; Make keeps choices; Edit keeps the request) |
| Local-only install links detected; no cross-device auth promise | Implemented |
| Physical-device install and direct launch | **Blocked: no device.** On the emulator the shell's shortcut intent (sent with adb) opens Light directly, cold and warm; tapping a pinned icon was verified only warm, with the earlier bundle; a cold tap was intercepted by Play Protect on the account-less emulator image when it was last tried (`docs/ANDROID.md`) |
| Daily/weekly/automatic claims tested or scoped | Implemented |
| Pricing and no-payment status accurate | Implemented |
| Authorization, migration, media access, persistence and revision tests pass | Implemented (831 unit/API tests, browser suite) |
