/**
 * Seed a clearly labelled SAMPLE demo account:
 *   email demo@aiappstore.local, password = SEED_DEMO_PASSWORD (.env) or demo-pass-2026
 * with the founder-photographer sample context, the redesign's three reference apps (Riff, Light,
 * People) holding realistic example records, four CC0 example photographs copied into the account's
 * own media, two example captures answered by the Sample-mode agent (so the Agent thread has
 * content), and Playground recommendations. Deterministic: no model calls, no network.
 *
 * Idempotent and additive: a second run adds only what is missing and never touches apps, records,
 * captures or photos that already exist. `--reset` removes the demo account (including its media
 * files) first and recreates everything. Never run with --reset against a database you care about.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.ts';
import { getDb, openDatabase } from '../db/index.ts';
import { createUser, findUserByEmail } from '../auth.ts';
import * as apps from '../repos/apps.ts';
import * as captures from '../repos/captures.ts';
import * as ctx from '../repos/context.ts';
import * as media from '../repos/media.ts';
import { fixtureSpec } from '../fixtures/specs.ts';
import { SAMPLE_PROFILES } from '../fixtures/sampleContext.ts';
import { importSource } from '../services/contextImport.ts';
import { sampleAdapter } from '../model/sample/index.ts';
import type { ExistingAppSummary } from '../model/types.ts';
import { capabilitiesOf } from '../../shared/appSpec.ts';
import type { Capture, RecommendationDraft } from '../../shared/context.ts';
import { addDays, todayIso } from '../../shared/time.ts';

export const DEMO_EMAIL = 'demo@aiappstore.local';
const MEDIA_FIXTURES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/media');

type Outcome = 'added' | 'kept';

export interface SeedSummary {
  account: 'created' | 'recreated' | 'kept';
  context: { outcome: Outcome; facts: number };
  apps: { name: string; outcome: Outcome; detail: string }[];
  photosCopied: number;
  captures: { label: string; outcome: Outcome | 'skipped' }[];
  recommendations: { outcome: 'regenerated' | 'kept'; count: number };
}

export interface SeedResult {
  userId: string;
  appIds: Record<string, string>;
  summary: SeedSummary;
}

function iso(daysAgo: number, hour = 10): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function existingApps(ownerId: string): ExistingAppSummary[] {
  return apps.listApps(ownerId).filter((a) => !a.archivedAt).map((a) => ({
    id: a.id, name: a.name, purpose: a.purpose, pattern: a.pattern, tagline: a.tagline ?? undefined, capabilities: a.spec ? capabilitiesOf(a.spec) : [],
  }));
}

/** Create a fixture app when the account has none of that name; fill it when it is empty. */
function ensureApp(ownerId: string, fixture: string, fill: (appId: string) => string): { id: string; name: string; outcome: Outcome; detail: string } {
  const spec = fixtureSpec(fixture);
  if (!spec) throw new Error(`Unknown fixture ${fixture}`);
  const found = apps.listApps(ownerId).find((a) => a.name === spec.name);
  if (found) {
    const detail = found.recordCount === 0 ? fill(found.id) : `${found.recordCount} records kept`;
    return { id: found.id, name: found.name, outcome: 'kept', detail };
  }
  const app = apps.createApp({ ownerId, spec, changeSummary: 'Sample app created by the seed script', origin: 'build', isSample: true });
  return { id: app.id, name: app.name, outcome: 'added', detail: fill(app.id) };
}

/** Riff: three practice sessions and two saved sources (example URLs, titles labelled as examples). */
function fillRiff(ownerId: string, appId: string, today: string): string {
  const rows: [Record<string, unknown>, string][] = [
    [{ kind: 'session', date: addDays(today, -2), minutes: 25, focus: 'Chord changes: G to C without looking', tempo: 60, feel: 3, notes: 'Slow it down with the metronome at 60.' }, iso(2, 21)],
    [{ kind: 'session', date: addDays(today, -1), minutes: 15, focus: 'The fingerpicked intro at half speed, then full', tempo: 72, feel: 4, notes: 'Thumb kept rushing; count out loud.' }, iso(1, 21)],
    [{ kind: 'session', date: today, minutes: 10, focus: 'Warm-up scales and the first verse', tempo: 80, feel: 4, notes: 'Short but clean.' }, iso(0, 8)],
    [{ kind: 'source', date: addDays(today, -3), url: 'https://example.com/lessons/fingerpicking-basics', title: 'Fingerpicking basics (example)', source_note: 'That slow intro pattern', source_kind: 'lesson' }, iso(3, 20)],
    [{ kind: 'source', date: addDays(today, -1), url: 'https://example.com/songs/riverside-riff', title: 'Riverside riff (example)', source_note: 'The open-string drone under the melody', source_kind: 'riff' }, iso(1, 20)],
  ];
  for (const [values, createdAt] of rows) apps.createRecord(ownerId, appId, values, { createdAt });
  return '3 sessions, 2 sources';
}

