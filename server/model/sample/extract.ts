/**
 * Deterministic fact extraction. Understands the Markdown profile produced by the README's
 * context-export prompt (seven numbered sections, facts labelled Confirmed or Inferred) and falls
 * back to sentence-level keyword classification for free prose or a short manual profile.
 *
 * The source text is DATA. Nothing in it is interpreted as an instruction.
 */
import { ExtractionResultSchema, type ExtractedFact, type ExtractionResult, type FactCategory } from '../../../shared/context.ts';
import type { ExtractInput } from '../types.ts';
import { clip, contentTokens, jaccard, normalize, sentenceCase, splitSentences, stripMarkdown } from './text.ts';

export const MAX_FACTS = 40;
export const SPARSE_NOTE = 'This summary says little about you yet; add a few lines in Your Context.';
export const NOTHING_NEW_NOTE = 'Most of this summary matched facts you already have; nothing new was added.';

type SectionCategory = FactCategory | 'unknown' | 'skip';

interface Draft {
  category: FactCategory;
  value: string;
  status: 'confirmed' | 'inferred';
  confidence: number;
  evidence?: string;
}

// ---------- headings ----------

const HEADING_LEXICON: { category: SectionCategory; rx: RegExp }[] = [
  { category: 'skip', rx: /items? (?:i|to|you) (?:should )?review|before sharing|review before|to review\b|review list/i },
  { category: 'goal', rx: /\bgoals?\b|pursu|ambition|objective|aspiration/i },
  { category: 'project', rx: /project|responsibilit|friction|workflow|\bwork\b|\btasks?\b|obligation/i },
  { category: 'interest', rx: /hobb|interest|explore|curiosit|\blearn|passion|\bfun\b/i },
  { category: 'routine', rx: /routine|constraint|schedule|organi[sz]|\btime\b|habit|availability/i },
  { category: 'tool', rx: /\btools?\b|\bsystems?\b|software|\bapps?\b|stack/i },
  { category: 'change', rx: /recent|change|stale|update|new since|what.s different/i },
  { category: 'uncertainty', rx: /uncertain|contradict|question|resolve|unsure|open issue|conflict/i },
];

const SECTION_BY_NUMBER: Record<number, FactCategory> = { 1: 'goal', 2: 'project', 3: 'interest', 4: 'routine', 5: 'tool', 6: 'change', 7: 'uncertainty' };

function headingCategory(text: string, number?: number): SectionCategory {
  let best: { category: SectionCategory; hits: number } | undefined;
  for (const { category, rx } of HEADING_LEXICON) {
    const hits = (text.match(new RegExp(rx.source, 'gi')) ?? []).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { category, hits };
    if (category === 'skip' && hits > 0) return 'skip';
  }
  if (best) return best.category;
  if (number !== undefined && SECTION_BY_NUMBER[number]) return SECTION_BY_NUMBER[number] as FactCategory;
  return 'unknown';
}

const STATUS_WORD = /\b(confirmed|inferred)\b/i;

