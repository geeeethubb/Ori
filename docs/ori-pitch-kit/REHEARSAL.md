# Ori pitch: timing estimate (15 presented scenes, 3:58)

**This is an automated timing estimate, not a spoken run.** The numbers below come from counting the words in
each scene's spoken track in `client/public/pitch/scenes.js`; nobody spoke and no timer was read. Before the
event, do one full run out loud with the timer in the notes panel (N) and adjust what you say, not the budgets.

## How it is counted

- **Budgets:** the revision brief's allocation (`ORI_PITCH_REVISION_BRIEF.md`, section 5) with two founder
  decisions. The brief's slide 2 (the research evidence, “Wanting is only the beginning.”) is not presented: it
  is “Research behind this” in the appendix, and its 12 s were **not** redistributed, so the talk is shorter. The
  brief's slide 8 (presented #7) runs **25 s** instead of 15 s for the founder's 23.65-second recording. Total:
  **238 s (3:58)** for scenes 1–15. The two minutes of Q&A are separate and happen on scene 15.
- **Numbering:** presented #1 is the brief's slide 1; from the brief's slide 3 on, presented number = brief
  number − 1.
- **Speech estimate:** spoken-track words ÷ 2.5 (150 words a minute), the same rule the notes panel shows for
  each scene and `window.ORI_PITCH_TIMING` exposes. A hyphenated compound counts once (“AI-native”,
  “twenty-one”); numbers in digits count as said aloud (150 = “one hundred fifty”, three words;
  2027 = “twenty twenty-seven”, two). Acronyms said letter by letter (UIUC, IBC, YC) count as one word each,
  so scenes with them take longer to say than the estimate.
- **Checked:** `pitch.js` warns in the console if any track exceeds its budget or the budgets do not total 238 s,
  and `scripts/check-pitch.mjs` (default `--scenes 15`, `--seconds 238`) fails then; both pass with these
  tracks. The figures below were read from `window.ORI_PITCH_TIMING` in the running deck.

## Result

| # | Brief | Scene | Budget | Planned end | Spoken words | Est. speech | Spare |
|---:|---:|---|---:|---:|---:|---:|---:|
| 1 | 1 | Promise | 7 s | 0:07 | 17 | 6.8 s | 0.2 s |
| — | 2 | Evidence and takeaway: appendix only (“Research behind this”) | — | — | — | — | — |
| 2 | 3 | Discovery and a friend’s insight | 19 s | 0:26 | 44 | 17.6 s | 1.4 s |
| 3 | 4 | Five stages, one Ori | 17 s | 0:43 | 40 | 16.0 s | 1.0 s |
| 4 | 5 | Feeling to app | 14 s | 0:57 | 33 | 13.2 s | 0.8 s |
| 5 | 6 | Create Light | 26 s | 1:23 | 55 | 22.0 s | 4.0 s |
| 6 | 7 | Light grows with you | 26 s | 1:49 | 33 | 13.2 s | 12.8 s |
| 7 | 8 | Context and Playground (the founder's recording) | 25 s | 2:14 | 53 | 21.2 s | 3.8 s |
| 8 | 9 | Interests and workflows | 13 s | 2:27 | 31 | 12.4 s | 0.6 s |
| 9 | 10 | Competitor map | 16 s | 2:43 | 37 | 14.8 s | 1.2 s |
| 10 | 11 | Founder and pilot | 19 s | 3:02 | 43 | 17.2 s | 1.8 s |
| 11 | 12 | Growth goal | 12 s | 3:14 | 27 | 10.8 s | 1.2 s |
| 12 | 13 | Pricing | 10 s | 3:24 | 24 | 9.6 s | 0.4 s |
| 13 | 14 | Velocity AI | 15 s | 3:39 | 33 | 13.2 s | 1.8 s |
| 14 | 15 | The ask | 12 s | 3:51 | 29 | 11.6 s | 0.4 s |
| 15 | 16 | Signature and Q&A | 7 s | 3:58 | 17 | 6.8 s | 0.2 s |
| | | **Total** | **238 s** | **3:58** | **516** | **206.4 s** | **31.6 s** |

- **Every track fits its budget.** Estimated speech totals 206.4 s, leaving about 32 s across 15 scenes for
  transitions, the five-stage build on scene 3 and pauses.
- **The opening hands straight to the discovery question:** scene 1's track ends on the promise, and scene 2
  opens with “We asked twenty-six UIUC students…”. Nothing spoken refers to the removed research slide; if a
  judge asks for research, the discovery notes link “Research behind this” (A, then the panel at the top of
  Sources), with its scope: physical activity only, and neither study measures Ori.
- **Scene 7 follows the founder's clip** (23.65 s; cue points 0 s Bring your context, 9.0 s Ori connects the
  dots, results from about 12.6 s, 15.9 s Explore what fits you). Press → (or the clicker) to start the clip as the scene opens and start each
  sentence as its step lights up: about 22 words (≈ 8.8 s) for the first step, 17 (≈ 6.8 s) for the second,
  14 (≈ 5.6 s) for the third, so the narration never runs ahead of the footage. Do not claim real-time speed:
  the waiting may have been trimmed. The clip ends on its last frame with the suggestions on screen; the next → moves on.
