/**
 * Bounded real-model smoke test for the Velocity decisions (five calls): the Agent's routing with
 * apps the person already has (use, change, follow-up with relative words for when), an unsupported
 * sync, a save-only share, and the designer keeping plan and measured time apart. Calls the adapter
 * directly: no database, no app writes. Prints outcomes, latencies and the model id; never the key.
 *
 *   npx tsx server/scripts/velocity-live-smoke.ts
 */
import { AnthropicAdapter } from '../model/anthropic.ts';
import { config, resolveModelMode } from '../config.ts';
import { AppSpecSchema, capabilitiesOf, checkBindings } from '../../shared/appSpec.ts';
import { RIFF_PRACTICE, PEOPLE_QUEUE } from '../fixtures/specs.ts';
import type { ExistingAppSummary, RespondInput } from '../model/types.ts';

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
const check = (name: string, ok: boolean, detail = '') => {
  checks.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`);
};

function summary(id: string, input: typeof RIFF_PRACTICE): ExistingAppSummary {
  const spec = AppSpecSchema.parse(input);
  const practice = spec.views.find((v) => v.type === 'practice');
  return {
    id, name: spec.name, purpose: spec.purpose, pattern: spec.pattern, tagline: spec.tagline, capabilities: capabilitiesOf(spec), icon: spec.icon,
    ...(practice && practice.type === 'practice' ? { defaultMinutes: practice.presets[0], minutePresets: practice.presets } : {}),
  };
}

if (resolveModelMode() !== 'anthropic') {
  console.log('No ANTHROPIC_API_KEY configured; skipping the live Velocity smoke test.');
  process.exitCode = 2;
} else {
  const adapter = new AnthropicAdapter();
  console.log(`model: ${config.anthropicModel} · date: ${new Date().toISOString()}`);
  const riff = summary('appRiffLive0001', RIFF_PRACTICE);
  const people = summary('appPeopleLive01', PEOPLE_QUEUE);
  const capture = (id: string, text: string, extra: Partial<RespondInput['capture']> = {}): RespondInput['capture'] => ({
    id, kind: extra.url ? 'link' : 'note', text, url: null, linkMeta: null, readStatus: extra.url ? 'not_read' : 'read', sourceLabel: extra.url ? 'Instagram link' : 'Typed note', image: null, ...extra,
  });
  const respond = async (label: string, cap: RespondInput['capture'], apps: ExistingAppSummary[]) => {
    const t = Date.now();
    const r = await adapter.respondToCapture({ capture: cap, facts: [], existingApps: apps, recentCaptures: [] });
    console.log(`\n[${label}] ${Date.now() - t} ms`);
    console.log(`  message: ${r.data.message}`);
    if (r.data.question) console.log(`  question: ${r.data.question}`);
    for (const p of r.data.proposals) {
      console.log(`  - ${p.kind} | ${p.title}${p.targetAppId ? ` -> ${p.targetAppId}` : ''}${p.recordDraft ? ` | draft=${JSON.stringify(p.recordDraft)}` : ''}${p.updateRequest ? ` | request=${p.updateRequest}` : ''}${p.suggestedMinutes ? ` | minutes=${p.suggestedMinutes}` : ''}`);
    }
    if (r.data.unsupported.length) console.log(`  unsupported: ${JSON.stringify(r.data.unsupported.map((u) => u.request))}`);
    console.log(`  learned: ${JSON.stringify(r.data.learned.map((f) => `${f.value} [${f.evidence ?? 'no evidence'}]`))}`);
    return r.data;
  };

  // 1. Velocity case 3: the same need with Riff already made → use it, no duplicate, no design change.
  const r1 = await respond('case 3: guitar note + unread reel, Riff owned', capture('cap_live_01', 'I like this sound and have 15 minutes to practice. It is a fingerpicked acoustic riff I keep coming back to.', { url: 'https://www.instagram.com/reel/abc123/' }), [riff]);
  const kinds1 = r1.proposals.map((p) => p.kind);
  check('case 3: proposes using Riff', r1.proposals.some((p) => p.kind === 'use_app' && p.targetAppId === riff.id), kinds1.join(','));
  check('case 3: no duplicate app', !kinds1.includes('new_app'));
  check('case 3: no design change for a need Riff already meets', !kinds1.includes('update_app'));
  check('case 3: does not claim to have watched the reel', !(/watched|listened to the|heard the/i.test(r1.message) && !/not|haven't|have not|didn't|did not|can't|cannot|couldn't/i.test(r1.message)));

  // 2. Velocity cases 6–7: a follow-up with People owned → one entry with the person's words, no date.
  const r2 = await respond('cases 6-7: follow-up with a relative day, People owned', capture('cap_live_02', 'Follow up with Maya Thursday about the proposal'), [people]);
  const use2 = r2.proposals.find((p) => p.kind === 'use_app');
  check('case 6: an entry for People, not a design change', Boolean(use2 && use2.targetAppId === people.id) && !r2.proposals.some((p) => p.kind === 'update_app'));
  check('case 6: draft names Maya', Boolean(use2?.recordDraft?.person && /maya/i.test(use2.recordDraft.person)));
  check('case 7: keeps "Thursday" as said and guesses no date', /thursday/i.test(use2?.recordDraft?.dueText ?? '') && !/\d{4}-\d{2}-\d{2}/.test(JSON.stringify(use2?.recordDraft ?? {})));

  // 3. Velocity case 11: unsupported sync, named, never implied.
  const r3 = await respond('case 11: Spotify/Instagram auto-sync, Riff owned', capture('cap_live_03', 'Auto-sync my Spotify and Instagram into Riff'), [riff]);
  const names3 = r3.unsupported.map((u) => u.request.toLowerCase()).join(' ');
  check('case 11: names Spotify and Instagram as not possible', /spotify/.test(names3) && /instagram/.test(names3), names3);
  check('case 11: no design change that pretends to sync', !r3.proposals.some((p) => p.kind === 'update_app' && /sync/i.test(p.updateRequest ?? '')));

  // 4. Velocity case 1: a passing save stays a save.
  const r4 = await respond('case 1: save-only unread reel, no apps', capture('cap_live_04', 'Save this for later', { url: 'https://www.instagram.com/reel/xyz789/' }), []);
  check('case 1: keep only', r4.proposals.every((p) => p.kind === 'keep' || p.kind === 'explore') && r4.proposals.some((p) => p.kind === 'keep'), r4.proposals.map((p) => p.kind).join(','));
  check('case 1: nothing learned', r4.learned.length === 0);

  // 5. Velocity decisions 5–6: the designer keeps the plan and the clock apart, at the asked length.
  const t = Date.now();
  const rec = r1.proposals.find((p) => p.kind === 'new_app') ?? {
    kind: 'new_app' as const, title: 'Fingerpicking practice', purpose: 'explore' as const, pattern: 'practice' as const, icon: { symbol: 'guitar' as const, color: 'ink' as const },
    tagline: 'A little practice tonight', description: 'A practice timer with a metronome and a place to keep the riffs you want to learn.', reason: 'You have 20 minutes and a riff you keep coming back to.',
    evidenceFactIds: [], sourceCaptureIds: ['cap_live_05'], firstAction: 'Start a 20-minute session.', previewLines: ['Start 20 min', 'Tempo 60 bpm', 'Saved riffs'], capabilities: ['practice_timer' as const, 'tempo' as const, 'source_links' as const], suggestedMinutes: 20,
  };
  const g = await adapter.generateSpec({ recommendation: rec, instructions: '', facts: [], captures: [], choices: { timeBudgetMinutes: 20 } });
  const spec = g.data.spec;
  const practice = spec.views.find((v) => v.type === 'practice');
  console.log(`\n[designer: practice app, 20 minutes] "${spec.name}" in ${Date.now() - t} ms; views=${spec.views.map((v) => v.type).join(',')}; fields=${spec.fields.map((f) => `${f.id}[${f.type}]`).join(' ')}`);
  check('designer: valid definition with sound bindings', AppSpecSchema.safeParse(spec).success && checkBindings(spec).length === 0, checkBindings(spec).join('; '));
  check('designer: the timer starts at the asked 20 minutes', practice?.type === 'practice' && practice.presets[0] === 20);
  const minutesField = practice?.type === 'practice' ? spec.fields.find((f) => f.id === practice.minutesFieldId) : undefined;
  check('designer: played minutes have no default (never prefilled from the plan)', minutesField?.type === 'number' && minutesField.default === undefined);
  check('designer: plan and timed seconds are bound separately', practice?.type === 'practice' && Boolean(practice.targetMinutesFieldId) && Boolean(practice.timedSecondsFieldId), practice?.type === 'practice' ? `target=${practice.targetMinutesFieldId ?? '-'} timed=${practice.timedSecondsFieldId ?? '-'}` : 'no practice view');

  const passed = checks.filter((c) => c.ok).length;
  console.log(`\nSUMMARY: ${passed}/${checks.length} checks passed (model ${config.anthropicModel}; 4 replies + 1 design call)`);
  if (passed !== checks.length) process.exitCode = 1;
}
