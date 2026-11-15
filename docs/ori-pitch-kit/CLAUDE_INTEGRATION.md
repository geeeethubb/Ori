# Integrate the Ori pitch into the existing Ori repository

Use the attached `ori-pitch-kit.zip` as the implementation. Do not start a new pitch design or rebuild the Ori product.

Inspect the current repository, its AGENTS.md instructions, framework, route handling, deployment configuration, and established brand assets. Create a focused branch. Add this presentation as an independent `/pitch/` page, with a `/pitch` redirect if necessary so all relative assets work. Use the existing public/static directory where appropriate. Retain the deck's full-screen scenes, keyboard and button navigation, overview, three video slots, reduced-motion support, speaker notes, and timer. Do not place it inside the app's normal navigation shell.

The archive's `pitch/` directory contains deployable static assets. `config.js` supplies product URL, repository URL, and three clip paths. Configure those using the actual deployment and repository; do not invent URLs. Put real product recordings into `pitch/media/` and set relative paths. If videos are not supplied, retain the visible concept-reference labels and record that they are still needed. Never present generated target designs as product screenshots or pretend a recording is a live demo.

If the repository has canonical Ori mascot/font assets, prefer them without altering the presentation layout. Preserve the cobalt/lime/lilac identity and the current pricing ladder: 14-day full trial, $7.50/month for the next two months, then $15/month. The initial 50-user pilot and all business claims must remain proposals unless new evidence supports them. The architecture and Velocity copy must be checked against current implementation before stronger claims are made.

Keep this change scoped to the presentation. Preserve application routes, records, identifiers, schemas, authentication, configuration, billing, API keys, and normal app behavior. Do not duplicate or expose private data. Decide the audience based on the user's instructions; the judging link must be accessible to judges, but do not change the entire application's access rules to achieve that.

Verify desktop and phone layout; arrow/button navigation; overview; F for full-screen; N for notes; timer start/pause/reset; video playback and pause on slide change; error fallback; and direct loading of `/pitch/` and a slide hash such as `/pitch/#4`. Test that the three clips show one coherent working journey and that actual home-screen reopening works on the demo device. Use the existing project checks and report any limitations. A GitHub source URL alone is not a deployed pitch URL.

Return the changed file paths, tested behavior, missing recordings or evidence, and the deployed pitch URL if the user's existing authorization permits deployment. Otherwise prepare the branch/PR for review without changing the live product.