- **Scene 5: say the disclaimer and the thought first,** then press → (or the clicker) to start the clip on “I share a photo”: the 12.8 s clip
  runs under the last four sentences (share 0–2 s, Ori's suggestion 2–5 s, preview and focus 5–8 s, Make mine to
  Light 8–12.8 s), so the footage never runs ahead of the words. It holds Light's last frame; the next → moves on.
- **Scene 6: press → (or the clicker) to start the clip with the first word.** “review” lands on the review sheet, “apply it” on the Updated
  toast and “Same photo” as the entry opens; the 12.8 s clip then holds its last frame and the next → moves on.
  The 5.2 s return clip now plays in the appendix (A → 4. The demo) for Q&A, so scene 6 has 12.8 s spare: let
  the Before/After pair sit rather than adding words.
- **When the founder's replacement clips arrive** (20–25 s each, per the shot list), start each with the first
  word and re-time the sentences to its steps; a 20–25 s clip started late would overrun the 26 s budget.
- **Tightest scenes:** 1 promise and 15 signature (0.2 s each), 12 pricing and 14 ask (0.4 s each), 8 interests
  and workflows (0.6 s). Scenes 10 and 11 were trimmed (to 43 and 27 words) because their acronyms and long
  numbers take longer to say than the count suggests: a synthesized-speech check before the trim put 10 at about
  21 s of 19 and 11 at about 13 s of 12. Check 10 and 11 first in the spoken run; scene 15 can run over because
  Q&A follows on the same slide.
- The Velocity AI scene (13) keeps its full 15 seconds on screen and in speech.
- **Clicker and keys:** start full screen with F or the Present button; →, PageDown or Space move on. On scenes 5, 6
  and 7 the first → or PageDown (what a clicker sends) starts the clip, like a build step, and the next one moves on
  whether or not the clip is still playing; Space plays or pauses a clip, then moves on once it has ended. Previous,
  links and the overview never start a clip. After clicking any control with the mouse, the keys go back to
  the slides, so Space never re-presses that control.
- **Q&A with an expanded clip in full screen:** close it by clicking outside it, with its collapse button or with
  ×. The browser keeps Esc for leaving full screen; that also closes the clip, then press F to return. The return
  clip (Light opening by its own link) plays in the appendix: A → 4. The demo.

## What this does not show

- How long the words take when Zuyu says them. 150 words a minute is a planning rate; nerves speed people up and
  pauses slow them down. Only a spoken run with the timer can confirm 3:58.
- Clip timing on the day: a recording plays only when started (→, the clicker, Space or its play button).
- Live conditions: the room's display, the clicker, a slow network, or an official time limit other than four
  minutes. If the event's limit differs, use that limit.
