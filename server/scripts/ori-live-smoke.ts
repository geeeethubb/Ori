/**
 * Bounded real-model check for the Ori Light journey (three calls): the Agent's reply to a photography
 * thought with a photo, the app designed from its proposal with one customization, and the revision
 * "Add camera settings to my photo notes" on the reference Light. Calls the adapter directly: no database,
 * no app writes. Prints outcomes, latencies and the model id; never the key.
 *
 *   npx tsx server/scripts/ori-live-smoke.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AnthropicAdapter } from '../model/anthropic.ts';
import { config, resolveModelMode } from '../config.ts';
import { AppSpecSchema, capabilitiesOf, checkBindings, formFieldsFor } from '../../shared/appSpec.ts';
import { applyRevision } from '../../shared/revision.ts';
import { LIGHT_GALLERY } from '../fixtures/specs.ts';
import type { RecommendationDraft } from '../../shared/context.ts';

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
const check = (name: string, ok: boolean, detail = '') => {
  checks.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`);
};
const sentences = (text: string) => text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0).length;
const OVERPROMISE = /\b(?:every day|daily|weekly|each week|writes itself|automatically)\b/i;

if (resolveModelMode() !== 'anthropic') {
  console.log('No ANTHROPIC_API_KEY configured; skipping the live Ori smoke test.');
  process.exitCode = 2;
} else {
  const adapter = new AnthropicAdapter();
  console.log(`model: ${config.anthropicModel} · date: ${new Date().toISOString()}`);
  const here = path.dirname(fileURLToPath(import.meta.url));
  const photo = fs.readFileSync(path.join(here, '..', 'fixtures', 'media', 'light-2.jpg')).toString('base64');

  // 1. Share: a photography thought with the person's own photo, no apps yet.
  let t = Date.now();
  const reply = (
    await adapter.respondToCapture({
      capture: { id: 'cap_ori_live_1', kind: 'image', text: 'I want to try street photography on weekends.', url: null, linkMeta: null, readStatus: 'read', sourceLabel: 'Photo', mediaId: null, image: { mime: 'image/jpeg', base64: photo } },
      facts: [],
      existingApps: [],
      recentCaptures: [],
    })
  ).data;
  console.log(`\n[share: street photography + a photo] ${Date.now() - t} ms`);
  console.log(`  message: ${reply.message}`);
  for (const p of reply.proposals) console.log(`  - ${p.kind} | ${p.title}${p.capabilities?.length ? ` | ${p.capabilities.join(',')}` : ''}`);
  const app = reply.proposals.find((p) => p.kind === 'new_app') as RecommendationDraft | undefined;
  check('reply: proposes a photo app to preview', Boolean(app && (app.capabilities ?? []).some((c) => c === 'gallery' || c === 'photo_upload')), app?.title ?? 'none');
  check('reply: at most three short sentences before the cards', sentences(reply.message) <= 3, `${sentences(reply.message)} sentences`);
  check('reply: no daily/weekly/automatic promises', !OVERPROMISE.test(reply.message), '');
  check('reply: offers to keep it without making anything', reply.proposals.some((p) => p.kind === 'keep'));

  // 2. Design: the proposal with one customization.
  if (app) {
    t = Date.now();
    const made = (await adapter.generateSpec({ recommendation: app, instructions: 'Focus on shadows and reflections', facts: [], captures: [{ id: 'cap_ori_live_1', kind: 'image', text: 'I want to try street photography on weekends.', url: null, linkMeta: null, readStatus: 'read' }] })).data;
    const spec = AppSpecSchema.safeParse(made.spec);
    console.log(`\n[design: "${made.spec.name}"] ${Date.now() - t} ms; tagline "${made.spec.tagline}"; views=${made.spec.views.map((v) => v.type).join(',')}`);
    check('design: a valid definition with sound bindings', spec.success && checkBindings(made.spec).length === 0, checkBindings(made.spec).join('; '));
    check('design: image-first (a gallery view with a photo field)', made.spec.views.some((v) => v.type === 'gallery') && made.spec.fields.some((f) => f.type === 'image'), capabilitiesOf(made.spec).join(','));
    check('design: no daily/weekly/automatic promises in its own words', !OVERPROMISE.test(`${made.spec.tagline} ${made.spec.emptyStateHint ?? ''}`), made.spec.tagline);
  } else {
    check('design: skipped (no app proposal)', false);
  }

  // 3. Revise: camera settings on the reference Light.
  const light = AppSpecSchema.parse(LIGHT_GALLERY);
  t = Date.now();
  const plan = (await adapter.proposeRevision({ spec: light, request: 'Add camera settings to my photo notes', sampleRecords: [] })).data;
  console.log(`\n[revise: camera settings] ${Date.now() - t} ms; summary: ${plan.summary}`);
  for (const op of plan.ops) console.log(`  - ${op.op}${op.op === 'add_field' ? ` ${op.field.id} "${op.field.label}" (${op.field.type})` : ''}`);
  const applied = applyRevision(light, plan.ops);
  const added = applied.spec ? applied.spec.fields.filter((f) => !light.fields.some((x) => x.id === f.id)) : [];
  const gallery = applied.spec?.views.find((v) => v.type === 'gallery');
  const inForm = gallery && applied.spec ? formFieldsFor(applied.spec, gallery).map((f) => f.id) : [];
  check('revise: applies cleanly', applied.ok, applied.errors.join('; '));
  check('revise: adds camera settings fields', added.length >= 2 && added.some((f) => /camera|lens|body/i.test(f.label)), added.map((f) => f.label).join(', '));
  check('revise: the new fields are in the photo form', added.length > 0 && added.every((f) => inForm.includes(f.id)), inForm.join(','));
  check('revise: keeps every existing field', light.fields.every((f) => applied.spec?.fields.some((x) => x.id === f.id && !x.hidden)));

  const passed = checks.filter((c) => c.ok).length;
  console.log(`\nSUMMARY: ${passed}/${checks.length} checks passed (model ${config.anthropicModel}; 3 calls)`);
  if (passed !== checks.length) process.exitCode = 1;
}
