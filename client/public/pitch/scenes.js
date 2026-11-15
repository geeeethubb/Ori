// The Ori pitch: one scene data source for the slides, overview, progress, labels, hashes, notes and timing.
// Authority: docs/ori-pitch-kit/ORI_PITCH_REVISION_BRIEF.md (the 16-slide revision: order, copy, budgets), with
// two founder decisions: the brief's slide 2 (research evidence) lives in the appendix, not in the talk, and
// slide 8 runs 25 s for the founder's recording. 15 presented scenes (the brief's slide N is scene N - 1 from
// its slide 3 on), 238 seconds (3:58) of presenting; Q&A (two minutes) is separate and happens on scene 15.
//
// Each scene:
//   id         stable identifier: the slide's element id (scene-<id>) and a hash alias (#<id> opens it)
//   aliases    older ids that still open the scene (links to the 15-scene deck keep working)
//   label      a short name for the overview, the controls and the notes (not shown on the slide)
//   headline   the slide's main line (also the overview title and the slide's accessible name)
//   accent     optional: the part of the headline drawn in the accent colour (styling only)
//   seconds    the rehearsal budget; the main path totals 238 (3:58)
//   theme      'ink' for a dark scene (ink background, white type, lime emphasis); default is light
//   companion  { expression, corner, size } or null for no companion. expression is one of the four
//              expressions of the identity board (Listening, Thinking, Found something, Ready), drawn by
//              assets/ori/companion-<art>.svg. corner: true shows the corner companion; false means the
//              slide draws Ori inside its own composition (kit.ori). Expressions are story cues; they never
//              imply that Ori senses emotions.
//   layout     the renderer: window.ORI_SLIDES[layout] (slides/*.js) or pitch.js's built-in one
//   group      the file that owns the layout (core = pitch.js; gN-name = slides/gN-name.js and .css)
//   onScreen   the slide's copy and data (concise; qualifications live in the cue and the appendix)
//   spoken     the spoken track (speaker notes). It must fit the budget at about 150 words a minute
//              (2.5 words a second); pitch.js warns in the console when one does not.
//   cue        the stage cue (speaker notes): what to show, what to say carefully, what not to claim
//   appendix   related appendix sections, linked from the notes
window.ORI_SCENES = [
  {
    id: 'promise',
    label: 'Promise',
    headline: 'Your phone, your story.',
    seconds: 7,
    companion: { expression: 'Ready', corner: true, size: 'large' },
    layout: 'promise',
    group: 'core',
    onScreen: {
      lead: 'An AI-native phone experience. Apps that grow with you.',
      support: 'Starting on the phone you already own.',
      collection: [
        { app: 'light', name: 'Light', note: 'photography' },
        { app: 'riff', name: 'Riff', note: 'music' },
        { app: 'people', name: 'People', note: 'people' }
      ],
      spark: 'one unfinished spark…',
      chips: ['a new interest', 'a little more you'],
      caption: 'Your sparks, somewhere to grow',
      illustration: 'Illustration'
    },
    spoken: 'Ori is an AI-native phone experience: apps that grow with you, on the phone you already own.',
    cue: 'Answer first. Ori beside a personal collection: photography, music, people and one unfinished spark. The phone is an illustration of the vision, not a product screenshot. “AI-native phone” means a software experience on the phone people already own, not new hardware or an operating-system replacement.',
    appendix: ['companion']
  },
  // The brief's slide 2 (the research evidence, "Wanting is only the beginning.") is not presented: the founder
  // moved it to the appendix ("Research behind this", #appendix-research, at the top of the sources section),
  // linked from the discovery scene's notes. Its old hashes (#evidence, #research) open that panel.
  {
    id: 'discovery',
    label: 'Discovery and a friend’s insight',
    headline: 'Do you struggle to turn your ideas into something consistent?',
    seconds: 19,
    companion: { expression: 'Listening', corner: true },
    layout: 'discovery',
    group: 'g1-evidence',
    onScreen: {
      question: 'Do you struggle to turn your ideas into something consistent?',
      yes: 21,
      total: 26,
      countLabel: 'students said yes.',
      insight: 'Sometimes the hard part is pinpointing what the idea even is.',
      insightLabel: 'A friend’s insight · paraphrased',
      examples: [
        { kind: 'reel', label: 'A saved reel' },
        { kind: 'note', text: 'Why do I never…' }
      ],
      footnote: 'Informal conversations with 26 UIUC students.'
    },
    spoken: 'We asked twenty-six UIUC students if they struggle to turn ideas into something consistent. Twenty-one said yes. Then a friend told us sometimes the hard part is pinpointing what the idea even is. A saved reel. A note that starts, “Why do I never…”',
    cue: 'Straight from the promise to the question. The count first, then let the friend’s insight carry the moment. 21/26 is founder-reported, informal discovery with a convenience sample of UIUC students: not 21 users, paying customers or product-market fit, and never “80.8% of college students”. The friend’s words are paraphrased; no name, no testimonial. The reel and the note are illustrative. If asked for research: “Research behind this” in the appendix (47.6% of people who intended to exercise didn’t follow through; behavior changed about half as much as intention), physical activity only, and neither study measures Ori.',
    appendix: ['research', 'discovery', 'sources']
  },
  {
    id: 'journey',
    aliases: ['stages'],
    label: 'Five stages, one Ori',
    headline: 'There is work between a spark and a habit.',
    accent: 'between a spark and a habit.',
    seconds: 17,
    companion: { expression: 'Ready', corner: false },
    layout: 'journey',
    group: 'g2-journey',
    onScreen: {
      stages: [
        { name: 'Feel it', fragment: 'A feeling', icon: 'heart' },
        { name: 'Name it', fragment: 'A clearer need', icon: 'pen' },
        { name: 'Imagine it', fragment: 'Possibilities', icon: 'lightbulb' },
        { name: 'Shape it', fragment: 'Your tool', icon: 'brush' },
        { name: 'Build and iterate', fragment: 'Use and evolve', icon: 'refresh' }
      ],
      together: 'Ori helps you through all five.',
      returnLine: 'And keeps growing with you.'
    },
    spoken: 'We see five stages between a spark and a habit: feel it, name it, imagine it, shape it, then build and iterate. You can stall at any of them. Ori helps you through all five, and keeps growing with you.',
    cue: 'Arriving with Next (→ or Space) reveals the stages one at a time; each Next reveals the next stage, and the fifth draws one path through all five with Ori at its center, then the path returns from Build and iterate to Feel it (“And keeps growing with you.”). Any other arrival (a link, the overview, Previous) shows the complete slide. Pause on the first transition when recalling the friend. A product framework, not a validated behavioral model or a guarantee of habit formation; never say most students stall at one stage or that every spark needs an app. The human task and Ori’s role for each stage are in the appendix.',
    appendix: ['stages']
  },
  {
    id: 'feeling',
    aliases: ['bring'],
    label: 'Feeling to app',
    headline: 'A feeling can become an app.',
    accent: 'become an app.',
    seconds: 14,
    companion: { expression: 'Listening', corner: false },
    layout: 'feeling',
    group: 'g2-journey',
    onScreen: {
      structure: ['Feeling', 'Ori', 'Your app'],
      inputs: [
        { kind: 'thought', label: 'A thought', text: 'I keep stopping for long shadows.' },
        { kind: 'photo', label: 'A photo', src: 'assets/g2-journey/shared-photo.webp', alt: 'A photo the person shares: low sun and long shadows on a brick street.' },
        { kind: 'reel', label: 'Reel link', icon: 'link' },
        { kind: 'summary', label: 'ChatGPT · Claude summary', icon: 'copy' }
      ],
      exchange: { ask: 'What should it focus on?', answer: 'Shadows and reflections.' },
      output: { app: 'light', name: 'Light', still: 'media/stills/light-open-shadows-reflections.webp', alt: 'Light, the app Ori made: its camera icon, “Notice the light.”, this week’s prompt “Focus on shadows and reflections” and the shared photo as the first entry.', stillLabel: 'Product screenshot · Sample mode' },
      secondary: ['Companion', 'Playground', 'Apps']
    },
    spoken: 'You don’t need a finished idea. Bring something that interests or bothers you: a summary from your AI, a reel, a photo, a thought. Ori helps you name it, then shapes your app.',
    cue: 'You do not need a polished app specification. Everything on the left is something the person shares: a summary pasted from their own assistant, a reel link (saved as a link; Ori does not open or watch the reel), a photo they upload, a typed thought. ChatGPT and Claude are examples of where a summary comes from: Ori never reads anyone’s accounts, and nothing syncs. The exchange is the product’s own: the Make page asks “What should it focus on?”, and the words typed there became Light’s weekly prompt (“Focus on shadows and reflections”, Sample mode, the same words as the recordings on slides 5 and 6; the preview is the first frame of the slide-6 recording with its caption cropped); Ori asks at most one clarifying question, answered by typing. The thought is shortened from the real share in the stills; the photo is the CC0 demo photo. Companion → Playground → Apps is the product’s own structure.',
    appendix: ['demo']
  },
  {
    id: 'create',
    label: 'Create Light',
    headline: 'From a thought to Light.',
    accent: 'Light.',
    seconds: 26,
    companion: { expression: 'Found something', corner: true },
    layout: 'create',
    group: 'g3-demos',
    onScreen: {
      media: 'create',
      mediaLabel: 'Recording · Sample mode',
      steps: [
        { title: 'Share the spark', detail: 'A photo, a thought', icon: 'image', still: 'media/stills/agent-share-composer-crop.webp', alt: 'Product screenshot: the composer with the person’s photo attached and the thought “I keep stopping for long shadows on brick walls in the late afternoon. I want to get better at noticing light on my walks.”' },
        { title: 'Shape the idea', detail: 'Ori proposes Light', icon: 'sparkle', still: 'media/stills/agent-reply-light-card-crop.webp', alt: 'Product screenshot, Sample mode: Ori replies “Sample mode cannot read images, so I’m using your words. Want a place for the shots you notice?” above the Light card, “A photo journal shaped around you.”, with Preview Light and Keep inspiration.' },
        { title: 'Open your app', detail: 'Your photo inside', app: 'light', still: 'media/stills/light-ready-card-crop.webp', alt: 'Product screenshot, Sample mode: Light’s card on its Ready screen, with its camera icon, “Notice the light.” and the person’s photo as its first entry.' }
      ],
      stillsLabel: 'Product screenshots · Sample mode'
    },
    spoken: 'Here’s the real product, recorded in Sample mode with scripted responses. I want to get better at noticing light on my walks. I share a photo and that thought. Ori suggests a place for it. I shape one detail: shadows and reflections. I tap Make mine, and Light opens, with my photo already in it.',
    cue: 'Say the first two sentences over the poster, then press → (or the clicker) to start the clip on “I share a photo”: the 12.8-second clip runs under the last four sentences (share 0–2 s, Ori’s suggestion 2–5 s, preview and focus 5–8 s, Make mine to Light 8–12.8 s) and holds Light’s last frame; the next → then moves on (Space or the play control also plays and pauses). Say once that this is Sample mode with scripted responses, not live AI. The recording shows a photo and a thought, Ori’s suggestion, a preview with one detail shaped (“Focus on shadows and reflections”), Make mine, and Light opening with the photo. If the clip cannot load, the slot shows a product screenshot: say so. Light is an illustrative user scenario, not another interview. The three pictures beside it are crops of real Sample-mode screenshots of the same flow (a separate capture: its focus words read “golden-hour shadows”), so the steps stay readable while the clip is paused.',
    appendix: ['demo']
  },
  {
    id: 'grow',
    aliases: ['use-revise', 'reopen'],
    label: 'Light grows with you',
    headline: 'Your app grows with you.',
    accent: 'grows with you.',
    seconds: 26,
    companion: { expression: 'Ready', corner: true },
    layout: 'grow',
    group: 'g3-demos',
    onScreen: {
      media: 'grow',
      mediaLabel: 'Recording · Sample mode',
      // One recording on this slide: the return clip (03-reopen) plays in the appendix demo section for Q&A.
      // The loop reads Use it → More context → Better fit → (use it) again: the arc back carries "again".
      loop: ['Use it', 'More context', 'Better fit'],
      loopReturn: 'again',
      mechanism: ['Tell Ori', 'Review', 'Update'],
      // The real request typed in clip 02 and the fields it added (PRODUCT_FACTS.md §5), readable from the room.
      ask: 'Add camera settings to my photo notes',
      afterChip: '+ Camera, shutter, aperture',
      before: { label: 'Before', still: 'media/stills/light-entry-before.webp', alt: 'Product screenshot, Sample mode: a Light entry before the change: the photo, the observation “Low sun turns the brick wall gold”, and the fields Light, Where and Keeper.' },
      after: { label: 'After', still: 'media/stills/light-entry-after.webp', alt: 'Product screenshot, Sample mode: the same Light entry after the change: the same photo and observation, with the new fields Camera (Fuji X100V), Shutter and Aperture above Light, Where and Keeper.' },
      stillsLabel: 'Product screenshots · Sample mode',
      // The brief's takeaway for this slide, shown as well as spoken (the founder's brief outranks the density budget).
      takeaway: 'New context. Better fit. Still your app.',
    },
    spoken: 'Now I use it: I save an observation. I ask Ori for camera settings, review the change, and apply it. Same photo, same note, new fields. New context, better fit, still my app.',
    cue: 'Press → (or the clicker) to start the clip as you begin, with the first word (12.8 s): “review” lands on the review sheet, “apply it” on the Updated toast, “Same photo” as the entry opens. The clip holds its last frame, and the next → then moves on. The change is user-led: tell Ori → review → update. Do not describe passive monitoring or automatic background redesign; the vision is apps that grow with you, and what ships today is a change you ask for, review and keep. The proof is the same photo and note before and after the change. The 5.2-second return clip (a fresh browser session opens Light by its own link) plays in the appendix (A → 4. The demo) for Q&A: a way back, not a home-screen launch and not a formed habit. Before and After are real Sample-mode screenshots of the same change, captured separately from the clip (the camera name was typed in by hand, as a person would).',
    appendix: ['demo', 'foundation']
  },
  {
    id: 'features',
    label: 'Context and Playground',
    headline: 'Bring your context. Explore what could be yours.',
    accent: 'Explore what could be yours.',
    seconds: 25,
    companion: { expression: 'Found something', corner: false },
    layout: 'features',
    group: 'g3-demos',
    onScreen: {
      // One recording (the founder's, live AI) and three steps that follow its cue points in config.js.
      media: 'context',
      steps: [
        { title: 'Bring your context', detail: 'Pasted from ChatGPT or Claude', icon: 'copy' },
        { title: 'Ori connects the dots', detail: 'You review what it keeps', ori: true },
        { title: 'Explore what fits you', detail: 'Choose a direction', icon: 'playground' }
      ]
    },
    spoken: 'One more way in. I copy Ori’s prompt into my own AI, paste back what it wrote about me, and review it. Ori connects the dots: it reads the whole profile and organizes what it learned into my interests. Then my Playground suggests what could fit me next, shaped around what I shared.',
    cue: 'Press → (or the clicker) to start the clip as you begin: the founder’s 23.65-second recording on the live site (the UI shows Live AI) fills the 25 seconds. Start each sentence as its step lights up: Bring your context (0 s) → Ori connects the dots (9 s; results from about 12.6 s) → Explore what fits you (15.9 s); never run ahead of the clip. The clip ends on its last frame with the suggestions on screen; the next → moves on. Never claim real-time speed: waiting may have been trimmed. Bring context from your AI: Ori gives you a prompt to copy; you paste it into ChatGPT, Claude, Gemini or any assistant you use, and paste or upload the answer back; you review what Ori keeps and can remove anything. Provider names are examples of where context comes from, never automatic account access. The Playground’s suggestions are based on what you shared; choosing one is the next step toward an app.',
    appendix: ['demo']
  },
  {
    id: 'zones',
    aliases: ['why', 'foundation'],
    label: 'Interests and workflows',
    headline: 'What you love. What you need to get done.',
    accent: 'What you need to get done.',
    seconds: 13,
    companion: { expression: 'Found something', corner: false },
    layout: 'zones',
    group: 'g4-position',
    onScreen: {
      // Real app screens from one Sample-mode account (media/stills/stills.json), cropped in CSS to the top of
      // each screen. Course Assignments is a Sample-catalog app the product made (Playground → Make mine);
      // its due-soon highlight is a date rule when the app opens. Nothing here sends, syncs or automates.
      zones: [
        {
          title: 'Personal interests',
          icon: 'app:heart',
          apps: [
            { app: 'light', name: 'Light', what: 'Photography', still: 'light-gallery-observation.webp', alt: 'Light: a photo with the saved note “Low sun turns the brick wall gold”' },
            { app: 'riff', name: 'Riff', what: 'Music practice', still: 'riff-timer.webp', alt: 'Riff: a 15-minute practice timer' }
          ]
        },
        {
          title: 'Everyday workflows',
          icon: 'app:checks',
          apps: [
            { app: 'people', name: 'People', what: 'Follow-ups', still: 'people-today.webp', alt: 'People: today’s follow-ups, Priya “Send the deck” and Lena' },
            { app: 'assignments', icon: 'app:checklist', name: 'Assignments', what: 'Deadlines', still: 'assignments-card-crop.webp', alt: 'Course Assignments: Problem set 4 (Databases), in progress, highlighted as due in 2 days' }
          ]
        }
      ],
      mediaLabel: 'Product screenshots · Sample mode',
      bottomLine: 'One companion. Personal apps. Both grow with you.'
    },
    spoken: 'Ori works for what you love, photography in Light, practice in Riff, and for what you need to get done, follow-ups in People. One companion. Personal apps. Both grow with you.',
    cue: 'Interests and productivity in one platform, around one companion. People organizes and guides follow-ups; it does not send email, read a calendar or automate anything outside Ori, so never say “automate” here. The second workflow, Assignments, is the Sample catalog’s Course Assignments app, made in the product (Playground, then Make mine): when it opens it highlights anything due within three days. Live AI designs its own apps, so names vary. The four screens are real Sample-mode captures from one account; the follow-ups and assignments in them were typed by hand. The ring is one companion that knows which apps you have (not their entries); both kinds of app change only when you ask Ori and review. The old architecture slide (useful actions, durable records, careful revisions) is in the appendix.',
    appendix: ['foundation', 'positioning']
  },
  {
    id: 'position',
    label: 'Competitor map',
    headline: 'Personal context, turned into everyday apps.',
    accent: 'turned into everyday apps.',
    seconds: 16,
    companion: { expression: 'Found something', corner: false },
    layout: 'position',
    group: 'g4-position',
    onScreen: {
      label: 'Product positioning',
      axes: {
        x: { title: 'Starting point', low: 'An app you already know you need', high: 'Your context, interests, and unclear ideas' },
        y: { title: 'Everyday experience', low: 'A general workspace', high: 'Distinct personal apps you return to' }
      },
      // Qualitative regions on a 0–1 plot (x to the right, y upwards): editorial judgments about product
      // focus, never scores. Competitors may overlap Ori's area.
      // at: where the region's text label sits (tl top-left, bl bottom-left, mr middle-right); tone: its tint.
      regions: [
        { name: 'App stores & specialist apps', note: 'Choose a ready-made app', x: [0.03, 0.4], y: [0.56, 0.95], at: 'tl', tone: 'store' },
        { name: 'AI app builders', example: 'Lovable', note: 'Create and revise software', x: [0.17, 0.56], y: [0.3, 0.66], at: 'bl', tone: 'builder' },
        { name: 'General AI assistants & artifacts', example: 'Claude', note: 'Conversation, context, interactive apps and storage; overlaps Ori', x: [0.47, 0.93], y: [0.15, 0.7], at: 'mr', tone: 'assistant' },
        { name: 'General workspaces', example: 'Notion', note: 'Organize work and context', x: [0.25, 0.75], y: [0.03, 0.27], at: 'bl', tone: 'workspace' }
      ],
      // Ori today: what the repository ships (shared notes, photos, links and pasted summaries → distinct apps
      // with their own link and icon, changed only by the person). Ori vision: not shipped (verified phone
      // home screens, share-menu capture, background adaptation), drawn outlined and joined by a dashed line.
      ori: { name: 'Ori', note: 'Explore an unclear need, keep distinct daily apps', x: 0.74, y: 0.73 },
      vision: { name: 'Ori vision', note: 'apps on your phone that keep growing with you', x: 0.93, y: 0.91 },
      supporting: 'From an unclear spark to an app that keeps growing.'
    },
    spoken: 'App stores start from an app you already know you need. Builders are powerful. Assistants like Claude overlap with us. Ori starts earlier, from your context and unclear ideas, and ends in personal apps you return to.',
    cue: 'A positioning map, not a benchmark: placements are qualitative judgments about product focus. Claude documents interactive apps, persistent storage and connected tools; Lovable builds, iterates and deploys apps with backends; Notion offers AI connectors and agent memories. Never say competitors only chat, forget everything, cannot store data or cannot build apps. Ori’s proposed advantage is the integrated, phone-first personal journey and lower friction for this user, not exclusive ownership of those capabilities. The solid Ori marks what ships today: shared notes, photos, links and pasted summaries become distinct apps with their own link and icon, changed only when the person asks Ori and reviews. The outlined “Ori vision” is not shipped: apps verified on phone home screens, sharing from other apps, apps that adapt in the background. Sources in the appendix.',
    appendix: ['positioning', 'sources']
  },
  {
    id: 'founder',
    aliases: ['gtm'],
    label: 'Founder and pilot',
    headline: 'I’m building with the community I already know.',
    accent: 'the community I already know.',
    seconds: 19,
    companion: { expression: 'Listening', corner: true },
    layout: 'founder',
    group: 'g5-growth',
    onScreen: {
      founder: { name: 'Zuyu Liu', line: 'UIUC · Engineering × business', initials: 'ZL' },
      groups: [
        { name: 'Founders — Illinois Entrepreneurs', role: 'President', kind: 'lead' },
        { name: 'IBC', role: 'Project Manager', kind: 'member' },
        { name: 'Hoeft T&M', role: 'Student', kind: 'member' },
        { name: 'Friends in OTCR, CUBE, VCA, and business fraternities', kind: 'friends' }
      ],
      evidence: { yes: 21, total: 26, label: 'students I spoke with share this problem.' },
      pipeline: ['Relationships', 'Personal onboarding', 'Observe', 'Product iteration', 'Referrals'],
      goalsLabel: 'Pilot goals',
      goals: [
        { figure: '150', label: 'invitations', date: 'by Dec 1, 2026' },
        { figure: '50', label: 'enrolled', date: 'by Dec 15, 2026' }
      ]
    },
    spoken: 'I’m Zuyu. I lead Founders at UIUC and manage projects at IBC. Twenty-one of twenty-six students I spoke with share this problem. I’ll onboard, observe, iterate, and ask for referrals. Goals: 150 invitations by December 1st, 50 enrolled by the 15th.',
    cue: 'Who I am, why I can reach these people, what I do next. Personal access, not partnerships: Founders, IBC and T&M are direct roles; OTCR, CUBE, VCA and business fraternities are friends to ask for introductions. No logos, member counts, endorsements or agreements. 21/26 links back to the discovery question, not product adoption. The pipeline is a proposed recruiting and feedback mechanism, not a measured funnel. Only the two dated goals are on the slide; the invitation allocation and the activation and week-four definitions are in the appendix for Q&A.',
    appendix: ['gtm', 'discovery']
  },
  {
    id: 'growth',
    aliases: ['roadmap'],
    label: 'Growth goal',
    headline: 'Start at UIUC. Grow from there.',
    accent: 'Grow from there.',
    seconds: 12,
    companion: { expression: 'Found something', corner: true },
    layout: 'growth',
    group: 'g5-growth',
    onScreen: {
      chart: {
        title: 'Registered-user goal',
        flag: 'Goal',
        max: 100000,
        ticks: [0, 25000, 50000, 75000, 100000],
        points: [
          { month: 'January 2027', short: 'Jan 2027', value: 50, caption: 'Pilot checkpoint' },
          { month: 'March 2027', short: 'Mar 2027', value: 500 },
          { month: 'May 2027', short: 'May 2027', value: 5000 },
          { month: 'July 2027', short: 'Jul 2027', value: 25000 },
          { month: 'September 2027', short: 'Sep 2027', value: 100000 }
        ]
      },
      channels: ['UIUC', 'Other campuses', 'Young professionals'],
      yc: { logo: 'assets/yc-logo.png', title: 'YC Summer 2027', label: 'Application goal' }
    },
    spoken: 'We start at UIUC, then other campuses and young professionals. Our 2027 goals: 100,000 registered users by September, and a YC application for Summer.',
    cue: 'Goals, not traction, a forecast or a budget: cumulative distinct registered users, month-end, on an honest linear scale. The 50 people targeted for enrollment by December 15 are the initial cohort; January is the pilot and observation checkpoint, not a new start. Burden of proof if asked: 50 in January to 100,000 in September is a 2,000-fold increase in eight months, about 159% compounded monthly growth; the last two months need 75,000 more registrations, about 1,230 a day. YC Summer 2027 is an application goal: no acceptance, backing or endorsement, and no deadline is stated.',
    appendix: ['roadmap', 'sources']
  },
  {
    id: 'pricing',
    aliases: ['business'],
    label: 'Pricing',
    headline: 'Try it. Make it yours. Keep it.',
    accent: 'Keep it.',
    seconds: 10,
    companion: { expression: 'Thinking', corner: true },
    layout: 'pricing',
    group: 'g5-growth',
    onScreen: {
      label: 'Proposed pricing',
      ladder: [
        { figure: '14 days', rest: 'free' },
        { figure: '$7.50', unit: '/month', rest: 'for 2 months' },
        { figure: '$15', unit: '/month', rest: 'thereafter' }
      ],
      values: [
        { label: 'Personal fit', icon: 'target' },
        { label: 'Your progress', icon: 'bookmark' },
        { label: 'Room to grow', icon: 'plant' }
      ]
    },
    spoken: 'Our proposed pricing: fourteen days free, then seven-fifty a month for two months, then fifteen. For personal fit, your progress, and room to grow.',
    cue: 'Proposed terms: a free trial, not a free tier; no billing is implemented, and conversion, renewal and margins are not proven. If asked how we measure it: useful return → actual paid conversion → renewal → cost to serve, defined in the appendix. The eight-week pilot can test engagement and introductory payment; the two-month introductory price means it cannot by itself show a full-price renewal.',
    appendix: ['business']
  },
  {
    id: 'velocity',
    label: 'Velocity AI',
    headline: 'Velocity helped us ask better questions.',
    accent: 'ask better questions.',
    seconds: 15,
    companion: { expression: 'Thinking', corner: true },
    layout: 'velocity',
    group: 'g6-close',
    onScreen: {
      cards: [
        { concept: 'A branching path', question: 'Build something new?', decision: 'Save, reuse, revise, or create.' },
        { concept: 'A cursor completing an action', question: 'What makes it useful?', decision: 'Real actions, not just screens.' },
        { concept: 'A record carried between two app views', question: 'Can it change safely?', decision: 'Keep progress through revisions.' },
        { concept: 'A return arrow and a payment symbol', question: 'Will people keep it?', decision: 'Test return use and payment.' }
      ],
      supporting: ['Research', 'product decisions', 'pilot tests'],
      chain: [
        { step: 'Research', note: 'Velocity AI' },
        { step: 'Product decisions', note: 'shipped' },
        { step: 'Pilot tests', note: 'planned' }
      ]
    },
    spoken: 'Velocity helped us ask better questions. Build something new? What makes it useful? Can it change safely? Will people keep it? Each answer became a product decision or a test for our pilot.',
    cue: 'The hackathon’s Velocity AI section: keep it on screen for its full 15 seconds. Velocity shaped, specified and helped us test assumptions across four research rounds, a revised hackathon canvas and a commercial review. It did not build or validate Ori, establish demand or prove willingness to pay; its 12 adversarial cases are proposed acceptance cases, not passed tests; no time saving is measured. On the slide, “shipped” marks the three product decisions now in Ori (save, reuse, revise or create; real actions; records kept through revisions) and “planned” marks the pilot’s return-use and payment test. Rounds, canvas revisions and artifacts are in the appendix.',
    appendix: ['velocity']
  },
  {
    id: 'ask',
    label: 'The ask',
    headline: '$10,000. 0% equity.',
    seconds: 12,
    theme: 'ink',
    companion: { expression: 'Ready', corner: false },
    layout: 'ask',
    group: 'g6-close',
    onScreen: {
      hero: '$10,000. 0% equity.',
      punchline: 'The perks of a hackathon.',
      uses: [
        { label: 'A reliable product', icon: 'check' },
        { label: 'A 50-person pilot', icon: 'people' },
        { label: 'Evidence to grow', icon: 'chart' }
      ],
      timeline: '8 weeks',
      bottomLine: 'Help us build a phone that grows with you.',
      bottomAccent: 'grows with you.'
    },
    spoken: 'Ten thousand dollars, zero percent equity: the perks of a hackathon. It funds a reliable product and a fifty-person pilot. Help us build a phone that grows with you.',
    cue: 'A playful prize ask, not an investment round or an agreed award. The suggested allocation ($4,000 product reliability and device testing, $2,000 AI usage and hosting, $2,000 recruiting and research logistics, $2,000 contingency) and what the money does not fund are in the appendix. Then Next to the closing slide.',
    appendix: ['ask']
  },
  {
    id: 'signature',
    aliases: ['close', 'contact'],
    label: 'Signature and Q&A',
    headline: 'Ori. Your phone, your story.',
    seconds: 7,
    theme: 'ink',
    companion: null,
    layout: 'signature',
    group: 'core',
    onScreen: {
      line: 'Ori. Your phone, your story.',
      qr: { src: 'assets/qr-ori.png', href: 'https://ori-fjrx.onrender.com/', alt: 'QR code that opens Ori' },
      contact: { name: 'Zuyu Liu', email: 'zliu2017@illinois.edu', phone: '847-962-2868', tel: '+18479622868' }
    },
    spoken: 'Ori. Your phone, your story. Scan the code, create your own account, and try Ori. Thank you.',
    cue: 'Scan the code, create your own account, and try Ori. Say the invitation; it is not on the slide. Leave this slide up for the two minutes of Q&A: the code opens https://ori-fjrx.onrender.com/, where people sign up for their own account. Never show shared demo credentials. The appendix (A) holds sources and definitions for questions.',
    appendix: ['ask', 'sources']
  }
];

// Appendix sections the notes can link to (ids match the appendix in index.html).
window.ORI_APPENDIX_SECTIONS = {
  research: 'Research behind this',
  sources: 'Sources and evidence limits',
  discovery: 'Customer discovery, the longer story',
  stages: 'The five stages, complete',
  demo: 'The demo: recordings, screenshots and media slots',
  foundation: 'How a personal app keeps your progress',
  positioning: 'Positioning: the map and its sources',
  gtm: 'Founder-led pilot: plan and definitions',
  roadmap: 'Growth goal and the YC application goal',
  business: 'Pricing and economics questions',
  velocity: 'How we used Velocity AI, expanded',
  ask: 'The ask, the budget and Q&A',
  companion: 'About Ori’s expressions'
};
