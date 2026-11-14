/**
 * Real-model smoke test for the three generation paths (recommend → generate spec → revise).
 * Spends a few cents. Prints timings and validation results, never the key.
 */
import { AnthropicAdapter } from '../model/anthropic.ts';
import { config, resolveModelMode } from '../config.ts';
import { AppSpecSchema } from '../../shared/appSpec.ts';
import { applyRevision } from '../../shared/revision.ts';

if (resolveModelMode() !== 'anthropic') {
  console.log('No ANTHROPIC_API_KEY configured; skipping live generation smoke test.');
  process.exitCode = 2;
} else {
  const adapter = new AnthropicAdapter();
  console.log(`model: ${config.anthropicModel}`);
  const facts = [
    { id: 'f_goal1', category: 'goal', value: 'Raise a pre-seed round for my startup by spring', status: 'confirmed', confidence: 0.9 },
    { id: 'f_proj1', category: 'project', value: 'After networking events I meet investors and mentors and then forget to follow up', status: 'confirmed', confidence: 0.9 },
    { id: 'f_rout1', category: 'routine', value: 'Weekly founder coffee chats on Thursday mornings', status: 'confirmed', confidence: 0.85 },
    { id: 'f_int1', category: 'interest', value: 'Street photography on weekend walks; want to get better at using light', status: 'confirmed', confidence: 0.9 },
    { id: 'f_int2', category: 'interest', value: 'Recently moved to Chicago and want to explore new neighbourhoods', status: 'inferred', confidence: 0.6 },
    { id: 'f_tool1', category: 'tool', value: 'Uses Notion for notes and Google Calendar; dislikes heavy CRMs', status: 'confirmed', confidence: 0.8 },
    { id: 'f_unc1', category: 'uncertainty', value: 'Not sure whether to keep writing the monthly newsletter', status: 'inferred', confidence: 0.5 },
  ] as const;

  let t = Date.now();
  const recs = await adapter.recommend({ facts: [...facts], existingApps: [], chosenInterests: [], count: 4 });
  console.log(`\n[recommend] ${recs.data.length} recommendations in ${Date.now() - t} ms`);
  for (const r of recs.data) console.log(`  - ${r.title} (${r.purpose}/${r.pattern}) evidence=${r.evidenceFactIds.join(',')}\n      why: ${r.reason}`);
  const work = recs.data.some((r) => r.purpose === 'work');
  const explore = recs.data.some((r) => r.purpose === 'explore');
  console.log(`  mix: work=${work} explore=${explore}`);

  const journalRec = recs.data.find((r) => /photo|walk|light/i.test(r.title)) ?? recs.data.find((r) => r.purpose === 'explore') ?? recs.data[0]!;
  t = Date.now();
  const gen = await adapter.generateSpec({ recommendation: journalRec, instructions: 'Make it a weekly photography challenge and add a place to record what I learned', facts: facts.map((f) => ({ id: f.id, category: f.category, value: f.value })) });
  console.log(`\n[generateSpec] "${gen.data.spec.name}" in ${Date.now() - t} ms; valid=${AppSpecSchema.safeParse(gen.data.spec).success}`);
  console.log(`  fields: ${gen.data.spec.fields.map((f) => `${f.label} [${f.type}]`).join(' | ')}`);
  console.log(`  views: ${gen.data.spec.views.map((v) => v.type).join(', ')}; rules: ${gen.data.spec.rules.map((r) => (r.type === 'prompt_rotation' ? `prompt_rotation(${r.cadence}, ${r.prompts.length})` : `due_soon(${r.withinDays}d)`)).join(', ') || 'none'}`);
  console.log(`  description: ${gen.data.description}`);
  if (gen.data.unsupported.length) console.log(`  unsupported: ${JSON.stringify(gen.data.unsupported)}`);

  t = Date.now();
  const rev = await adapter.proposeRevision({ spec: gen.data.spec, request: 'Add a field for the next experiment I want to try', sampleRecords: [] });
  const applied = applyRevision(gen.data.spec, rev.data.ops);
  console.log(`\n[proposeRevision] in ${Date.now() - t} ms; ops=${rev.data.ops.map((o) => o.op).join(',')}; applies=${applied.ok}`);
  console.log(`  summary: ${rev.data.summary}`);
  console.log(`  changes: ${applied.changes.join(' ')}`);

  t = Date.now();
  const bad = await adapter.proposeRevision({ spec: gen.data.spec, request: 'Change the date field into a number and email me every morning', sampleRecords: [] });
  console.log(`\n[proposeRevision unsupported] in ${Date.now() - t} ms; ops=${bad.data.ops.length}; unsupported=${bad.data.unsupported.length}`);
  for (const u of bad.data.unsupported) console.log(`  - ${u.request} → ${u.reason} / instead: ${u.alternative}`);

  // Work app too: the follow-up board.
  const boardRec = recs.data.find((r) => r.pattern === 'board') ?? recs.data.find((r) => r.purpose === 'work');
  if (boardRec) {
    t = Date.now();
    const b = await adapter.generateSpec({ recommendation: boardRec, instructions: 'Add a due date and highlight overdue items', facts: facts.map((f) => ({ id: f.id, category: f.category, value: f.value })) });
    const boardView = b.data.spec.views.find((v) => v.type === 'board');
    console.log(`\n[generateSpec board] "${b.data.spec.name}" in ${Date.now() - t} ms; valid=${AppSpecSchema.safeParse(b.data.spec).success}; boardView=${Boolean(boardView)}; dueRule=${b.data.spec.rules.some((r) => r.type === 'due_soon')}`);
    console.log(`  fields: ${b.data.spec.fields.map((f) => `${f.label} [${f.type}]`).join(' | ')}`);
  }
  console.log('\nDONE');
}