/** Light: the four CC0 example photographs (server/fixtures/media, see docs/ASSET_SOURCES.md), copied into the account's media. */
const LIGHT_PHOTOS = [
  { file: 'light-1.jpg', daysAgo: 6, caption: 'Sunlight slicing between the houses', note: 'The brightest wall was also the plainest; underexpose a stop and let the shadow side go dark.', light: 'harsh', keeper: false },
  { file: 'light-2.jpg', daysAgo: 4, caption: 'Tree shadows across the pavement', note: 'The shadows carried the picture. The trees themselves did not need to be in it.', light: 'golden', keeper: true },
  { file: 'light-3.jpg', daysAgo: 2, caption: 'A small tree drawn on a brick wall by its own shadow', note: 'Hard afternoon light turns a wall into a canvas. Come back at 3 pm.', light: 'harsh', keeper: false },
  { file: 'light-4.jpg', daysAgo: 0, caption: 'Scaffolding shadows over a facade garden', note: 'Lines on lines. Wait for the light to reach the leaves before pressing the shutter.', light: 'golden', keeper: false },
];

function fillLight(ownerId: string, appId: string, today: string, counters: { photos: number }): string {
  for (const p of LIGHT_PHOTOS) {
    const bytes = fs.readFileSync(path.join(MEDIA_FIXTURES_DIR, p.file));
    const item = media.createMedia(ownerId, new Uint8Array(bytes), 'image/jpeg');
    if ('error' in item) throw new Error(`Could not copy ${p.file} into the demo media: ${item.error}`);
    counters.photos += 1;
    apps.createRecord(
      ownerId, appId,
      { date: addDays(today, -p.daysAgo), photo: item.id, caption: p.caption, note: p.note, light: p.light, location: 'Amsterdam (example photo, CC0)', keeper: p.keeper },
      { createdAt: iso(p.daysAgo, 16) },
    );
  }
  return `${LIGHT_PHOTOS.length} photos, 1 keeper`;
}

/** People: an overdue, a due-today, a due-in-3-days and a done follow-up; one carries a message draft. */
function fillPeople(ownerId: string, appId: string, today: string): string {
  const rows: [Record<string, unknown>, string][] = [
    [{
      person: 'Priya, angel investor from Demo Day', action: 'Send the updated deck and the pilot metrics', due: addDays(today, -2), done: false, channel: 'email',
      context: 'Asked about retention; wants to see week-two numbers.',
      draft: 'Hi Priya, thank you again for the time at Demo Day. The updated deck is attached, with the week-two retention you asked about on slide 4. Happy to walk through it whenever suits you.',
    }, iso(6)],
    [{ person: 'Marcus, mentor from the founder program', action: 'Reply about the design-partner intro he offered', due: today, done: false, channel: 'linkedin', context: 'Monthly coffee chat; he likes short written updates.' }, iso(5)],
    [{ person: 'Lena, met at the photography meetup', action: 'Share the photo walk route and swap film recommendations', due: addDays(today, 3), done: false, channel: 'text', context: 'Shoots street on a Ricoh; also a founder.' }, iso(2)],
    [{ person: 'Sam, startup lawyer', action: 'Confirm the SAFE template questions', due: addDays(today, -5), done: true, channel: 'email', context: 'Answered everything by email.' }, iso(9)],
  ];
  for (const [values, createdAt] of rows) apps.createRecord(ownerId, appId, values, { createdAt });
  return '4 follow-ups (overdue, today, in 3 days, done), 1 draft';
}

