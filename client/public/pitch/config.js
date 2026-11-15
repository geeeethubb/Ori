// Published settings for the Ori pitch at /pitch/. Paths are relative so the deck works on any host.
window.ORI_PITCH = {
  presenter: 'Zuyu Liu',
  // The Ori site that serves this pitch (same origin). The standalone static export
  // (scripts/export-pitch.mjs) sets this to '' because the hosted product is not deployed with it;
  // the deck then shows no "Open Ori" link and Setup offers no product address.
  appUrl: '/',
  // The source repository.
  githubUrl: 'https://github.com/geeeethubb/Ori',
  // Real recordings of one Light app and one saved photo, made in Sample mode (scripted responses, not
  // live AI). Each clip lists its files in order of preference: H.264 MP4 first (Safari and iPhones),
  // then WebM. A single path also works. When none can play, the slot shows its concept reference image.
  clips: {
    create: ['media/01-create.mp4', 'media/01-create.webm'],
    revise: ['media/02-use-and-revise.mp4', 'media/02-use-and-revise.webm'],
    reopen: ['media/03-reopen.mp4', 'media/03-reopen.webm']
  },
  // Each recording's first frame with the app on screen, shown before it plays (iPhones show no frame
  // until playback starts).
  posters: {
    create: 'media/01-create-poster.jpg',
    revise: 'media/02-use-and-revise-poster.jpg',
    reopen: 'media/03-reopen-poster.jpg'
  }
};
