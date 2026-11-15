// Published settings for the Ori pitch at /pitch/. Paths are relative so the deck works on any static host.
window.ORI_PITCH = {
  presenter: 'Zuyu Liu',
  // The source repository (linked from the appendix and Setup, never from a slide).
  githubUrl: 'https://github.com/geeeethubb/Ori',
  // The live product (the closing slide's QR code encodes this address; it is never shown as text).
  productUrl: 'https://ori-fjrx.onrender.com/',

  // Media slots: every video or screenshot position in the deck, by key. A slide places a slot with
  // kit.media('<key>'); docs/ori-pitch-kit/PITCH_INTEGRATION.md ("Media slots") has the founder's table.
  //   sources     the recording, in order of preference: H.264 MP4 first (Safari, iPhones), then WebM.
  //               Empty = no recording yet: the slot shows its still.
  //   poster      the recording's first frame with the app on screen, shown before it plays.
  //   still       a real product screenshot, shown when there is no recording or none can play.
  //   label       the compact truth shown under the recording; stillLabel the same for the screenshot.
  //               Keep "Sample mode" whenever the screen shows Sample-mode content.
  //   aspect      width / height of the frame; a new recording for the slot should use the same shape.
  //   cues        optional cue points in seconds (cue i starts step i + 1 of the slide's visual guide).
  //               Leave empty until the final footage exists: never guess timestamps.
  // A missing or broken file never breaks a slide: a failed recording falls back to the still, a failed
  // still to a neutral frame with the label. Nothing downloads until its scene (or the next one) is shown.
  media: {
    create: {
      slide: 5,
      title: 'A · Thought to Light',
      sources: ['media/01-create.mp4', 'media/01-create.webm'],
      poster: 'media/01-create-poster.jpg',
      still: 'media/stills/light-open-first-photo.webp',
      alt: 'Product screenshot: Light opened on its own page, with the shared photo as its first entry and the prompt “Focus on golden-hour shadows”.',
      label: 'Recorded product demo · Sample mode',
      stillLabel: 'Product screenshot · Sample mode',
      aspect: '390 / 844',
      cues: [],
      describe: 'A photo and a thought, Ori suggests a place for it, a preview with one detail shaped, then Light opens with the photo in it.',
    },
    grow: {
      slide: 6,
      title: 'B · Light grows with me',
      sources: ['media/02-use-and-revise.mp4', 'media/02-use-and-revise.webm'],
      poster: 'media/02-use-and-revise-poster.jpg',
      still: 'media/stills/light-entry-after.webp',
      alt: 'Product screenshot: the same Light entry after the change, with the photo, the note “Low sun turns the brick wall gold” and the new camera fields.',
      label: 'Recorded product demo · Sample mode',
      stillLabel: 'Product screenshot · Sample mode',
      aspect: '390 / 844',
      cues: [],
      describe: 'Save an observation, ask for camera settings, review the change on the same photo, apply it: the same photo and note, now with camera fields.',
    },
    return: {
      slide: 'appendix (4. The demo; moved from #6)',
      title: 'E · Back to Light',
      sources: ['media/03-reopen.mp4', 'media/03-reopen.webm'],
      poster: 'media/03-reopen-poster.jpg',
      still: 'media/stills/light-gallery-observation.webp',
      alt: 'Product screenshot: Light’s contact sheet with the person’s photo and its saved observation.',
      label: 'Recorded product demo · Sample mode',
      stillLabel: 'Product screenshot · Sample mode',
      aspect: '390 / 844',
      cues: [],
      describe: 'A fresh browser session opens Light by its own link and finds the same photo, note and camera setting.',
    },
    // The founder's own recording (slide 8 of the brief, presented #7): filmed on a phone against the live site,
    // so it shows live AI (the product's "Live AI" badge). The waiting may be trimmed: never claim real-time speed.
    // Cue points measured in the footage: 0 s bring your context (copy the prompt, paste the profile, Add it),
    // 9.0 s Ori connects the dots (Ori reads it; "Added 25 things we learned" from 12.6 s), 15.9 s explore what
    // fits you (the Playground's suggestions). At the end the clip holds its last frame (no loop).
    context: {
      slide: 7,
      title: 'C · Bring your context → Playground',
      sources: ['media/ori-context-demo.mp4', 'media/ori-context-demo.webm'],
      poster: 'media/ori-context-demo-poster.jpg',
      still: 'media/stills/playground-phone-ideas.webp',
      alt: 'Product screenshot: the Playground with three different directions, Riff, Light and Course Assignments, each labeled Example.',
      label: 'Recording · Live AI',
      stillLabel: 'Product screenshot · Sample mode',
      aspect: '464 / 832',
      cues: [0, 9.0, 15.9],
      describe: 'The founder’s recording on the live site: copy Ori’s prompt, paste the context profile an AI wrote and add it; Ori reads it and organizes what it learned; then the Playground suggests directions that fit.',
    },
    // Retired from the slides by the founder's update: the context recording above now ends in the Playground.
    // Kept (not placed on any slide) so a separate Playground recording can return without a layout change.
    playground: {
      slide: 'none (retired from #7)',
      title: 'D · Playground',
      sources: [],
      poster: '',
      still: 'media/stills/playground-phone-ideas.webp',
      alt: 'Product screenshot: the Playground with three different directions, Riff, Light and Course Assignments, each labeled Example.',
      label: 'Recorded product demo',
      stillLabel: 'Product screenshot · Sample mode',
      aspect: '390 / 844',
      cues: [],
      describe: 'The Playground: a few distinct directions, then choosing one.',
    },
  },
};