/** The media id of one of Light's example photos (for the example photo capture), if any. */
function examplePhotoId(ownerId: string, lightAppId: string): string | null {
  const records = apps.listRecords(ownerId, lightAppId) ?? [];
  const pick = records.find((r) => /brick wall/i.test(String(r.values.caption ?? ''))) ?? records[0];
  const id = pick?.values.photo;
  return typeof id === 'string' && media.getMedia(ownerId, id) ? id : null;
}

/** Answer a capture with the Sample-mode agent and store the reply the way the agent route does. */
async function replyTo(ownerId: string, capture: Capture): Promise<void> {
  const facts = ctx.approvedFacts(ownerId);
  const existing = existingApps(ownerId);
  const recent = captures.listCaptures(ownerId, 6).filter((c) => c.id !== capture.id).map((c) => ({ id: c.id, kind: c.kind, text: c.text, url: c.url, createdAt: c.createdAt }));
  const result = await sampleAdapter.respondToCapture({
    capture: { id: capture.id, kind: capture.kind, text: capture.text, url: capture.url, linkMeta: capture.linkMeta, readStatus: capture.readStatus, sourceLabel: capture.sourceLabel, image: null },
    facts,
    existingApps: existing,
    recentCaptures: recent,
  });
  const allowed = new Set(facts.map((f) => f.id));
  const appIds = new Set(existing.map((a) => a.id));
  const proposals: RecommendationDraft[] = result.data.proposals
    .map((p) => ({
      ...p,
      evidenceFactIds: p.evidenceFactIds.filter((id) => allowed.has(id)),
      sourceCaptureIds: p.sourceCaptureIds.includes(capture.id) ? p.sourceCaptureIds : [capture.id, ...p.sourceCaptureIds].slice(0, 4),
    }))
    .filter((p) => p.kind !== 'update_app' || (p.targetAppId && appIds.has(p.targetAppId)))
    .slice(0, 4);
  if (result.data.learned.length) {
    const source = ctx.createSource(ownerId, { label: capture.sourceLabel, kind: 'capture', text: capture.text || capture.url || '' });
    const known = new Set(ctx.listFacts(ownerId).map((f) => ctx.normalizeFact(f.value)));
    for (const f of result.data.learned.slice(0, 6)) {
      if (known.has(ctx.normalizeFact(f.value))) continue;
      ctx.insertFact(ownerId, { category: f.category, value: f.value, status: f.status, confidence: f.confidence, sourceIds: [source.id], evidence: f.evidence ?? null });
    }
  }
  ctx.insertCaptureProposals(ownerId, capture.id, proposals, 'sample');
  captures.saveReply(ownerId, { captureId: capture.id, message: result.data.message, question: result.data.question ?? null, generatedBy: 'sample' });
}

/** Create an example capture (matched by its text) and its reply when missing. */
async function ensureCapture(ownerId: string, input: captures.NewCapture): Promise<Outcome> {
  const found = captures.listCaptures(ownerId, 1000).find((c) => c.isExample && c.text === input.text);
  if (found) {
    if (!captures.getReply(ownerId, found.id)) await replyTo(ownerId, found);
    return 'kept';
  }
  const capture = captures.createCapture(ownerId, input);
  await replyTo(ownerId, capture);
  return 'added';
}

/** Regenerate the Playground set only when there is none or it is stale against the current facts. */
async function ensureRecommendations(ownerId: string, force: boolean): Promise<SeedSummary['recommendations']> {
  const facts = ctx.approvedFacts(ownerId);
  const hash = ctx.factsHash(facts);
  const fresh = ctx.listRecommendations(ownerId, ['fresh']).filter((r) => !r.captureId);
  if (!force && fresh.length > 0 && fresh.every((r) => r.inputHash === hash)) return { outcome: 'kept', count: fresh.length };
  const recs = await sampleAdapter.recommend({ facts, existingApps: existingApps(ownerId), chosenInterests: [], count: 4 });
  ctx.replaceFreshRecommendations(ownerId, recs.data, 'sample', hash);
  return { outcome: 'regenerated', count: recs.data.length };
}

