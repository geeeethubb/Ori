# Personal AI Playground: redesign handoff

Version 1.0 | November 14, 2026 | Prepared for Zuyu Liu

## The decision

Electric Playground is the primary visual direction. Studio Pop supplies the expressive typography, artwork, and distinct identities inside individual apps. The final product name is undecided. Do not adopt any suggested name as final.

**One-liner:** A personal AI that turns your interests and everyday needs into a playground of apps made just for you.

**Guiding star:** Agent + Playground + Apps make the phone unmistakably yours.

**Emotional promise:** Your interests have somewhere to go.

This package specifies a revision to the existing prototype. It is based on the screenshots and the previous builder's handoff, not a fresh source-code audit. The builder must inspect the repository and verify its actual state before changing it.

## Files and reading order

1. `Redesign_Brief.pdf`: the complete review brief for the founder and team.
2. `PRODUCT_SPEC.md`: product behavior, boundaries, user journeys, and demo story.
3. `DESIGN_SPEC.md`: visual rules, exact tokens, screen changes, and three app identities.
4. `BUILD_PLAN.md`: implementation order, data contracts, acceptance checks, and Velocity work.
5. `CLAUDE_REDESIGN_PROMPT.md`: execution instructions for Claude Code.

Keep this directory at `redesign/` in the repository. Existing repository instructions still apply. This package supersedes the earlier product/design brief where they conflict; preserve existing functional behavior unless a change is explicitly specified here.

## Do this next

1. Save or commit the current working prototype. Keep any existing `.env`; do not copy `.env.example` over it. Never add secrets to a commit.
2. Extract this package into the repo so these files live under `redesign/`.
3. Open Claude Code in the existing repository and paste the kickoff message below. No permission-mode change is required by this package.
4. While it works, supply three pieces of inspiration you actually care about: one photography example, one guitar/music example, and one recurring work need. Share links plus a sentence describing what matters; add a screenshot or excerpt if the link cannot be read.
5. Run the Velocity prompts in `BUILD_PLAN.md` and give the actual outputs to the builder. Preserve the prompts and outputs as evidence of the hackathon contribution.
6. Review the first complete slice on your phone before polishing the entire site. Use the three questions below to steer the next iteration.

## Kickoff message

```text
Read redesign/CLAUDE_REDESIGN_PROMPT.md completely, then read every required file it names. Execute the redesign in this existing repository. Start by verifying the current code and preserving its working behavior, then implement Phase 1 through Phase 5 in order. Electric Playground is the main design; Studio Pop informs the individual apps. The product name remains undecided. Make routine implementation decisions yourself, keep BUILD_STATUS.md current, and continue through implementation and verification rather than stopping after a plan. First deliver one working, visually polished inspiration-to-app journey. Report any genuinely blocked external access and continue independent work.
```

This is an execution prompt, not a guarantee of uninterrupted runtime. Tool permissions, model quotas, machine sleep, and session limits still apply. Progress must be resumable from `BUILD_STATUS.md`.

## Review the first slice

- Does this look and feel like something I would keep on my phone?
- Does the recommendation use something specific I shared, and help me do something worthwhile?
- Are the photography and music experiences different in their layout and actions, not only their colors?

If these fail, fix them before expanding features. The final name can wait.

## Founder-owned tasks

| Task | What to provide or decide |
| --- | --- |
| Personal inspiration | Three actual examples and what you want from each. Avoid confidential employer/client information. |
| Velocity | Workspace access or actual exported outputs. The builder cannot manufacture evidence of usage. |
| Phone verification | A physical iPhone Add to Home Screen check; an Android check if available. |
| Feedback | Observe five target users complete the first journey; record where they hesitate and whether they return. |
| Name | Choose after reviewing the redesigned product; then check name/domain availability. |
| Demo | Choose one real, repeatable story with a saved inspiration, a working app, and a home-screen launch. |

Do not block the redesign on a new logo, final name, social integrations, billing, or a complete pitch deck.
