// The Ori pitch: one scene data source for the slides, overview, progress, labels, hashes, notes and timing.
// Authority: the final-round revision brief (November 15, 2026: order, copy, budgets) plus the founder's
// final-round decisions: old slides 5 and 6 merged into 'built'; the old context-import slide and every demo
// recording live in the appendix (click to play); 'whynow' and 'market' follow 'zones', which stays exactly as it
// was; the founder slide shows the four-step mechanism; and every slide is highly visual, with as little text as
// possible (anything that can be said aloud lives in the spoken track or the cue). 15 presented scenes, 230
// seconds (3:50) of presenting; Q&A (two minutes) is separate and happens on scene 15.
//
// Each scene:
//   id         stable identifier: the slide's element id (scene-<id>) and a hash alias (#<id> opens it)
//   aliases    older ids that still open the scene (links to the 15-scene deck keep working)
//   label      a short name for the overview, the controls and the notes (not shown on the slide)
//   headline   the slide's main line (also the overview title and the slide's accessible name)
//   accent     optional: the part of the headline drawn in the accent colour (styling only)
//   seconds    the rehearsal budget; the main path totals 230 (3:50)
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
    seconds: 15,
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
    seconds: 17,
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
    spoken: 'We asked twenty-six UIUC students this question. Twenty-one said yes. A saved workout doesn’t get me through a workout. A saved photography reel doesn’t help me practice. What I lose is progress toward the things I wanted to get better at.',
    cue: 'Name the personal cost of not following through. Straight from the promise to the question: the count first, then the cost in your own words (at most two examples aloud), then hand over to Ori on the next slide. The friend’s insight stays on screen; let it sit. 21/26 is founder-reported, informal discovery with a convenience sample of UIUC students: not 21 users, paying customers or product-market fit, and never “80.8% of college students”. The friend’s words are paraphrased; no name, no testimonial. The reel and the note are illustrative. If asked for research: “Research behind this” in the appendix (47.6% of people who intended to exercise didn’t follow through; behavior changed about half as much as intention), physical activity only, and neither study measures Ori.',
    appendix: ['research', 'discovery', 'sources']
  },
  {
    id: 'journey',
    aliases: ['stages'],
    label: 'Five stages, one Ori',
    headline: 'There is work between a spark and a habit.',
    accent: 'between a spark and a habit.',
    seconds: 7,
    companion: { expression: 'Ready', corner: false },
    layout: 'journey',
    group: 'g2-journey',
    onScreen: {
      // The labels explain themselves: one short line per stage, nothing under it (the founder's minimal-text
      // priority). The renderer still draws an optional `fragment` (at most 4 words) under a label if one is added.
      stages: [
        { name: 'Notice a feeling', icon: 'heart' },
        { name: 'Clarify the idea', icon: 'pen' },
        { name: 'Imagine the outcome', icon: 'lightbulb' },
        { name: 'Shape your solution', icon: 'brush' },
        { name: 'Build, use, improve', icon: 'refresh' }
      ],
      together: 'Ori helps you through all five.',
      returnLine: 'And keeps growing with you.'
    },
    spoken: 'Ori helps you move from something you feel to something you can use—and keep improving.',
    cue: 'Let the labels explain themselves. Arriving with Next (→ or Space) reveals the stages one at a time: Notice a feeling, Clarify the idea, Imagine the outcome, Shape your solution, Build, use, improve. The fifth draws one path through all five with Ori at its center, then the path returns from Build, use, improve to Notice a feeling (“And keeps growing with you.”). Any other arrival (a link, the overview, Previous) shows the complete slide. Click through without explaining each box; say the one line as the loop closes. “Imagine the outcome” is the useful change the person wants, before designing the tool. A product framework, not a validated behavioral model or a guarantee of habit formation; never say most students stall at one stage or that every spark needs an app. The human task and Ori’s role for each stage are in the appendix.',
    appendix: ['stages']
  },
  {
    id: 'feeling',
    aliases: ['bring'],
    label: 'Feeling to app',
    headline: 'Your context becomes something you can use.',
    accent: 'something you can use.',
    seconds: 12,
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
      output: { app: 'light', name: 'Light', still: 'media/stills/light-open-shadows-reflections.webp', alt: 'Light, the app Ori made: its camera icon, “Notice the light.”, this week’s prompt “Focus on shadows and reflections” and the shared photo as the first entry.', stillLabel: 'Screenshots · Sample mode' },
      secondary: ['Companion', 'Playground', 'Apps'],
      // The destination, beside the My apps phone ("My apps · Add to home screen").
      endpoint: 'Your own AI app store.'
    },
    spoken: 'You don’t need a finished idea. Share a thought, a photo, a reel link, your AI’s summary. Ori helps you shape it into apps: your own AI app store.',
    cue: 'The destination, not the mechanics: context becomes something you can use, and each app lands in My apps, your own AI app store, where the person can add it to the home screen. You do not need a polished app specification. Everything on the left is something the person shares: a summary pasted from their own assistant, a reel link (saved as a link; Ori does not open or watch the reel), a photo they upload, a typed thought. ChatGPT and Claude are examples of where a summary comes from: Ori never reads anyone’s accounts, and nothing syncs. The exchange is the product’s own: the Make page asks “What should it focus on?”, and the words typed there became Light’s weekly prompt (“Focus on shadows and reflections”, Sample mode, the same words as the demo recordings, which now play in the appendix demo section; the preview is the first frame of the use-and-revise recording with its caption cropped); Ori asks at most one clarifying question, answered by typing. The thought is shortened from the real share in the stills; the photo is the CC0 demo photo. Companion → Playground → Apps is the product’s own structure. Account-import mechanics (the context-import recording) are in the appendix, not on this slide.',
    appendix: ['demo']
  },
  {
    id: 'built',
    aliases: ['create', 'grow', 'use-revise', 'reopen'],
    label: 'Built around you',
    headline: 'Built around you. Ready to change with you.',
    accent: 'Ready to change with you.',
    seconds: 21,
    companion: null,
    layout: 'built',
    group: 'g7-value',
    onScreen: {
      // Old slides 5 and 6 merged: three real Sample-mode screenshots of one flow, left to right, the last (the
      // change) given the most space. No video on the main path: the recordings play in the appendix demo section.
      // label: the short form the slide shows (visual first); title and detail stay for screen readers and the notes.
      steps: [
        { label: 'Your context', title: 'Start with your context', detail: 'A photo and a thought', still: 'media/stills/agent-share-composer-crop.webp', alt: 'Product screenshot: the composer with the person’s photo attached and the thought “I keep stopping for long shadows on brick walls in the late afternoon. I want to get better at noticing light on my walks.”' },
        { label: 'Your app', title: 'Use your personal app', detail: 'Your photo and note, saved', still: 'media/stills/light-entry-before.webp', alt: 'Product screenshot, Sample mode: a Light entry: the photo, the observation “Low sun turns the brick wall gold”, and the fields Light, Where and Keeper.' },
        { label: 'Change as you learn', title: 'Change it as you learn', detail: 'Same entry, new fields', still: 'media/stills/light-entry-after.webp', alt: 'Product screenshot, Sample mode: the same Light entry after the change: the same photo and observation, with the new fields Camera (Fuji X100V), Shutter and Aperture above Light, Where and Keeper.', chip: '+ Camera, shutter, aperture' }
      ],
      mediaLabel: 'Product screenshots · Sample mode'
    },
    spoken: 'Light starts with something I already care about. I can keep my observations, come back to them, and change the app as I learn. The tool changes without making me start over.',
    cue: 'Explain the outcome, not the buttons. Three real Sample-mode screenshots of one flow: the share (a photo and a thought), a Light entry with a saved observation, and the same entry after the person asked Ori for camera settings, reviewed the change and applied it: same photo, same note, new fields. The change is user-led (tell Ori → review → update); never describe passive monitoring or automatic redesign. “Camera, shutter, aperture” is supporting evidence, not the point: the point is a photo journal that can change without losing earlier observations. The camera name was typed in by hand, as a person would. What is shown is AI creating and revising an app; AI staying useful inside an app (the Form and Fuel kind of experience on slide 7) is the vision, not shown here as shipped. The recordings (creating Light, using and revising it, reopening it by its own link) are Sample mode with scripted responses and play in the appendix for Q&A.',
    appendix: ['demo', 'foundation']
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
    id: 'whynow',
    aliases: ['why-now', 'formfuel', 'personalized'],
    label: 'Why now',
    headline: 'AI can now build tools around your life.',
    accent: 'tools around your life.',
    seconds: 27,
    companion: null,
    layout: 'whynow',
    group: 'g7-value',
    onScreen: {
      // Visual first (the founder: as little text as possible): short forms on the slide, full wording in the
      // fields the slide keeps for screen readers, the overlay and the notes.
      eyebrow: 'Why now',
      // One compact proof line for "why now" (source W2 in the appendix): familiarity, not demand. The headline carries
      // feasibility (W1, Anthropic 2025, in the cue and the appendix).
      proof: '61% of U.S. adults 18–29 have used ChatGPT',
      proofSource: 'Pew, 2026',
      // Step 1, left (the hero of the comparison): what personalized software can do. The founder's own app, which he
      // built with ChatGPT (founder-reported), independently of Ori: not made in Ori, not an Ori feature. label is the
      // group's visible label; each panel shows a crop of the real screen (crop); the caption is read to screen readers.
      example: {
        name: 'Form and Fuel',
        label: 'Built with ChatGPT',
        caption: 'Form and Fuel, the founder’s own personal app, built with ChatGPT (not made in Ori)',
        logo: 'media/formfuel/ff-logo.webp',
        logoAlt: 'Form and Fuel logo: a white dumbbell on a green rounded square, with the words “Form & Fuel”.',
        panels: [
          { label: 'Plan', caption: 'Know what to do next', still: 'media/formfuel/ff-plan-crop.webp', crop: 'media/formfuel/ff-plan-crop.webp', alt: 'Form and Fuel, Train tab: “Today · Your workout, adjusted to you”, today’s session “Lower A · strength + abs” and its first exercise, Squat, 3 × 5–8 reps at 165 lb, with Log sets.' },
          { label: 'Track', caption: 'Keep your progress', still: 'media/formfuel/ff-track-crop.webp', crop: 'media/formfuel/ff-track-crop.webp', alt: 'Form and Fuel, logging: the button “What should I hit next?” above Recent workouts: leg press 270 lb × 10 and 230 lb × 10, squat 165 lb × 7 and 135 lb × 7, all on Nov 12.' },
          { label: 'Fuel', caption: 'Understand your meals', still: 'media/formfuel/ff-fuel-crop.webp', crop: 'media/formfuel/ff-fuel-crop.webp', alt: 'Form and Fuel, Fuel tab (cropped; personal targets left out): “Food today · Photo estimates, edit before saving” and the saved meals list (49 saved): steak with leafy greens and raw egg yolk, an estimated 700 kcal and 70 g protein, Nov 3.' }
        ]
      },
      // FOUNDER DECISION (Nov 15, 12:45): slide 7 shows NO Ori price (it stays on slide 12) and no closing line beyond
      // the playground one-liner. Arrival shows the whole comparison at once (Built with ChatGPT vs One service each);
      // ONE click pops up the big Ori panel ("Not just one tool. An entire playground.") while the comparison dims.
      // Do not re-add "Ori · proposed $15/month" or "And fitness is just one app." here.
      // Step 1, right: specialists already sell fitness software, one service each. Three real pricing pages, in this
      // order. crop is the thumbnail on the slide; full is the whole pricing page the overlay shows; short is the
      // slide's caption (CoachRx and Everfit are labelled as coach software, so $79 never reads as an individual plan).
      prices: {
        title: 'One service each',
        items: [
          { name: 'Athletica', caption: '$19.90/month · individual endurance-training subscription', short: '$19.90/mo · endurance training', still: 'media/pricing/athletica-full.webp', crop: 'media/pricing/athletica-monthly.webp', full: 'media/pricing/athletica-full.webp', alt: 'Athletica pricing page: “Simple pricing. Full access. No tiers.” A free 2-week trial; Monthly $19.90/month; 6 months $99.00; Yearly $189.00/year.' },
          { name: 'Everfit Pro', caption: 'From $19/month · coach software for 5 clients', short: 'From $19/mo · coach software', still: 'media/pricing/everfit-full.webp', crop: 'media/pricing/everfit-pro.webp', full: 'media/pricing/everfit-full.webp', alt: 'Everfit pricing page, billed monthly: Starter free for up to 5 clients; Pro from $19/mo for 5 clients ($3.8 per client); Studio from $105/mo for 50 clients; Enterprise by contact.' },
          { name: 'CoachRx', caption: '$79/month · coach software for 6–50 clients', short: '$79/mo · coach software', still: 'media/pricing/coachrx-full.webp', crop: 'media/pricing/coachrx-79.webp', full: 'media/pricing/coachrx-full.webp', alt: 'CoachRx pricing page: “How many clients do you coach?” set to 25; Monthly, 6–50 clients, $79/month, billed monthly; free for 14 days.' }
        ]
      },
      // Step 2 · the Ori panel (one click): Ori, a playful cluster of personal apps with room for more, and the key
      // takeaway as the one-liner. No price.
      playground: { line: 'Not just one tool.', accent: 'An entire playground.', apps: ['light', 'riff', 'people'], alt: 'Ori, with a few of your personal apps: Light, Riff and People, and room for more' },
      mediaLabel: 'Founder-supplied screenshots'
    },
    spoken: 'Why now? AI can already build working apps in a conversation, and 61% of U.S. adults under 30 have used ChatGPT. I built Form and Fuel with ChatGPT, around my own routine. Others charge for one service each: don’t pay $20 a month for one swing; coaches pay $80 a month for one monkey bar. Ori isn’t just one tool. It’s an entire playground.',
    cue: 'Arriving with Next shows the whole comparison at once: Form and Fuel (built with ChatGPT) beside one service each (three real pricing pages); one click brings up the Ori panel, “Not just one tool. An entire playground.”, and the comparison dims behind it; any other arrival shows the Ori panel. The swing and monkey-bar line is spoken only. Say it accurately: Athletica is about $20 a month for one person’s endurance training; CoachRx’s $79 is what a coach pays to manage 6–50 clients, so say “coaches pay $80”, never that a person pays $80 for their own plan. Form and Fuel is the founder’s own personal app, which he built with ChatGPT: not made in Ori and not an Ori feature, it shows the kind of experience Ori is designed to enable. Ori’s price stays on slide 12. The screenshots are real; food values are estimates; the founder’s calorie and protein targets are personal, never advice; “49 saved” means saved meals, not days or users; energy and recovery tracking is founder-reported and not in these screenshots. The pricing pages show that specialist vendors sell paid fitness software, nothing more: not demand for Ori and not willingness to pay. Athletica ($19.90/month) is an individual endurance-training subscription; CoachRx ($79/month for 6–50 clients) and Everfit Pro (from $19/month for 5 clients; Everfit also has a free Starter plan) are software for coaching businesses, so never present $79 as an individual plan. Do not bring up Ori’s price here (it is on slide 12) and never claim savings; never promise that Ori replaces coaches, wearables or every fitness app. Click a pricing page to show it full size; any key or click closes it. Why now: conversational tools can already build interactive apps (Anthropic documented it in June 2025): feasibility, and competition, not something unique to Ori. Pew (February 2026 survey): 61% of U.S. adults 18–29 have ever used ChatGPT: familiarity, not daily use or demand for Ori.',
    appendix: ['business', 'sources']
  },
  {
    id: 'market',
    aliases: ['market-size', 'tam'],
    label: 'Market size',
    headline: 'A broad opportunity. A focused first market.',
    accent: 'A focused first market.',
    seconds: 16,
    companion: null,
    layout: 'market',
    group: 'g7-value',
    onScreen: {
      customer: 'For people with recurring interests and responsibilities',
      // A transparent population-and-price model (brief section 5; sources M1–M4 in the appendix), drawn as nested
      // rings (slides/g8-market.js). ring: the ring's large value; short: its visible label (the 25% assumption and the
      // 1,000 subscribers stay visible); title, math and note are read to screen readers (and in the cue).
      cards: [
        { tag: 'TAM', value: '~$44.2B/year', ring: '~$44.2B/yr', short: 'U.S. smartphone adults', title: 'U.S. adult smartphone owners', math: '~245M people × $180/year', note: 'Modeled ceiling at $15/month' },
        { tag: 'SAM', value: '~$3.4B/year', ring: '~$3.4B/yr', short: '18–34 · 25% assumed', title: 'Ages 18–34 with a recurring need', math: '~76M × 25% × $180/year', note: '25% qualification assumption' },
        { tag: 'SOM', value: '$180K ARR', ring: '$180K ARR', short: '1,000 subscribers', title: '1,000 retained full-price subscribers', math: '1,000 × $15 × 12', note: 'Illustrative 24-month UIUC + Chicago scenario' }
      ],
      // Pins on the dot map at their real positions. start: where Ori begins (UIUC and Chicago); next: possible next
      // places, not commitments (the founder is in San Francisco this summer). No dates and no launch claims on the slide.
      pins: [
        { name: 'UIUC', lat: 40.11, lon: -88.23, kind: 'start' },
        { name: 'Chicago', lat: 41.88, lon: -87.63, kind: 'start' },
        { name: 'Purdue', lat: 40.42, lon: -86.91, kind: 'next' },
        { name: 'Ohio State', lat: 40.0, lon: -83.03, kind: 'next' },
        { name: 'San Francisco', lat: 37.77, lon: -122.42, kind: 'next' }
      ],
      legend: { start: 'Start', next: 'Next' },
      local: ['UIUC students', 'Young professionals in Chicago'],
      footnote: 'Illustrative model at proposed $15/month. SAM qualification and SOM conversion are unvalidated assumptions.',
      footnoteShort: 'Illustrative model at proposed $15/month; assumptions unvalidated',
      sources: 'U.S. Census Bureau 2025 · Pew Research Center 2026',
      sourcesShort: 'Census · Pew'
    },
    spoken: 'At our proposed $15 a month, the national model is large. We start smaller: UIUC and Chicago, then campuses like Purdue and Ohio State, and San Francisco this summer. First, prove people return and pay.',
    cue: 'Say “model” and “scenario”; the local audience is not captured customers. The map: UIUC and Chicago (solid pins) are where Ori starts; Purdue, Ohio State and San Francisco (outlined pins) are possible next places, not commitments, partnerships or launches. The founder is in San Francisco this summer. TAM: 269,763,509 U.S. adults (Census, Vintage 2025) × 91% smartphone ownership (Pew 2026) = 245,484,793 people × $180 ≈ $44.19B a year: a population ceiling at the proposed price, not a measured market for personal AI apps. SAM: 78,500,906 adults aged 18–34 × 97% = 76,145,879 × 25% (an unvalidated qualification assumption: a recurring need, comfort with AI, interest in personal software) = 19,036,470 × $180 ≈ $3.43B a year (at 10%: $1.37B; at 40%: $5.48B). SOM: an illustrative 24-month scenario (about November 2026 to November 2028): 20,000 qualified prospects across UIUC and Chicago → 25% start a trial (5,000) → 50% activate (2,500) → 50% reach the full $15 (1,250) → 80% still paying (1,000) × $15 × 12 = $180,000 annualized revenue at the endpoint, before costs: not a forecast, not achieved ARR, not cash collected in year one (lower case 252 subscribers, $45,360; higher 2,160, $388,800). Local context: UIUC enrolls 61,060 (fall 2026); Chicago has 728,505 residents aged 20–34 (CMAP 2026, ACS 2020–2024): context, not people we can reach, and never added together. Reaching 20,000 qualified prospects needs channels beyond the 150 warm invitations: an operating requirement, not proven distribution. If asked: “Is $3.4B a published market estimate?” No: a population-and-price model with a labeled assumption.',
    appendix: ['business', 'sources']
  },
  {
    id: 'position',
    label: 'Competitor map',
    headline: 'Personal context, turned into everyday apps.',
    accent: 'turned into everyday apps.',
    seconds: 12,
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
    spoken: 'Specialist apps go deep. Builders and assistants overlap with us. The ambition is an AI-native phone experience: tools built around the person, with their interests and progress carried forward.',
    cue: 'Explain the map in customer terms, then land the ambition. Specialist apps give depth in one activity. AI builders help people create software. General AI assistants already offer context, app creation and, increasingly, persistence: they overlap with Ori. Ori aims to make an evolving collection of personal apps one coherent daily phone experience, including for someone who starts without an app specification. The differentiator to test is the complete experience and continued usefulness, not exclusive access to an AI model. A positioning map, not a benchmark: placements are qualitative judgments about product focus. Claude documents interactive apps, persistent storage and connected tools; Lovable builds, iterates and deploys apps with backends; Notion offers AI connectors and agent memories. Never say competitors only chat, forget everything, cannot remember context, cannot store data or cannot build apps. Ori’s proposed advantage is the integrated, phone-first personal journey and lower friction for this user, not exclusive ownership of those capabilities. The solid Ori marks what ships today: shared notes, photos, links and pasted summaries become distinct apps with their own link and icon, changed only when the person asks Ori and reviews. The outlined “Ori vision” is not shipped: apps verified on phone home screens, sharing from other apps, apps that adapt in the background. Sources in the appendix.',
    appendix: ['positioning', 'sources']
  },
  {
    id: 'founder',
    aliases: ['gtm'],
    label: 'Founder and pilot',
    headline: 'I’m building with the community I already know.',
    accent: 'the community I already know.',
    seconds: 26,
    companion: { expression: 'Listening', corner: true },
    layout: 'founder',
    group: 'g5-growth',
    onScreen: {
      // As little text as possible (the founder's priority): the name and the three direct roles. The friends in
      // OTCR, CUBE, VCA and business fraternities are in the cue and the appendix, not on the slide.
      founder: { name: 'Zuyu Liu', initials: 'ZL' },
      groups: [
        { name: 'Founders — Illinois Entrepreneurs', role: 'President', kind: 'lead' },
        { name: 'IBC', role: 'Project Manager', kind: 'member' },
        { name: 'Hoeft T&M', role: 'Student', kind: 'member' }
      ],
      evidence: { yes: 21, total: 26, label: 'of 26 students said yes' },
      // The acquisition mechanism, one step per Next (icons from the project's set). test: the question drawn
      // under that step (what the pilot measures). invitation: the slide's one sentence, under the first step.
      mechanism: [
        { step: 'Warm introduction', icon: 'app:people' },
        { step: 'One useful personal app', icon: 'ui:phone' },
        { step: 'Later-day use', icon: 'app:calendar', test: 'Will they use it again next week?' },
        { step: 'Referral', icon: 'ui:share' }
      ],
      invitation: 'Bring one recurring thing you want to do better. Leave with a tool shaped around it.',
      // Short labels (the date's "by" is in the spoken track and the screen-reader label).
      goalsLabel: 'Goals',
      goals: [
        { figure: '150', label: 'invitations', date: 'Dec 1' },
        { figure: '50', label: 'enrolled', date: 'Dec 15' }
      ]
    },
    spoken: 'I’m Zuyu. I lead Founders at UIUC and manage projects at IBC, so I start with warm introductions. The invitation: bring one recurring thing you want to do better; leave with a tool shaped around it. Then the test: will they use it again next week? Then referrals. Goals: 150 invitations by December 1st, 50 enrolled by the 15th.',
    cue: 'Spend time on the mechanism and what you will measure. The mechanism reveals one step per click: arriving with → (or the clicker) shows Warm introduction with the invitation; each → reveals the next step (One useful personal app; Later-day use with “Will they use it again next week?”; Referral; then the goals), and the → after the goals moves on. Any other arrival shows the whole slide. What you measure, in plain words: later-day use (target 30 of 50 completing a meaningful action on a later day within the first 14 days; 15 of 50 during days 22–28), prompted and unprompted returns, introductory payment, the first $15 payment and renewal separately, and founder time per activated user. The first cohort stays the appendix’s students with real follow-ups: Form and Fuel shows personal-app value, while the pilot tests the first repeatable Ori workflow. Personal access, not partnerships: Founders, IBC and T&M are direct roles; OTCR, CUBE, VCA and business fraternities are friends to ask for introductions. No logos, member counts, endorsements, mailing lists or agreements. 81% is 21 of the 26 students in founder-reported, informal discovery conversations (a convenience sample of UIUC students); it links back to the discovery question, not product adoption, and is never “81% of college students”. The mechanism is a proposed recruiting and feedback loop, not a measured funnel. The dates are December 1 and 15, 2026; the invitation allocation and the activation and week-four definitions are in the appendix for Q&A.',
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
      // The evidence gates: each must hold before the next step of growth.
      gatesLabel: 'Evidence gates',
      gates: [
        { label: 'Useful returns', icon: 'ui:history' },
        { label: 'Paid use', icon: 'app:wallet' },
        { label: 'Repeatable onboarding', icon: 'ui:refresh' },
        { label: 'Wider distribution', icon: 'app:globe' }
      ],
      yc: { logo: 'assets/yc-logo.png', title: 'YC Fall 2027', label: 'Application goal' }
    },
    spoken: 'Start at UIUC, then earn each step: useful returns, paid use, repeatable onboarding, wider distribution. Goals: 100,000 registered users by September, and a YC Fall application.',
    cue: 'Each gate earns the next: useful returns → paid use → repeatable onboarding → wider distribution (other campuses, then young professionals). YC is about building a repeatable consumer business, not the reason acquisition will happen. Goals, not traction, a forecast or a budget: cumulative distinct registered users, month-end, on an honest linear scale. The 50 people targeted for enrollment by December 15 are the initial cohort; January is the pilot and observation checkpoint, not a new start. Burden of proof if asked: 50 in January to 100,000 in September is a 2,000-fold increase in eight months, about 159% compounded monthly growth; the last two months need 75,000 more registrations, about 1,230 a day. YC Fall 2027 is an application goal: no acceptance, backing or endorsement, and no deadline is stated.',
    appendix: ['roadmap', 'sources']
  },
  {
    id: 'pricing',
    aliases: ['business'],
    label: 'Pricing',
    headline: 'Try it. Make it yours. Keep it.',
    accent: 'Keep it.',
    seconds: 9,
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
    spoken: 'Our proposed price: $15 a month after the trial and introductory period, for personal apps people keep using across their lives.',
    cue: 'One sentence on price, then move on. The ladder on screen (14 days free, $7.50 a month for two months, then $15) says the rest. The $15 is an experiment, not validated willingness to pay; runtime AI, hosting, storage, support and trial-user costs still matter. Proposed terms: a free trial, not a free tier; no billing is implemented, and conversion, renewal and margins are not proven. If asked how we measure it: useful return → actual paid conversion → renewal → cost to serve, defined in the appendix. The eight-week pilot can test engagement and introductory payment; the two-month introductory price means it cannot by itself show a full-price renewal.',
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
    seconds: 21,
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
        { label: 'Context infrastructure', note: 'ChatGPT, Claude, Instagram, your phone', icon: 'link' }
      ],
      timeline: '8 weeks',
      // The founder's explicit next step (Nov 15): an invitation to partner, never an agreed partnership.
      next: {
        label: 'Next step',
        line: 'Launch Ori as a startup with Kearney PERLab.',
        accent: 'with Kearney PERLab.',
        gives: [
          { verb: 'Develop', what: 'AI expertise', icon: 'app:sparkle' },
          { verb: 'Deploy', what: 'professional team', icon: 'app:rocket' },
          { verb: 'Expand', what: 'beyond students', icon: 'app:globe' }
        ]
      },
      bottomLine: 'Help us build a phone that grows with you.',
      bottomAccent: 'grows with you.'
    },
    spoken: 'Ten thousand dollars, zero percent equity: the perks of a hackathon. It funds a reliable product, a fifty-person pilot, and context infrastructure. Next, I want to launch Ori as a startup with Kearney PERLab: your AI expertise to develop it, your team to deploy it, your network to reach beyond students.',
    cue: 'The prize ask, then the explicit next step: launching Ori as a startup with Kearney PERLab. Say it as an invitation (“I’d love to partner with Kearney PERLab”): never imply that Kearney has agreed, endorsed Ori or committed resources. What a partnership would add beyond the $10,000: AI expertise to develop Ori, a professional team and resources to deploy it, and Kearney’s network and customer base to expand Ori’s use cases beyond students (for example young professionals). Look at the judges on “your”. The $10,000 is a playful prize ask, not an investment round or an agreed award. Context infrastructure is future work the money would fund: easier ways for Ori to get context from ChatGPT, Claude, Instagram and the phone. Today a person pastes a summary and no account is read; never say Ori reads them now. The suggested allocation ($4,000 product reliability and device testing, $2,000 AI usage and hosting, $2,000 recruiting and research logistics, $2,000 contingency; context infrastructure has no separate line yet) and what the money does not fund are in the appendix. The next-step band stays on screen. Then Next to the closing slide.',
    appendix: ['ask']
  },
  {
    id: 'signature',
    aliases: ['close', 'contact'],
    label: 'Signature and Q&A',
    headline: 'Ori. Your phone, your story.',
    seconds: 7,
    theme: 'ink',
    companion: { expression: 'Ready', corner: false },
    layout: 'signature',
    group: 'core',
    onScreen: {
      line: 'Your phone, your story.',
      qr: { src: 'assets/qr-ori.png', href: 'https://ori-fjrx.onrender.com/', alt: 'QR code that opens Ori', caption: 'Try Ori now' },
      contact: { name: 'Zuyu Liu', email: 'zliu2017@illinois.edu', phone: '847-962-2868', tel: '+18479622868' }
    },
    spoken: 'Your phone, your story. Scan the code, create your own account, and try Ori. Thank you.',
    cue: 'Scan the code, create your own account, and try Ori. The slide shows only “Try Ori now” under the code; say the full invitation. Leave this slide up for the two minutes of Q&A: the code opens https://ori-fjrx.onrender.com/, where people sign up for their own account. Never show shared demo credentials. The appendix (A) holds sources and definitions for questions.',
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
  companion: 'Meet Ori — a little companion'
};
