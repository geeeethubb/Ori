# Ori browser pitch

A standalone, dependency-free presentation. The site is the pitch, not the Ori application. It uses the current Ori design specification and existing pitch draft, with clearly labeled concept references until real recordings are provided.

## Open and present

Serve `dist/` as a static directory, or open `dist/index.html` locally. No install, build, API key, or backend is required. Use arrow keys or bottom arrows, O for overview, N for rehearsal notes, F for full screen, and Space for the current clip. Home and End jump to first and last slides. Escape closes an expanded media view. Videos pause when leaving a scene.

Notes appear ON THE SAME SCREEN. They are for rehearsal; do not open them on a projected screen unless you intend judges to see them. The timer starts only when clicked, continues while notes are closed, and can be paused or reset.

## Finalize the actual demo

Record three short clips of the SAME Light app and the SAME saved record:

1. `media/01-create.mp4`: share the photography interest, preview, personalize, create (about 30 seconds).
2. `media/02-use-and-revise.mp4`: save a real photo and note, make a revision, show the original record still present (about 30 seconds).
3. `media/03-reopen.mp4`: record a real phone leaving Ori, tapping Light on the home screen, and reopening the same saved record (about 20 seconds).

Use H.264 MP4 for compatibility. The deck is muted by default because the presenter narrates live. Native playback controls remain available; clips never autoplay or advance the slide. Record only real behavior. If installation or persistence does not work, revise the claim rather than simulate it. Existing PNGs are AI-generated target designs, not screenshots of a working implementation.

Setup accepts local videos for rehearsal. Those object URLs last for the current tab only; they are not uploaded or shared. For permanent recordings, create `dist/media/`, copy the MP4s, and set the paths in `dist/config.js`. The data defaults must ship in config.js for every visitor. Links saved through Setup persist only in that browser; export them by editing config.js before deployment.

## Published configuration

```js
window.ORI_PITCH = {
  presenter: 'Zuyu Liu',
  appUrl: 'https://YOUR-EXISTING-ORI-APP',
  githubUrl: 'https://github.com/YOUR-OWNER/YOUR-ORI-REPO',
  clips: {
    create: 'media/01-create.mp4',
    revise: 'media/02-use-and-revise.mp4',
    reopen: 'media/03-reopen.mp4'
  }
};
```

The shipped configuration intentionally has no invented product or repository URLs. Buttons only appear when real URLs are set.

## Put it on Ori's existing host

Copy the CONTENTS of `dist/` into a directory served at `/pitch/`. On Next.js or Vite this will often be `public/pitch/`, but inspect the actual framework and deployment before choosing. Ensure `/pitch` redirects to `/pitch/`, or redirect to `/pitch/index.html`, so relative asset paths resolve correctly. Do not create a conflicting app route. If the router intercepts static directories, add an explicit route or hosting rule. Keep the pitch outside product authentication only if the user wants a public judge-facing page; never expose private application APIs or user data.

This package can also be hosted as a static GitHub Pages site. Uploading it to a GitHub repository alone does not create a working website. Do not enable Pages or change repository visibility without the user's authorization.

For local opening, keep all files and `assets/` together. No remote resources are needed for the deck itself. Product links require a connection. You can print a still-image backup using the browser's Print → Save as PDF, with background graphics enabled; it does not contain playable video.

## Story and timing

| Scene | Seconds | Cumulative |
| --- | ---: | --- |
| Your phone, your story | 15 | 0:00–0:15 |
| The inspiration gap | 25 | 0:15–0:40 |
| The Ori experience | 25 | 0:40–1:05 |
| Demo: make Light yours | 30 | 1:05–1:35 |
| Demo: use, then revise | 30 | 1:35–2:05 |
| Demo: one tap back | 20 | 2:05–2:25 |
| First fifty users | 25 | 2:25–2:50 |
| Business hypothesis | 25 | 2:50–3:15 |
| Technical feasibility | 20 | 3:15–3:35 |
| Velocity's contribution | 15 | 3:35–3:50 |
| Closing | 10 | 3:50–4:00 |

Speaker text is editable in `pitch.js`; slide content is in `index.html`. The total allocated time is 240 seconds. Rehearse and shorten narration if the actual clips require it.

## Evidence and outstanding inputs

- Ori branding and illustration: ORI_DESIGN_SPEC.md, version 2.0, November 14, 2026.
- Story, pricing ladder, founder access, eight-week pilot: Ori_Pitch_Deck_v1.pdf.
- Contribution and claim boundaries: Ori_Final_Velocity_Review.md.
- Images are the user's previously generated target designs; they are labeled accordingly.
- No actual current source-code audit, app recordings, device test, traction, market-size estimate, or billing proof was supplied to this presentation build.
- The proposed 50-user cohort is a target. The $7.50/$15 pricing ladder is an experiment. Recruitment access does not imply institutional partnership.

Before Devpost, supply the working product and repository URLs, add real clips, verify the claims against the current product, and test the FINAL judge-facing URL in a signed-out browser. The preview created in ChatGPT starts private; it is not automatically a publicly accessible submission URL.
