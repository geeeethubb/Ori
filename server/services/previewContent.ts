/**
 * Example records for previewing an app before it exists. Deterministic, clearly marked (ids start
 * with "example-", image values use the `example:` prefix), never stored. The real renderer shows
 * them with an "Example content" banner so the preview is the actual layout, not a mock.
 */
import type { AppSpec, FieldSpec, ViewSpec } from '../../shared/appSpec.ts';
import { recordMatchesView } from '../../shared/appSpec.ts';
import type { AppRecord, RecordValues } from '../../shared/records.ts';
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

function sampleValue(f: FieldSpec, i: number, today: string): unknown {
  switch (f.type) {
    case 'text':
      return sampleText(f, i);
    case 'long_text':
      return sampleText(f, i);
    case 'date':
      return addDays(today, -i);
    case 'number': {
      if (/minute|min\b|duration/i.test(f.label) || f.unit === 'min') return [15, 12, 20][i % 3];
      if (/tempo|bpm/i.test(f.label) || f.unit === 'bpm') return [72, 80, 66][i % 3];
      const lo = f.min ?? 1;
      const hi = f.max ?? lo + 20;
      return Math.round(lo + ((hi - lo) * ((i % 3) + 1)) / 4);
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
      // Example records must belong to their view.
      if (g.view && !recordMatchesView(g.view, values)) continue;
      const created = new Date(now.getTime() - (i + n) * 86_400_000 - 3_600_000).toISOString();
      out.push({ id: `example-${++n}`, appId: 'example', values, createdAt: created, updatedAt: created });
    }
  }
  return out;
}