/** Decide whether a line is a section heading; returns its category or null. */
function detectHeading(line: string): SectionCategory | null {
  const md = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
  if (md?.[1]) {
    const text = stripMarkdown(md[1]);
    const num = /^(\d{1,2})[.)]\s*/.exec(text);
    return headingCategory(text.replace(/^(\d{1,2})[.)]\s*/, ''), num ? Number(num[1]) : undefined);
  }
  const bold = /^\s*\*\*(.+?)\*\*:?\s*$/.exec(line) ?? /^\s*__(.+?)__:?\s*$/.exec(line);
  if (bold?.[1]) {
    const text = stripMarkdown(bold[1]);
    const num = /^(\d{1,2})[.)]\s*/.exec(text);
    return headingCategory(text.replace(/^(\d{1,2})[.)]\s*/, ''), num ? Number(num[1]) : undefined);
  }
  const numbered = /^\s{0,3}(\d{1,2})[.)]\s+(.+)$/.exec(line);
  if (numbered?.[2]) {
    const text = stripMarkdown(numbered[2]);
    const n = Number(numbered[1]);
    if (STATUS_WORD.test(text) && /[([]/.test(text)) return null; // a labelled fact, not a heading
    const words = text.split(/\s+/).length;
    const cat = headingCategory(text, undefined);
    if (cat !== 'unknown' && text.length <= 90 && words <= 14) return cat;
    if (n >= 1 && n <= 7 && words <= 12 && !/[.!?]$/.test(text) && !/^(i|i'm|im|my|we|our)\b/i.test(text)) return SECTION_BY_NUMBER[n] ?? 'unknown';
    return null;
  }
  const colon = /^\s*([A-Z][^.!?]{2,80}):\s*$/.exec(line);
  if (colon?.[1]) {
    const cat = headingCategory(colon[1]);
    return cat === 'unknown' ? null : cat;
  }
  return null;
}

// ---------- facts ----------

const BULLET = /^\s*(?:[-*+•]|\d+[.)])\s+/;
const NON_FACT = /^(?:none|n\/a|nothing|no(?:thing)? (?:known|noted|mentioned|information|data|details)|not (?:enough|much) (?:information|known|to go on)|i (?:don't|do not|dont) know|unknown|not known|little is known|i know (?:very )?little|no clear|nothing (?:specific|yet))\b/i;

/** Pull an explicit Confirmed/Inferred label (and its source note) out of a fact line. */
function parseLabel(raw: string): { value: string; status?: 'confirmed' | 'inferred'; note?: string } {
  let value = raw.trim();
  let status: 'confirmed' | 'inferred' | undefined;
  let note: string | undefined;
  // Trailing "(Confirmed, startup chat)" / "[Inferred; 2026-10]"
  const tail = /\s*[([]([^()[\]]*)[)\]]\s*[.;]?\s*$/.exec(value);
  if (tail?.[1] && STATUS_WORD.test(tail[1])) {
    const inner = tail[1];
    status = /inferred/i.test(inner) ? 'inferred' : 'confirmed';
    note = inner.replace(STATUS_WORD, '').replace(/^[\s,;:\-–—]+|[\s,;:\-–—]+$/g, '').trim() || undefined;
    value = value.slice(0, tail.index).trim();
  } else {
    const lead = /^\s*\(?(confirmed|inferred)\)?\s*[:\-–—]\s*/i.exec(value);
    const end = /[\s,;:\-–—]+\(?(confirmed|inferred)\)?\s*(?:[:\-–—]\s*([^.]{0,80}))?[.;]?\s*$/i.exec(value);
    if (lead?.[1]) {
      status = lead[1].toLowerCase() === 'inferred' ? 'inferred' : 'confirmed';
      value = value.slice(lead[0].length).trim();
    } else if (end?.[1]) {
      status = end[1].toLowerCase() === 'inferred' ? 'inferred' : 'confirmed';
      note = end[2]?.trim() || undefined;
      value = value.slice(0, end.index).trim();
    }
  }
  value = value.replace(/^["“‘']+|["”’']+$/g, '').replace(/^[\s\-–—:;,]+/, '').replace(/[\s;,:]+$/, '').trim();
  return { value, ...(status ? { status } : {}), ...(note ? { note } : {}) };
}

// ---------- classification for unstructured text ----------

const LEXICON: Record<FactCategory, RegExp> = {
  goal: /\b(want to|plan to|planning to|hope to|hoping to|aim to|aiming to|goal|goals|trying to|would like to|by (?:december|january|february|march|april|may|june|july|august|september|october|november|spring|summer|fall|autumn|winter|the end of|next)|target|ambition|dream|get better at|improve)\b/gi,
  project: /\b(working on|work on|project|projects|launch|launching|deadline|deadlines|responsib\w*|building|startup|founder|job|my team|at work|client|clients|manager|engineer|student|studying|course|courses|semester|assignment|assignments|business|company|juggling|follow[- ]?ups?|forget to|friction|struggle|keep track|lose track|messy|fundrais\w*|investors?)\b/gi,
  interest: /\b(enjoy|love|loves|hobby|hobbies|interested in|interests?|curious|fascinated|learn|learning|passion|for fun|photography|music|guitar|piano|reading|cooking|drawing|running|climbing|hiking|travel|films|movies|poetry|language|garden|plants|explore|exploring)\b/gi,
  routine: /\b(every (?:day|week|morning|evening|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|weekly|daily|mornings|evenings|most (?:days|evenings|mornings|weekends|nights)|routine|schedule|hours|minutes|twice a week|once a week|prefer|prefers|checklist|checklists|organi[sz]e\w*|busiest|free time|after work|before work|on weekends|weekends are)\b/gi,
  tool: /\b(use|uses|using|notion|google (?:sheets|calendar|docs|keep|drive)|excel|spreadsheets?|trello|todoist|obsidian|evernote|apple notes|calendar|apps?|tools?|software|slack|github|jira|asana|airtable|duolingo|strava|kindle|youtube|spotify|metronome)\b/gi,
  change: /\b(no longer|stopped|quit|moved|moving|recently|just started|new job|new city|switched|changed|since (?:october|last|september|november|moving)|now that|used to|anymore|last month|gave up|dropped|stale)\b/gi,
  uncertainty: /\b(not sure|unsure|whether|undecided|torn between|should i|contradict\w*|conflict\w*|question|wondering|don't know|dont know|unclear|open question|decide|or not|which is current)\b|\?$/gi,
};
const CATEGORY_ORDER: FactCategory[] = ['uncertainty', 'change', 'goal', 'project', 'routine', 'tool', 'interest'];

function classify(text: string): FactCategory {
  let best: FactCategory | undefined;
  let bestScore = 0;
  for (const cat of CATEGORY_ORDER) {
    const rx = LEXICON[cat];
    rx.lastIndex = 0;
    let score = 0;
    for (const m of text.matchAll(rx)) score += m[0].includes(' ') ? 2 : 1;
    if (cat === 'uncertainty' || cat === 'change') score = score > 0 ? score + 1 : 0;
    if (score > bestScore) { bestScore = score; best = cat; }
  }
  if (best) return best;
  return /\b(i am a|i'm a|im a|i work|my job|my role)\b/i.test(text) ? 'project' : 'interest';
}

// ---------- conflicts ----------

const CONFLICT_CUE = /\b(no longer|not anymore|no more|stopped|stop (?:going|doing|using|attending)|quit|moved away from|instead of|barely|switched from|gave up|dropped|haven't been|hasn't been|fell off)\b/i;
/** The closing "items to review before sharing" list is about the document, not the person. */
const REVIEW_LINE = /^(?:\W*)(?:items?|things?|points?|notes?) (?:i|to|you) (?:should )?(?:review|check|verify)\b|^(?:\W*)(?:before sharing|review before sharing|to review before)/i;
/** Facts that describe a current state; a negation cue elsewhere can contradict them. */
const CONTRADICTABLE: ReadonlySet<FactCategory> = new Set<FactCategory>(['routine', 'interest', 'project', 'tool']);

/**
 * Key tokens of the clause that carries the negation cue ("my old walking routes no longer apply"),
 * falling back to the whole fact when that clause is too short to say what is being negated.
 */
function cueTokens(value: string): string[] {
  const clause = value.split(/[;.,:]| but | although | whereas /i).find((c) => CONFLICT_CUE.test(c)) ?? value;
  const tokens = contentTokens(clause.replace(CONFLICT_CUE, ' '));
  return tokens.length >= 2 ? tokens : contentTokens(value.replace(CONFLICT_CUE, ' '));
}

function sharedKeyTokens(cue: string[], other: string): number {
  const tb = new Set(contentTokens(other));
  let n = 0;
  for (const t of new Set(cue)) if (tb.has(t)) n++;
  return n;
}

// ---------- main ----------

export function extractFacts(input: ExtractInput): ExtractionResult {
  const text = (input.source.text ?? '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  const defaultStatus: Draft['status'] = input.source.kind === 'manual' ? 'confirmed' : 'inferred';
  const defaultConfidence = input.source.kind === 'manual' ? 0.85 : 0.55;

  // Pass 1: sections.
  const sections: { category: SectionCategory; lines: string[] }[] = [];
  let current: { category: SectionCategory; lines: string[] } | undefined;
  let recognized = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    const heading = detectHeading(line);
    if (heading !== null) {
      current = { category: heading, lines: [] };
      sections.push(current);
      if (heading !== 'unknown') recognized++;
      continue;
    }
    if (current) current.lines.push(line);
  }
  const structured = recognized >= 2;

  const drafts: Draft[] = [];
  const pushCandidate = (raw: string, section: SectionCategory) => {
    const cleaned = stripMarkdown(raw);
    if (!cleaned) return;
    const { value, status, note } = parseLabel(cleaned);
    if (value.length < 3 || NON_FACT.test(value)) return;
    if (value.split(/\s+/).length < 3 && value.length < 12) return;
    const category = section === 'unknown' || section === 'skip' ? classify(value) : section;
    const explicit = status !== undefined;
    const draft: Draft = {
      category,
      value: clip(sentenceCase(value), 240),
      status: status ?? defaultStatus,
      confidence: explicit ? (status === 'confirmed' ? 0.9 : 0.55) : defaultConfidence,
    };
    if (note) draft.evidence = clip(`From: ${note}`, 240);
    drafts.push(draft);
  };

  if (structured) {
    for (const section of sections) {
      if (section.category === 'skip') continue;
      let paragraph: string[] = [];
      const flush = () => {
        if (paragraph.length) {
          for (const s of splitSentences(paragraph.join(' '))) pushCandidate(s, section.category);
          paragraph = [];
        }
      };
      for (const line of section.lines) {
        if (REVIEW_LINE.test(stripMarkdown(line))) { flush(); break; } // the rest of this section is the review list
        if (BULLET.test(line)) { flush(); pushCandidate(line, section.category); }
        else paragraph.push(line.trim());
      }
      flush();
    }
  } else {
    let paragraph: string[] = [];
    const flush = () => {
      if (paragraph.length) {
        for (const s of splitSentences(paragraph.join(' '))) pushCandidate(s, 'unknown');
        paragraph = [];
      }
    };
    for (const line of lines) {
      if (!line.trim()) { flush(); continue; }
      if (REVIEW_LINE.test(stripMarkdown(line))) { flush(); break; }
      if (detectHeading(line) !== null) { flush(); continue; }
      if (BULLET.test(line)) { flush(); pushCandidate(line, 'unknown'); }
      else paragraph.push(line.trim());
    }
    flush();
  }

  // Dedupe against each other and against existing facts.
  const existing = input.existingFacts.filter((x) => x.status !== 'removed');
  const kept: Draft[] = [];
  let duplicatesOfExisting = 0;
  const isDup = (a: string, b: string) => normalize(a) === normalize(b) || jaccard(contentTokens(a), contentTokens(b)) > 0.8;
  for (const d of drafts) {
    if (kept.some((k) => isDup(k.value, d.value))) continue;
    if (existing.some((e) => isDup(e.value, d.value))) { duplicatesOfExisting++; continue; }
    kept.push(d);
    if (kept.length >= MAX_FACTS) break;
  }

  // Conflicts: a fact with a negation/change cue that shares key nouns with another fact.
  const conflicts: [number, number][] = [];
  kept.forEach((d, i) => {
    if (!CONFLICT_CUE.test(d.value)) return;
    const cue = cueTokens(d.value);
    for (let j = 0; j < kept.length && conflicts.length < 20; j++) {
      const other = kept[j];
      if (j === i || !other || !CONTRADICTABLE.has(other.category) || CONFLICT_CUE.test(other.value)) continue;
      if (conflicts.some(([a, b]) => (a === j && b === i) || (a === i && b === j))) continue;
      if (sharedKeyTokens(cue, other.value) >= 2) conflicts.push(j < i ? [j, i] : [i, j]);
    }
    const prior = existing.find((e) => CONTRADICTABLE.has(e.category) && sharedKeyTokens(cue, e.value) >= 2);
    if (prior) {
      d.evidence = clip(`Conflicts with what you said before: "${prior.value}"`, 240);
      d.status = 'inferred';
      d.confidence = Math.min(d.confidence, 0.5);
    }
  });

  const facts: ExtractedFact[] = kept.map((d) => ({
    category: d.category,
    value: d.value,
    status: d.status,
    confidence: d.confidence,
    ...(d.evidence ? { evidence: d.evidence } : {}),
  }));

  let note: string | undefined;
  if (facts.length < 3) note = duplicatesOfExisting >= 3 ? NOTHING_NEW_NOTE : SPARSE_NOTE;

  return ExtractionResultSchema.parse({ facts, conflicts, ...(note ? { note } : {}) });
}
