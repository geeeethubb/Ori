/**
 * Example records for previewing an app before it exists. Deterministic, clearly marked (ids start
 * with "example-", image values use the `example:` prefix), never stored. The real renderer shows
 * them with an "Example content" banner so the preview is the actual layout, not a mock.
 */
import type { AppSpec, FieldSpec, ViewSpec } from '../../shared/appSpec.ts';
import { recordMatchesView } from '../../shared/appSpec.ts';
import { validateValues, type AppRecord, type RecordValues } from '../../shared/records.ts';
import { addDays, todayIso } from '../../shared/time.ts';

export const EXAMPLE_IMAGES = ['example:light-1', 'example:light-2', 'example:light-3', 'example:light-4'] as const;

const TEXT_SAMPLES: [RegExp, string[]][] = [
  [/person|who|name|contact/i, ['Maya, met at the design meetup', 'Alex from the founders circle', 'Jamie, old classmate']],
  [/action|promise|commit|next|follow/i, ['Send the demo link', 'Share the article about pricing', 'Plan a coffee next week']],
  [/focus|work(ed)? on|practi[cs]e|song|riff|piece/i, ['The riff at half speed, then full', 'Chord changes without looking', 'Intro of the song, clean strumming']],
  [/caught your eye|subject|title|what/i, ['Low sun on the brick wall by the station', 'Steam from a food cart at blue hour', 'Long shadows across the tram tracks']],
  [/where|location|place/i, ['Logan Square', 'The Loop', 'Along the canal']],
  [/context|notes?|observ|reflect|learn/i, ['Underexposing by a stop kept the highlights. Get lower next time.', 'Patience beat zoom: waited for a passer-by to cross the light.', 'Slow it down with the metronome at 60.']],
  [/url|link|source/i, ['https://example.com/inspiration']],
];

function sampleText(f: FieldSpec, i: number): string {
  for (const [rx, options] of TEXT_SAMPLES) {
    if (rx.test(f.label) || rx.test(f.id)) return options[i % options.length] as string;
  }
  return f.placeholder ?? `${f.label} example ${i + 1}`;
}

type NumberField = Extract<FieldSpec, { type: 'number' }>;

/** A typical value for minutes, tempo or seconds; seconds only by the unit "s" or a plural label, never the ordinal "Second". */
function typicalNumber(f: NumberField, i: number): number | undefined {
  if (/minute|min\b|duration/i.test(f.label) || f.unit === 'min') return [15, 12, 20][i % 3];
  if (/tempo|bpm/i.test(f.label) || f.unit === 'bpm') return [72, 80, 66][i % 3];
  // Seconds are minutes-sized (a timed session) unless the field's own range says otherwise.
  if (/\b(?:seconds|secs)\b/i.test(f.label) || f.unit === 's') return [900, 720, 1200][i % 3];
  return undefined;
}

function sampleValue(f: FieldSpec, i: number, today: string): unknown {
  switch (f.type) {
    case 'text':
      return sampleText(f, i);
    case 'long_text':
      return sampleText(f, i);
    case 'date':
      return addDays(today, -i);
    case 'number': {
      const lo = f.min ?? 1;
      const hi = f.max ?? lo + 20;
      const spread = Math.round(lo + ((hi - lo) * ((i % 3) + 1)) / 4);
      const typical = typicalNumber(f, i);
      const v = typical !== undefined && typical >= (f.min ?? -Infinity) && typical <= (f.max ?? Infinity) ? typical : spread;
      // Always inside the field's own [min, max], so the example would validate as a real value.
      return Math.min(f.max ?? v, Math.max(f.min ?? v, v));
    }
    case 'select':
      return f.options[i % f.options.length]?.value ?? f.default ?? '';
    case 'checkbox':
      return i % 3 === 2;
    case 'rating':
      return Math.min(f.max, 3 + (i % 3));
    case 'url':
      return 'https://example.com/inspiration';
    case 'tags':
      return (f.suggestions ?? ['example']).slice(0, 2);
    case 'image':
      return EXAMPLE_IMAGES[i % EXAMPLE_IMAGES.length];
  }
}

type PracticeView = Extract<ViewSpec, { type: 'practice' }>;

/**
 * Example sessions read like the timer's own records: the plan is one of the view's presets, a timed
 * session never runs past it and its measured seconds match its minutes, and every third one is
 * typed in by hand (no plan, nothing measured). Values the app would refuse (a field's own range or
 * a required field) are not used, so every example still validates as a real record.
 */
function alignPractice(spec: AppSpec, view: PracticeView, values: RecordValues, i: number): void {
  const target = view.targetMinutesFieldId && view.targetMinutesFieldId in values ? view.targetMinutesFieldId : undefined;
  const timed = view.timedSecondsFieldId && view.timedSecondsFieldId in values ? view.timedSecondsFieldId : undefined;
  if (!target && !timed) return;
  const sampled = values[view.minutesFieldId];
  const played = typeof sampled === 'number' && sampled >= 1 ? sampled : 15;
  const presets = [...view.presets].sort((a, b) => a - b);
  const plan = presets.find((p) => p >= played) ?? presets[presets.length - 1] ?? played;
  const minutes = Math.min(played, plan);
  const typedIn: RecordValues = {};
  const measured: RecordValues = {};
  if (view.minutesFieldId in values) measured[view.minutesFieldId] = minutes;
  if (target) {
    typedIn[target] = null;
    measured[target] = plan;
  }
  if (timed) {
    typedIn[timed] = null;
    measured[timed] = minutes * 60;
  }
  for (const patch of i % 3 === 2 ? [typedIn, measured] : [measured]) {
    const { errors } = validateValues(spec, { ...values, ...patch });
    if (Object.keys(patch).some((k) => k in errors)) continue;
    Object.assign(values, patch);
    return;
  }
}

/** Example records that cover every view (a filtered view gets records that match its filter). */
export function previewRecords(spec: AppSpec, perView = 3, now: Date = new Date()): AppRecord[] {
  const today = todayIso(now);
  const out: AppRecord[] = [];
  const seen = new Set<string>();
  const views = spec.views.filter((v) => v.type !== 'summary');
  const groups: { view: ViewSpec | null; filter?: { fieldId: string; value: string } }[] = [];
  for (const v of views) {
    const key = v.filter ? `${v.filter.fieldId}=${v.filter.value}` : '*';
    if (seen.has(key)) continue;
    seen.add(key);
    groups.push({ view: v, filter: v.filter });
  }
  if (!groups.length) groups.push({ view: null });
  let n = 0;
  for (const g of groups) {
    for (let i = 0; i < perView; i++) {
      const values: RecordValues = {};
      for (const f of spec.fields) {
        if (f.hidden) continue;
        values[f.id] = sampleValue(f, i + n, today);
      }
      if (g.filter) values[g.filter.fieldId] = g.filter.value;
      for (const v of spec.views) if (v.type === 'practice' && recordMatchesView(v, values)) alignPractice(spec, v, values, i);
      // Example records must belong to their view.
      if (g.view && !recordMatchesView(g.view, values)) continue;
      const created = new Date(now.getTime() - (i + n) * 86_400_000 - 3_600_000).toISOString();
      out.push({ id: `example-${++n}`, appId: 'example', values, createdAt: created, updatedAt: created });
    }
  }
  return out;
}
