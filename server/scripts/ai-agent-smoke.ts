/**
 * Real-model smoke test for the redesign's model paths: the Agent reply (note + unread link, then a
 * photo), and spec generation for a practice app and a gallery app. Bounded to four calls. Prints
 * route-level outcomes, latencies and the model id; never the key.
 */
import fs from 'node:fs';
import { AnthropicAdapter } from '../model/anthropic.ts';
import { config, resolveModelMode } from '../config.ts';
import { AppSpecSchema } from '../../shared/appSpec.ts';
import { previewRecords } from '../services/previewContent.ts';

if (resolveModelMode() !== 'anthropic') {
  console.log('No ANTHROPIC_API_KEY configured; skipping live agent smoke test.');
  process.exitCode = 2;
} else {
  const adapter = new AnthropicAdapter();
  console.log(`model: ${config.anthropicModel}`);
  const facts = [
    { id: 'f_int1', category: 'interest' as const, value: 'Learning acoustic guitar since August; practising about 30 minutes most evenings', status: 'confirmed' as const },
    { id: 'f_rout1', category: 'routine' as const, value: 'Classes in the morning; free most evenings after 7 pm', status: 'confirmed' as const },
    { id: 'f_int2', category: 'interest' as const, value: 'Street photography on weekend walks; want to get better at using light', status: 'confirmed' as const },
  ];
  const existingApps = [{ id: 'app_board_01', name: 'People to Follow Up With', purpose: 'work', pattern: 'board', capabilities: ['board', 'due_soon', 'summary'] as ('board' | 'due_soon' | 'summary')[] }];

  // 1. Guitar note with a link that was not read.
  let t = Date.now();
  const r1 = await adapter.respondToCapture({
    capture: { id: 'cap_01', kind: 'link', text: 'I like this sound and have 15 minutes to practice. It is a fingerpicked acoustic riff I keep coming back to.', url: 'https://www.instagram.com/reel/abc123/', linkMeta: null, readStatus: 'not_read', sourceLabel: 'Instagram link', image: null },
    facts,
    existingApps,
    recentCaptures: [],
  });
  console.log(`\n[respond: guitar note + unread link] ${Date.now() - t} ms`);
  console.log(`  message: ${r1.data.message}`);
  if (r1.data.question) console.log(`  question: ${r1.data.question}`);
  for (const p of r1.data.proposals) console.log(`  - ${p.kind} | ${p.title} | ${p.pattern} | caps=${p.capabilities.join(',')} | design=${JSON.stringify(p.design ?? null)} | sources=${p.sourceCaptureIds.join(',')} facts=${p.evidenceFactIds.join(',')}${p.explorationSteps ? ` | steps=${p.explorationSteps.length}` : ''}`);
  console.log(`  learned: ${JSON.stringify(r1.data.learned)}`);
  const claimsRead = /watched|listened to the|read the (?:reel|post|page)/i.test(r1.data.message) && !/not|haven't|have not|didn't|did not|can't|cannot/i.test(r1.data.message);
  console.log(`  honesty check (does not claim to have read the link): ${claimsRead ? 'FAIL' : 'ok'}`);

  // 2. Practice app from the new_app proposal with a 15-minute budget.
  const music = r1.data.proposals.find((p) => p.kind === 'new_app') ?? r1.data.proposals[0]!;
  t = Date.now();
  const g1 = await adapter.generateSpec({
    recommendation: music,
    instructions: '',
    facts: facts.map((f) => ({ id: f.id, category: f.category, value: f.value })),
    captures: [{ id: 'cap_01', kind: 'link', text: 'I like this sound and have 15 minutes to practice. It is a fingerpicked acoustic riff I keep coming back to.', url: 'https://www.instagram.com/reel/abc123/', linkMeta: null, readStatus: 'not_read' }],
    choices: { timeBudgetMinutes: 15 },
  });
  const spec1 = g1.data.spec;
  const practice = spec1.views.find((v) => v.type === 'practice');
  console.log(`\n[generateSpec: practice] "${spec1.name}" in ${Date.now() - t} ms; valid=${AppSpecSchema.safeParse(spec1).success}; pattern=${spec1.pattern}; views=${spec1.views.map((v) => v.type).join(',')}; design=${JSON.stringify(spec1.design ?? null)}`);
  console.log(`  practice presets=${practice && practice.type === 'practice' ? practice.presets.join('/') : 'NO PRACTICE VIEW'}; tempo=${practice && practice.type === 'practice' ? practice.tempoHelper : '-'}; fields=${spec1.fields.map((f) => `${f.id}[${f.type}]`).join(' ')}`);
  console.log(`  preview records: ${previewRecords(spec1).length}; description: ${g1.data.description}`);
  if (g1.data.unsupported.length) console.log(`  unsupported: ${JSON.stringify(g1.data.unsupported)}`);

  // 3. A photograph (CC0 example) as a screenshot the model can actually read.
  const img = fs.readFileSync('server/fixtures/media/light-2.jpg').toString('base64');
  t = Date.now();
  const r2 = await adapter.respondToCapture({
    capture: { id: 'cap_02', kind: 'image', text: 'This light. I want more of this in my own photos.', url: null, linkMeta: null, readStatus: 'not_read', sourceLabel: 'Screenshot', image: { mime: 'image/jpeg', base64: img } },
    facts,
    existingApps,
    recentCaptures: [{ id: 'cap_01', kind: 'link', text: 'I like this sound and have 15 minutes to practice.', url: 'https://www.instagram.com/reel/abc123/', createdAt: new Date().toISOString() }],
  });
  console.log(`\n[respond: photo + note] ${Date.now() - t} ms; imageRead=${r2.data.imageRead}`);
  console.log(`  message: ${r2.data.message}`);
  for (const p of r2.data.proposals) console.log(`  - ${p.kind} | ${p.title} | ${p.pattern} | caps=${p.capabilities.join(',')} | design=${JSON.stringify(p.design ?? null)}`);

  // 4. Gallery app from the photo proposal.
  const photo = r2.data.proposals.find((p) => p.kind === 'new_app' && (p.pattern === 'gallery' || p.capabilities.includes('gallery'))) ?? r2.data.proposals.find((p) => p.kind === 'new_app');
  if (photo) {
    t = Date.now();
    const g2 = await adapter.generateSpec({ recommendation: photo, instructions: '', facts: facts.map((f) => ({ id: f.id, category: f.category, value: f.value })), captures: [{ id: 'cap_02', kind: 'image', text: 'This light. I want more of this in my own photos.', url: null, linkMeta: null, readStatus: 'read' }], choices: { look: 'paper' } });
    const spec2 = g2.data.spec;
    const gallery = spec2.views.find((v) => v.type === 'gallery');
    console.log(`\n[generateSpec: gallery] "${spec2.name}" in ${Date.now() - t} ms; valid=${AppSpecSchema.safeParse(spec2).success}; pattern=${spec2.pattern}; views=${spec2.views.map((v) => v.type).join(',')}; galleryView=${Boolean(gallery)}; imageField=${spec2.fields.some((f) => f.type === 'image')}; design=${JSON.stringify(spec2.design ?? null)}`);
    console.log(`  description: ${g2.data.description}`);
  } else {
    console.log('\n[generateSpec: gallery] skipped (no app proposal for the photo)');
  }
  console.log('\nDONE');
}
