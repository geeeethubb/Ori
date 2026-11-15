# Ori pitch kit: narrative and integration audit

Reviewed November 15, 2026. Inputs: uploaded `ori-pitch-kit.zip`, its HTML/CSS/JavaScript and documentation, and selected rendered scenes at [the reference pitch](https://ori-pitch-zuyu.zuyu-liu.chatgpt.site/). This was a read-only audit. The archive and live site were not changed.

## Recommendation

Keep the kit as the visual and interaction foundation. Replace and expand the old narrative using `ORI_PITCH_STORYTELLING.md`. Integrate it into the existing Ori site with `ORI_PITCH_CLAUDE_PROMPT.md` and the kit's `CLAUDE_INTEGRATION.md`.

The kit already provides a useful slide-based presentation rather than a long marketing page. Its current 11 scenes and four-minute timer can support the stronger story after the scene data and notes are updated together.

## What to preserve

- Ori's cobalt/lime/lilac identity and existing SVG companion.
- Full-screen scenes, navigation, overview, notes, timer, fullscreen, and reduced-motion handling.
- Three separate media roles: create, use/revise, and reopen.
- One coherent Light journey and explicit concept-reference labels.
- Integration into `/pitch/` within the existing application, with relative assets and a focused presentation scope.

## What needs to change

| Finding | Why it matters | Handoff action |
|---|---|---|
| The opening uses a general inspiration-gap hypothesis. | It does not yet carry the newer external research and 21/26 discovery. | Add a research scene and a local-discovery scene, with distinct populations and visible source labels. |
| The product story uses three experience areas. | Companion → Playground → Apps does not explain the user's five-stage insight. | Give all five human stages their own narrative scene, then connect them to the product areas. |
| Velocity has a useful but short 15-second scene. | It understates four actual research rounds and the commercial/design contribution. | Preserve it as required Section 8, with 30 seconds and concrete research-to-decision examples. |
| Founder distribution needs more specificity. | A generic first-50 plan misses the advantage of Founders, IBC, T&M, and friend introductions. | Use the named channels, realistic proposed allocations, and behavior-based definitions. |
| A mascot exists, but the requested persistent mood progression is not established in the current story. | The character can connect the emotional journey across scenes. | Reuse the identity and introduce the consistent corner companion with per-scene expressions. |
| Notes are indexed positionally against 11 scenes. | Adding scenes without updating notes can produce wrong notes or errors. | Update all counts, notes, labels, overview, hash behavior, and timing together for 14 scenes. |
| The README references `dist/`; the archive actually contains `pitch/`. | A literal integration can copy the wrong directory. | Use `pitch/` as stated in the more accurate integration brief; correct stale instructions in the integrated documentation. |
| App/repository URLs and three clip paths are empty in `config.js`. | The kit alone does not provide working demo recordings or destinations. | Populate only verified URLs and supplied media; keep clear unavailable states otherwise. |
| The local media picker creates temporary browser object URLs. | Selecting a video locally does not make it available to judges later. | Configure persistent deployed media paths for real recordings. |

## Important evidence boundaries

The three PNG assets are concept references, not verified screenshots or device recordings. The archive has no playable clips for the proposed same-app, same-record proof. Do not claim that creation, record-safe revision, or physical home-screen reopening passed based on the kit.

The supplied `VALIDATION.md` describes checks performed in the other session. This audit reviewed source and selected live content; it did not independently repeat the complete interaction matrix, all mobile layouts, or device-install tests. Claude should run those checks after integration.

The Velocity handoff provides actual research artifacts and reviewed design decisions. It explicitly distinguishes proposed acceptance cases from executed tests. Preserve that distinction while giving the contribution appropriate prominence.

## Ready-to-build narrative

The companion files provide:

- A 14-scene, 240-second main story with speaker copy and a separate expanded narrative.
- External research plus local discovery, without merging their statistics.
- The five-stage framework and a single evolving-app demo storyboard.
- Specific UIUC distribution, proposed pilot metrics, pricing, and a bounded $10,000 ask.
- An explicit main-pitch Section 8 on Velocity AI.
- Implementation instructions for preserving the kit while integrating the new story.

No additional generic ideation round is needed before building this pitch page. The highest-value missing evidence is actual product footage and observed user behavior.