export async function seedDemo(opts: { reset?: boolean; quiet?: boolean } = {}): Promise<SeedResult> {
  openDatabase();
  const log = (m: string) => { if (!opts.quiet) console.log(m); };

  let user: { id: string } | null = findUserByEmail(DEMO_EMAIL);
  let account: SeedSummary['account'] = 'kept';
  if (user && opts.reset) {
    for (const row of getDb().prepare('SELECT id FROM media WHERE owner_id = ?').all(user.id) as { id: string }[]) media.deleteMedia(user.id, row.id);
    getDb().prepare('DELETE FROM users WHERE id = ?').run(user.id);
    user = null;
    account = 'recreated';
  }
  if (!user) {
    user = createUser({ email: DEMO_EMAIL, password: config.seedDemoPassword, displayName: 'Zuyu (demo)', isSample: true });
    if (account !== 'recreated') account = 'created';
  }
  const userId = user.id;

  // Context (sample-mode extraction keeps seeding deterministic and free).
  const founder = SAMPLE_PROFILES['founder-photographer'];
  let contextOutcome: Outcome = 'kept';
  if (!ctx.listSources(userId).some((s) => s.kind === 'sample' && s.label === founder.label)) {
    await importSource(userId, { label: founder.label, kind: 'sample', text: founder.text }, { forceSample: true });
    contextOutcome = 'added';
  }

  // The three reference apps, each with records that show what the app is for.
  const today = todayIso();
  const counters = { photos: 0 };
  const riff = ensureApp(userId, 'riff-practice', (id) => fillRiff(userId, id, today));
  const light = ensureApp(userId, 'light-gallery', (id) => fillLight(userId, id, today, counters));
  const people = ensureApp(userId, 'people-queue', (id) => fillPeople(userId, id, today));

  // Two example captures with Sample-mode replies and proposals (after the apps exist, so the agent
  // can propose adding to them instead of making duplicates).
  const captureOutcomes: SeedSummary['captures'] = [];
  captureOutcomes.push({
    label: 'guitar note with an unread example link',
    outcome: await ensureCapture(userId, {
      kind: 'link', text: 'I like this sound and have 15 minutes to practice', url: 'https://example.com/reels/fingerpicked-intro', linkMeta: null, mediaId: null,
      readStatus: 'not_read', sourceLabel: 'Example link', isExample: true,
    }),
  });
  const photoId = examplePhotoId(userId, light.id);
  captureOutcomes.push({
    label: 'photo note with an example photo',
    outcome: photoId
      ? await ensureCapture(userId, {
        kind: 'image', text: 'Hard shadows on the brick wall at 3 pm. I want to shoot more harsh midday light.', url: null, linkMeta: null, mediaId: photoId,
        readStatus: 'not_read', sourceLabel: 'Example photo', isExample: true,
      })
      : 'skipped',
  });

  // Playground recommendations grounded in the imported facts, aware of the apps that now exist.
  const recommendations = await ensureRecommendations(userId, account !== 'kept');

  const summary: SeedSummary = {
    account,
    context: { outcome: contextOutcome, facts: ctx.listFacts(userId).length },
    apps: [riff, light, people].map((a) => ({ name: a.name, outcome: a.outcome, detail: a.detail })),
    photosCopied: counters.photos,
    captures: captureOutcomes,
    recommendations,
  };

  log(`Seeded ${DEMO_EMAIL} (account ${account}${account === 'kept' ? '; only missing pieces were added' : ''})`);
  log(`  Context         ${summary.context.outcome}: 1 sample source, ${summary.context.facts} facts`);
  log(`  Apps            ${summary.apps.map((a) => `${a.name} ${a.outcome} (${a.detail})`).join(' | ')}`);
  log(`  Media           ${summary.photosCopied} example photos copied into the demo account (CC0; see docs/ASSET_SOURCES.md)`);
  log(`  Agent thread    ${summary.captures.map((c) => `${c.label}: ${c.outcome}`).join(' | ')}`);
  log(`  Playground      ${summary.recommendations.count} sample recommendations (${summary.recommendations.outcome})`);
  log(`  Sign in         ${DEMO_EMAIL} / ${config.seedDemoPassword === 'demo-pass-2026' ? 'demo-pass-2026' : '(SEED_DEMO_PASSWORD from .env)'}`);

  return { userId, appIds: Object.fromEntries([riff, light, people].map((a) => [a.name, a.id])), summary };
}

const isMain = process.argv[1] && /seed\.ts$/.test(process.argv[1]);
if (isMain) {
  seedDemo({ reset: process.argv.includes('--reset') }).catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
