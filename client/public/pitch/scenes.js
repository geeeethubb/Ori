// The Ori pitch: one scene data source for the slides, overview, progress, labels, hashes, notes and timing.
// Narrative authority, in order of precedence: docs/ori-pitch-kit/ORI_PITCH_COMMERCIAL_ADDENDUM.md (GTM, growth
// roadmap, pricing, ask, the 15-scene timing table), ORI_PITCH_EXPRESSION_ADDENDUM.md (the four expressions, the
// demo loop) and ORI_PITCH_STORYTELLING.md (everything else). 15 scenes, nine sections, 240 seconds.
//
// Each scene:
//   id         stable identifier (also the slide's element id: scene-<id>; #<id> opens it)
//   section    { number, name }: the narrative section. Section numbers differ from scene numbers:
//              Section 8 (How we used Velocity AI) is scene 14.
//   headline   the audience-facing headline
//   seconds    rehearsal budget; the main path totals 240
//   companion  { expression, size }: one of the four expressions from the identity board
//              (Listening, Thinking, Found something, Ready), drawn by assets/ori/companion-<art>.svg;
//              size 'large' only at the opening and the spark reveal. Expressions tell the story; they
//              never imply that Ori senses emotions.
//   layout     which slide composition renders onScreen
//   onScreen   the on-screen content (concise; expanded material lives in the appendix)
//   footer     [left, right] labels at the bottom of the slide
//   spoken     the spoken track (speaker notes). It must fit the budget at about 150 words a minute
//              (2.5 words a second); pitch.js warns in the console when one does not.
//   cue        the stage cue (speaker notes)
//   appendix   related appendix sections, linked from the notes
window.ORI_SCENES = [
  {
    id: 'promise',
    section: { number: 1, name: 'Promise' },
    headline: 'Your phone, your story.',
    seconds: 8,
    companion: { expression: 'Ready', size: 'large' },
    layout: 'promise',
    onScreen: {
      lead: 'An AI-native phone experience. Apps that grow with you.',
      support: 'Starting on the phone you already own.',
      collection: [
        { app: 'light', name: 'Light', note: 'photography' },
        { app: 'riff', name: 'Riff', note: 'music' },
        { app: 'people', name: 'People', note: 'people' }
      ],
      spark: 'one unfinished spark…',
      caption: 'Your sparks, somewhere to grow'
    },
    footer: ['The vision', 'An illustration of where we are heading. Not a product screenshot.'],
    spoken: 'We’re building Ori: an AI-native phone experience where little sparks become personal apps, on the phone you already own.',
    cue: 'Answer first. Ori beside a personal collection: photography, music, people and one unfinished spark. “AI-native phone” is the vision for a software experience on the phone people already own, not a new handset or an operating-system replacement. Optional longer opening, outside the four minutes: “The smartphone put a world of software in our pockets. The next step is software that can take shape around our own lives.”',
    appendix: ['companion']
  },
  {
    id: 'research',
    section: { number: 2, name: 'Research and discovery' },
    headline: 'Wanting is only the beginning.',
    seconds: 10,
    companion: { expression: 'Thinking', size: 'small' },
    layout: 'research',
    onScreen: {
      cards: [
        {
          ref: 'R1',
          tag: 'Physical activity',
          figure: '47.6%',
          text: 'Of people intending to be physically active, nearly half did not follow through.',
          source: { label: 'Feil et al., 2023', href: 'https://pubmed.ncbi.nlm.nih.gov/37460164/' },
          detail: 'Meta-analysis, 25 samples, 29,600 participants overall. Physical activity specifically.'
        },
        {
          ref: 'R2',
          tag: 'Intention and behavior',
          figure: '47',
          unit: 'experiments',
          text: 'Strengthening intention produced a smaller change in behavior.',
          source: { label: 'Webb & Sheeran, 2006', href: 'https://pubmed.ncbi.nlm.nih.gov/16536643/' },
          detail: 'Effects on intention d = 0.66 and behavior d = 0.36. Effect sizes, not percentages.'
        }
      ]
    },
    footer: ['External research', 'Two separate findings, not a combined statistic.'],
    spoken: 'Wanting is only the beginning. A meta-analysis of physical activity found nearly half of people who intended to act didn’t follow through.',
    cue: 'Two separate cards, two separate findings. Keep “physical activity” audible beside 47.6%. The research shows follow-through is a serious, studied problem; it does not say how many people need Ori. d values are effect sizes, never percentages.',
    appendix: ['sources']
  },
  {
    id: 'discovery',
    section: { number: 2, name: 'Research and discovery' },
    headline: '21 of 26 students said yes.',
    seconds: 21,
    companion: { expression: 'Listening', size: 'small' },
    layout: 'discovery',
    onScreen: {
      question: '“Do you struggle to turn your ideas into something consistent?”',
      yes: 21,
      total: 26,
      footnote: 'Founder-reported, informal discovery with 26 UIUC students; a convenience sample. 21/26 = 80.8%. Early local signal, not a campus-wide estimate.',
      turn: 'One conversation changed where we thought the problem began.',
      insightLabel: 'A friend’s insight, paraphrased',
      insight: 'Sometimes the hard part is pinpointing what the idea even is.',
      sparksLabel: 'Illustrative examples',
      sparks: [
        { kind: 'reel', label: 'A saved reel' },
        { kind: 'sentence', label: 'A sentence that stayed', text: 'Notice the light before it goes.' },
        { kind: 'note', label: 'An unfinished note', text: 'Why do I never…' }
      ]
    },
    footer: ['Customer discovery', 'Founder-reported and informal. Not a survey transcript.'],
    spoken: 'We asked twenty-six UIUC students whether they struggle to turn ideas into something consistent. Twenty-one said yes. But a friend explained she sometimes struggles to pinpoint the idea itself. Maybe you have a saved reel, a sentence that stayed with you, or a frustration you can’t explain yet.',
    cue: 'Show the count first, then shift to the friend’s insight: paraphrased, not a transcript. The reel, the sentence and the note are illustrative. 21/26 = 80.8% from a founder-reported convenience sample: never “80.8% of college students”, and do not present this count again later as a second validation.',
    appendix: ['discovery', 'sources']
  },
  {
    id: 'stages',
    section: { number: 3, name: 'Five stages' },
    headline: 'There is work between a spark and a habit.',
    seconds: 18,
    companion: { expression: 'Thinking', size: 'small' },
    layout: 'stages',
    onScreen: {
      taskLabel: 'The human task',
      roleLabel: 'Ori’s intended role',
      stages: [
        { name: 'Feel it', task: 'Something interests or bothers you.', role: 'Capture the spark with the context you choose to share.' },
        { name: 'Name it', task: 'Put that interest or need into words.', role: 'Ask a useful question; reflect possible meanings.' },
        { name: 'Imagine it', task: 'Work out what an ideal outcome would feel like.', role: 'Explore several useful directions.' },
        { name: 'Shape it', task: 'Turn the desired outcome into a concrete tool or workflow.', role: 'Propose a personal app or adapt an existing one.' },
        { name: 'Build and iterate', task: 'Use it, learn, and change it.', role: 'Support useful actions and revisions while retaining progress.' }
      ],
      loop: 'Using something changes what you want.',
      bottomLine: 'Start wherever you are. Keep growing from there.'
    },
    footer: ['A product framework', 'Not a scientifically validated five-stage model.'],
    spoken: 'We see five stages: feel a spark, name the need, imagine what would help, shape a solution, then build and iterate. You can stall between any two. Ori helps carry the middle, whether you arrive with a plan or just a feeling.',
    cue: 'Arriving with Next reveals the stages one at a time: press Next (→ or Space) for each stage, or Show all five. Pause on the first transition when recalling the friend, then show gaps across the whole path and the return line from stage 5. Do not say most students stall between stages one and two, that Ori completes all five instantly, or that every spark needs an app.',
    appendix: ['stages']
  },
  {
    id: 'bring',
    section: { number: 4, name: 'Solution and demo' },
    headline: 'Bring the spark. We will shape what comes next.',
    seconds: 10,
    companion: { expression: 'Listening', size: 'large' },
    layout: 'bring',
    onScreen: {
      intro: 'A reel. A sentence. A small frustration.',
      scraps: [
        { kind: 'reel', label: 'A reel' },
        { kind: 'sentence', label: 'A sentence', text: 'Notice the light before it goes.' },
        { kind: 'note', label: 'A small frustration', text: 'My walks all blur together.' }
      ],
      clarify: { ask: 'Keep photos, or notice moments?', answer: 'Notice moments.' },
      direction: { label: 'One direction', title: 'A photo-walk journal' },
      lines: ['Keep the context.', 'Explore the possibility.', 'Shape the next step.'],
      areas: ['Companion', 'Playground', 'Your apps'],
      illustrative: 'Illustrative scenario'
    },
    footer: ['Companion → Playground → Your apps', 'Sharing a link or screenshot does not give Ori account access.'],
    spoken: 'Bring a reel, a sentence, or a frustration. Ori keeps the context, asks a useful question, and shapes a next step.',
    cue: 'Give the mood board room to breathe. Three imperfect scraps become one coherent direction, not an instant polished app; one small clarification changes the proposal. Instagram or LinkedIn are places a person might share from; AI conversation context means user-selected, reviewed imports. Native share sheets and background automation are future capabilities.',
    appendix: ['demo']
  },
  {
    id: 'create',
    section: { number: 4, name: 'Solution and demo' },
    headline: 'A saved photo becomes somewhere to begin.',
    seconds: 16,
    companion: { expression: 'Found something', size: 'small' },
    layout: 'demo',
    onScreen: {
      clip: 'create',
      index: 'Light / 01',
      image: 'assets/create.png',
      alt: 'Concept reference: a generated target design of Ori making Light, with illustrative content. Not the product and not a recording.',
      caption: 'A photo and a thought → one detail shaped → Light',
      quote: '“I want to get better at noticing light on my walks.”',
      lines: ['Meet Light: your own photo-walk journal.']
    },
    footer: ['Light / create', 'A real recording in Sample mode. Light is an illustrative scenario, not another interview.'],
    spoken: 'Here’s a recording in Sample mode, with scripted responses. A photo and a thought become Light: Ori suggests a place for it, you shape one detail, and Light opens with your photo in it.',
    cue: 'Press Space (or the play control) as you begin; the 12.8-second recording ends inside the 16 seconds. Say once that this is Sample mode with scripted responses, not live AI. The recording shows a photo and a thought, Ori’s suggestion, a preview with one detail shaped (“Focus on shadows and reflections”), Make mine, and Light opening with the photo. If the clip cannot load, the slot shows a concept reference image: say so and describe the intended experience. Light is an illustrative scenario, not another interview.',
    appendix: ['demo']
  },
  {
    id: 'use-revise',
    section: { number: 4, name: 'Solution and demo' },
    headline: 'Make it useful. Make it yours.',
    seconds: 16,
    companion: { expression: 'Ready', size: 'small' },
    layout: 'demo',
    onScreen: {
      clip: 'revise',
      index: 'Light / 02',
      image: 'assets/revise.png',
      alt: 'Concept reference: a generated target design of revising Light, with illustrative content. Not the product and not a recording.',
      caption: 'Ask → Review → Keep going',
      lines: ['Save an observation.', 'Change what you need.', 'Keep what you have learned.']
    },
    footer: ['Light / use and revise', 'The small loop inside stage 5: the same record before and after the change.'],
    spoken: 'Now use it: save what you noticed. Then ask for a change, camera settings. Review it on your own photo, apply it, and keep going: the same entry, now with new fields.',
    cue: 'Press Space to play (12.8 s). This is stage 5’s small loop, not a new framework: Ask (add camera settings) → Review (the change, shown on your own photo) → Keep going (the same photo and note, now with camera fields). The proof is the same record before and after the change; a new app with seeded data would not show it.',
    appendix: ['demo']
  },
  {
    id: 'reopen',
    section: { number: 4, name: 'Solution and demo' },
    headline: 'Tomorrow, your progress is still here.',
    seconds: 10,
    companion: { expression: 'Ready', size: 'small' },
    layout: 'demo',
    onScreen: {
      clip: 'reopen',
      index: 'Light / 03',
      image: 'assets/home.png',
      alt: 'Concept reference: a generated target design of app icons on a phone, with illustrative content. Not the product, not a recording and not verified device behavior.',
      caption: 'A fresh session opens Light’s own link → the same entry',
      lines: ['Return directly to your app.', 'The same workspace. The same saved progress.']
    },
    footer: ['Light / return', 'A fresh browser session opens Light’s own link. Saved progress and a way back, not a formed habit.'],
    spoken: 'Later, open Light directly by its own link: the same photo, note and settings. A spark you return to.',
    cue: 'Press Space to play (5.2 s). A fresh browser session opens Light by its own link and finds the same photo, note and camera setting. Say “return directly to your app”. There is no home-screen claim: no phone recording shows a home-screen launch. This shows persistence and a way back, not that anyone formed a habit.',
    appendix: ['demo']
  },
  {
    id: 'why',
    section: { number: 5, name: 'Why Ori' },
    headline: 'An app store built around you.',
    seconds: 13,
    companion: { expression: 'Found something', size: 'small' },
    layout: 'why',
    onScreen: {
      flow: ['Your context', 'your workspace', 'your next step'],
      benefits: [
        { title: 'Begin before the brief.', text: 'A vague interest is enough to start exploring.' },
        { title: 'Get an interface that fits.', text: 'A photo gallery, a practice session, a follow-up queue.' },
        { title: 'Keep a growing collection.', text: 'Return to useful tools and adapt them with your progress intact.' }
      ]
    },
    footer: ['Positioning', 'Positioning, not a feature-by-feature comparison.'],
    spoken: 'Our ambition is a personal app store built around you: begin before you have a brief, get an interface that fits, and keep a collection that grows with you.',
    cue: 'Make “AI-native” concrete: less setup, help clarifying a need, a useful interface, retained progress, an easier return. App generation alone is common; our proposed advantage is continuity across the whole journey. Competitors can already build apps and may store data. If asked about a moat: we do not have a proven one (answer in the appendix).',
    appendix: ['positioning']
  },
  {
    id: 'foundation',
    section: { number: 5, name: 'Why Ori' },
    headline: 'Personal experiences. A shared foundation.',
    seconds: 9,
    companion: { expression: 'Thinking', size: 'small' },
    layout: 'foundation',
    onScreen: {
      line: 'Shared capabilities. Distinct personal apps.',
      apps: [
        { app: 'light', name: 'Light', interaction: 'A gallery of observations' },
        { app: 'riff', name: 'Riff', interaction: 'A practice session' },
        { app: 'people', name: 'People', interaction: 'A follow-up queue' }
      ],
      foundationLabel: 'One shared foundation',
      capabilities: ['Useful actions', 'durable records', 'careful revisions']
    },
    footer: ['Architecture approach', 'What counts as implemented rests on current code and a working recording.'],
    spoken: 'Light, Riff and People share one foundation of supported capabilities. The hard rule: a design change must keep your records.',
    cue: 'Light, Riff and People have visibly different central interactions over one shared foundation. Explain feasibility at the level a judge needs; this slide describes the approach, not an audit of the build.',
    appendix: ['demo']
  },
  {
    id: 'gtm',
    section: { number: 6, name: 'Go-to-market' },
    headline: 'Our first distribution channel is a community I already help lead.',
    seconds: 24,
    companion: { expression: 'Listening', size: 'small' },
    layout: 'gtm',
    onScreen: {
      founder: { name: 'Zuyu', role: 'Founder' },
      relationsLabel: 'Founder relationships · proposed invitations',
      relations: [
        { role: 'President, Founders – Illinois Entrepreneurs', enables: 'Direct conversations with student founders and builders; invitations to try Ori in a real workflow.', invitations: 50 },
        { role: 'Project Manager, IBC', enables: 'Access to peers managing projects, relationships and follow-ups.', invitations: 25 },
        { role: 'Hoeft T&M student, bridging Grainger and Gies', enables: 'Relationships across engineering and business; a test of whether Ori works across technical backgrounds.', invitations: 25 },
        { role: 'Friends in OTCR, CUBE, VCA and business fraternities', enables: 'Warm introductions beyond my immediate circles.', invitations: 50 }
      ],
      total: { invitations: 150, label: 'distinct people, deduplicated across organizations' },
      chainLabel: 'How access becomes learning',
      chain: [
        { step: 'Relationships', note: 'make personal onboarding possible' },
        { step: 'Personal onboarding', note: 'we sit beside the first ten sessions' },
        { step: 'Observation', note: 'shows where people stall' },
        { step: 'Product learning', note: 'improves what they use' },
        { step: 'Referrals', note: 'may follow a useful experience' }
      ],
      pilotLabel: 'Proposed pilot targets',
      pilot: [
        { n: 150, label: 'invitations' },
        { n: 50, label: 'enrolled' },
        { n: 30, label: 'later-day useful actions' },
        { n: 15, label: 'week-four active users' }
      ]
    },
    footer: ['Founder-led UIUC pilot', 'Personal access and introductions. No partnerships, member counts or endorsements claimed.'],
    spoken: 'I run Founders at UIUC, am a PM at IBC, and connect engineering and business through T&M. That gives us direct access to our first users. We’ll invite 150 students, onboard 50, and observe the first ten. Before expanding, we’re targeting 30 later-day actions and 15 active users in week four.',
    cue: 'Founder at the centre of real relationships, then the chain: relationships allow personal onboarding; observing the first ten sessions shows where people stall; that learning improves the product; useful experiences may bring referrals. The allocations total 150 distinct people, deduplicated. No logos, member counts, mailing lists, ambassadors, endorsements or agreements. Count meaningful actions (editing or completing a real entry), never app generation or passive opening; all 50 enrolled stay the denominator for activation and week-four use; report trial expiry, paid access and prompted versus unprompted returns alongside week-four use. The first recurring use case is narrow on purpose (students with real follow-ups); discovery did not prove demand for it, and this pilot tests it. Optional context: Pew (2026) found 61% of U.S. adults ages 18–29 have ever used ChatGPT [R3], familiarity with conversational AI, not demand for Ori.',
    appendix: ['gtm', 'sources']
  },
  {
    id: 'roadmap',
    section: { number: 6, name: 'Go-to-market' },
    headline: 'Start at UIUC. Earn the right to expand.',
    seconds: 23,
    companion: { expression: 'Found something', size: 'small' },
    layout: 'roadmap',
    onScreen: {
      sub: 'September 2027 stretch ambition: reach 100,000 people.',
      chart: {
        title: 'Cumulative distinct registered users, month-end',
        flag: 'Stretch targets — not traction',
        max: 100000,
        ticks: [0, 25000, 50000, 75000, 100000],
        points: [
          { month: 'January 2027', short: 'Jan 2027', value: 50, gate: 'Founder-led pilot complete; actual use observed' },
          { month: 'March 2027', short: 'Mar 2027', value: 500, gate: 'Repeatable recruitment within UIUC' },
          { month: 'May 2027', short: 'May 2027', value: 5000, gate: 'The playbook, via student leaders at more campuses' },
          { month: 'July 2027', short: 'Jul 2027', value: 25000, gate: 'Wider campus reach; an early-career channel tested' },
          { month: 'September 2027', short: 'Sep 2027', value: 100000, gate: 'Scale backed by retention, serving capacity and resources' }
        ],
        labelled: [3, 4]
      },
      channelsLabel: 'How the channels branch',
      root: { title: 'UIUC', text: 'Founder-led onboarding' },
      gate: 'Expand only after retention is shown',
      branches: [
        { title: 'Other colleges', text: 'Student hosts run a small trial cohort' },
        { title: 'Young urban professionals', text: 'Starting with UIUC alumni in Chicago' }
      ],
      channelsNote: 'Proposed channels, not partnerships. Gates matter more than geography.',
      yc: { logo: 'assets/yc-logo.png', text: 'Application ambition: YC Summer 2027.', note: 'An ambition only. No acceptance, backing or endorsement implied.' }
    },
    footer: ['Growth roadmap', 'Proposed stretch milestones: not achieved users, a forecast or an approved budget.'],
    spoken: 'After UIUC, we’ll test the playbook through student leaders at other colleges and alumni communities in Chicago. Our stretch ambition is to reach 100,000 people by September 2027, with a Summer YC application along the way. Expansion depends on useful returns, paid conversion, and channels that work beyond my personal network.',
    cue: 'Stretch targets, not traction, a forecast or a budget. The measure is cumulative distinct registered users, not downloads: Ori is web-first, a registration is not a download, and page views, generated apps or extra devices are not people. Burden of proof: 50 in January to 100,000 in September is a 2,000-fold increase in eight months, about 159% compounded monthly growth; the last two months need 75,000 more registrations, about 1,230 a day. My current network cannot deliver that alone: expansion needs channels and resources beyond 150 warm invitations, gated on useful returns, paid conversion, acquisition effort and support cost. Start small at a second campus or alumni group; if behavior weakens outside my network, improve the offer first. YC is an application ambition, not acceptance, backing or endorsement. Summer 2027 is the proposed milestone because it gives time to produce meaningful operating evidence. Winter 2027 is January–March 2027; its regular deadline was November 2, 2026, although late applications were still accepted when checked on November 15, 2026. Winter 2027 does not follow Summer 2027, and no Summer 2027 deadline is stated.',
    appendix: ['roadmap', 'sources']
  },
  {
    id: 'business',
    section: { number: 7, name: 'Business model' },
    headline: 'Experience the value. Return to it. Choose to keep it.',
    seconds: 22,
    companion: { expression: 'Thinking', size: 'small' },
    layout: 'business',
    onScreen: {
      offerLabel: 'Proposed pricing experiment',
      ladder: [
        { label: 'Trial', figure: '14 days', rest: 'free' },
        { label: 'Introductory', figure: '$7.50', unit: '/month', rest: 'for two months' },
        { label: 'Then', figure: '$15', unit: '/month', rest: 'thereafter' }
      ],
      offerNote: 'A free trial, not a free tier.',
      reasonsLabel: 'Why someone would return, and choose to keep it',
      reasons: [
        'A useful app already fits an interest or recurring task.',
        'Personal records make the next visit more valuable.',
        'The workspace can adapt when your needs change.'
      ],
      measureLabel: 'We measure',
      measure: ['Useful return', 'actual paid conversion', 'renewal', 'cost to serve']
    },
    footer: ['Pricing experiment', 'Proposed terms. Billing, conversion, renewal and margins are not yet established.'],
    spoken: 'Every new user gets 14 days to make something useful and come back to it. Then we test seven-fifty a month for two months, followed by fifteen. The reason to pay is a collection that keeps fitting your life. We’ll measure actual conversion, renewal, and the cost of serving both free-trial and paying users.',
    cue: 'The exact ladder: 14 days free, $7.50 a month for two months, then $15 a month. A free trial, not a free tier; proposed terms, not validated willingness to pay; no billing is implemented. The trial aims for one useful app, a real action and a later-day return; upgrading means choosing continued usefulness (“become part of their routine”, never “get users hooked”). No manipulative reminders, hidden charges or locking records to force payment. The measurement strip is a business funnel, not a sixth stage. The claim is “we have designed a measurable business experiment”, not “we already know people will pay”. Economics questions are in the appendix.',
    appendix: ['business']
  },
  {
    id: 'velocity',
    section: { number: 8, name: 'How we used Velocity AI' },
    headline: 'Better assumptions. Sharper behavioral tests.',
    seconds: 30,
    companion: { expression: 'Thinking', size: 'small' },
    layout: 'velocity',
    onScreen: {
      title: 'How we used Velocity AI',
      inputs: 'Four research rounds + a revised hackathon canvas + a final commercial review.',
      headers: ['Assumption we challenged', 'Decision the research shaped'],
      rows: [
        ['Every spark needs a new app.', 'Save, explore, reuse, revise, or create.'],
        ['Generating a screen makes an app useful.', 'Give each activity a real action; distinguish targets from recorded behavior.'],
        ['Changing an app is just changing its appearance.', 'Preserve records and field meaning through revisions and undo.'],
        ['App creation proves demand.', 'Test meaningful return use, payment, and serving costs.']
      ],
      closing: 'From an assumption to a test we can put in front of a person.'
    },
    footer: ['Documented research → product decisions', 'Velocity shaped decisions and tests. People and real use validate behavior.'],
    spoken: 'We used Velocity across four research rounds and a revised hackathon canvas. It helped us choose when to save, reuse, or build; distinguish planned practice from actual practice; and specify revisions that preserve records. Our commercial review sharpened the return-use and payment tests. Velocity helps us get from an assumption to a concrete test, then do what doesn’t scale: sit beside students and observe real behavior.',
    cue: 'Required main-pitch section: keep it on screen and spoken for its full 30 seconds. Say “shaped”, “specified”, “helped us test”; never “Velocity built and validated Ori”. The 12 adversarial cases were proposed, not 12 passed tests. No measured time savings. A next run (Prompt C) is pending and not counted.',
    appendix: ['velocity']
  },
  {
    id: 'ask',
    section: { number: 9, name: 'Ask and close' },
    headline: 'Give the next spark somewhere to grow.',
    seconds: 10,
    companion: { expression: 'Ready', size: 'small' },
    layout: 'ask',
    onScreen: {
      askLabel: 'Our ask · a proposal',
      ask: '$10,000. An eight-week pilot. A reason to return.',
      fundsLabel: 'It funds',
      funds: ['A reliable first-user experience', 'Observed use', 'Introductory payment tests', 'Cost measurement'],
      evidenceLabel: 'The next evidence',
      evidence: ['50 enrolled students', 'Measured activation and week-four use', 'Observed introductory conversion', 'Known costs', 'A small test beyond my closest contacts'],
      notFunded: 'It does not fund or guarantee the 100,000-person ambition.',
      signature: 'Ori. Your phone, your story.'
    },
    footer: ['A planning proposal', 'No investment terms or committed funding implied.'],
    spoken: 'We’re asking for ten thousand dollars: an eight-week pilot with fifty students, observed use, payment tests, real costs. Ori: your phone, your story.',
    cue: 'The $10,000 funds a reliable first-user experience, observed use, introductory payment tests and cost measurement; it does not fund or guarantee the 100,000 ambition. Next evidence: 50 enrolled students; measured activation and week-four use; observed introductory conversion; known costs; a small attempt to recruit beyond my closest contacts. The experiment decides what to improve or stop as well as what to expand. Planning allocation: $4,000 product reliability and device testing, $2,000 AI usage and hosting, $2,000 recruiting and research logistics, $2,000 contingency. For a prize, say “Ten thousand dollars would fund…”. Q&A, answered honestly with nothing invented: who maintains the product, who owns recruitment, what weekly capacity is available, and which commitments would change if YC admission or full-time company work becomes real. Leave this scene up for questions.',
    appendix: ['ask']
  }
];

// Appendix sections the notes can link to (ids match the appendix in index.html).
window.ORI_APPENDIX_SECTIONS = {
  sources: 'Sources and evidence limits',
  discovery: 'Customer discovery, the longer story',
  stages: 'The five stages, complete',
  demo: 'The demo: what the recordings show',
  positioning: 'Positioning and defensibility',
  gtm: 'Founder-led pilot: plan and definitions',
  roadmap: 'Growth roadmap and YC ambition',
  business: 'Business model and economics questions',
  velocity: 'How we used Velocity AI, expanded',
  ask: 'The ask, next evidence and Q&A',
  companion: 'About Ori’s expressions'
};
