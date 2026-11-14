/**
 * Seed a clearly labelled SAMPLE demo account:
 *   email demo@aiappstore.local, password = SEED_DEMO_PASSWORD (.env) or demo-pass-2026
 * with the founder-photographer sample context, three sample apps with a few entries, and
 * sample-mode recommendations. Deterministic (no model calls). Re-run with --reset to recreate.
 */
import { config } from '../config.ts';
import { openDatabase, getDb } from '../db/index.ts';
import { createUser, findUserByEmail } from '../auth.ts';
import * as apps from '../repos/apps.ts';
import * as ctx from '../repos/context.ts';
import { fixtureSpec } from '../fixtures/specs.ts';
import { SAMPLE_PROFILES } from '../fixtures/sampleContext.ts';
import { importSource } from '../services/contextImport.ts';
import { sampleAdapter } from '../model/sample/index.ts';
import { addDays, todayIso } from '../../shared/time.ts';

export const DEMO_EMAIL = 'demo@aiappstore.local';

function iso(daysAgo: number, hour = 10): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

export async function seedDemo(opts: { reset?: boolean; quiet?: boolean } = {}): Promise<{ userId: string; appIds: Record<string, string> }> {
  openDatabase();
  const log = (m: string) => { if (!opts.quiet) console.log(m); };
  const existing = findUserByEmail(DEMO_EMAIL);
  if (existing && !opts.reset) {
    log(`Demo account already exists (${DEMO_EMAIL}). Run with --reset to recreate it.`);
    const list = apps.listApps(existing.id);
    return { userId: existing.id, appIds: Object.fromEntries(list.map((a) => [a.name, a.id])) };
  }
  if (existing) {
    getDb().prepare('DELETE FROM users WHERE id = ?').run(existing.id);
    log('Removed the previous demo account and everything it owned.');
  }
  const user = createUser({ email: DEMO_EMAIL, password: config.seedDemoPassword, displayName: 'Zuyu (demo)', isSample: true });
  log(`Created ${DEMO_EMAIL}`);

  // Context (sample-mode extraction keeps seeding deterministic and free).
  const founder = SAMPLE_PROFILES['founder-photographer'];
  const imported = await importSource(user.id, { label: founder.label, kind: 'sample', text: founder.text }, { forceSample: true });
  log(`Imported sample context: ${imported.facts.length} facts`);

  const today = todayIso();
  const appIds: Record<string, string> = {};

  // Photo Walk Journal with two reflections.
  const journal = apps.createApp({ ownerId: user.id, spec: fixtureSpec('photo-walk-journal')!, changeSummary: 'Sample app created by the seed script', origin: 'build', isSample: true });
  appIds[journal.name] = journal.id;
  apps.createRecord(user.id, journal.id, { date: addDays(today, -3), subject: 'Long shadows on the Wabash Ave bridge', location: 'The Loop, Chicago', reflection: 'Underexposing by a stop kept the highlights. Next time get lower for a longer shadow line.', mood: 'curious', keeper: true }, { createdAt: iso(3, 18) });
  apps.createRecord(user.id, journal.id, { date: addDays(today, -1), subject: 'Steam from a food cart against the blue hour', location: 'Logan Square', reflection: 'Waited for a passer-by to cross the light. Patience beats zoom.', mood: 'inspired', keeper: false }, { createdAt: iso(1, 19) });

  // Follow-up board with an overdue, a due-today, a scheduled and a done card.
  const board = apps.createApp({ ownerId: user.id, spec: fixtureSpec('follow-up-board')!, changeSummary: 'Sample app created by the seed script', origin: 'build', isSample: true });
  appIds[board.name] = board.id;
  apps.createRecord(user.id, board.id, { person: 'Priya, angel investor from Demo Day', stage: 'promised', commitment: 'Send the updated deck and the pilot metrics', due: addDays(today, -2), context: 'Asked about retention; wants to see week-two numbers.', channel: 'email' }, { createdAt: iso(6) });
  apps.createRecord(user.id, board.id, { person: 'Marcus, mentor from the founder program', stage: 'waiting', commitment: 'He offered an intro to a design partner', due: today, context: 'Monthly coffee chat; he likes short written updates.', channel: 'linkedin' }, { createdAt: iso(5) });
  apps.createRecord(user.id, board.id, { person: 'Lena, met at the photography meetup', stage: 'met', commitment: 'Share the photo walk route and swap film recs', due: addDays(today, 2), context: 'Shoots street on a Ricoh; also a founder.', channel: 'text' }, { createdAt: iso(2) });
  apps.createRecord(user.id, board.id, { person: 'Sam, startup lawyer', stage: 'done', commitment: 'Confirm SAFE template questions', due: addDays(today, -5), context: 'Answered everything by email.', channel: 'email' }, { createdAt: iso(9) });

  // Practice tracker with three sessions.
  const tracker = apps.createApp({ ownerId: user.id, spec: fixtureSpec('practice-tracker')!, changeSummary: 'Sample app created by the seed script', origin: 'build', isSample: true });
  appIds[tracker.name] = tracker.id;
  apps.createRecord(user.id, tracker.id, { date: addDays(today, -2), minutes: 25, focus: 'Chord changes: G to C without looking', quality: 3, notes: 'Slow it down with the metronome at 60.' }, { createdAt: iso(2, 21) });
  apps.createRecord(user.id, tracker.id, { date: addDays(today, -1), minutes: 30, focus: 'First verse of the song, clean strumming', quality: 4, notes: '' }, { createdAt: iso(1, 21) });
  apps.createRecord(user.id, tracker.id, { date: today, minutes: 15, focus: 'Warm-up scales', quality: 4, notes: 'Short but consistent.' }, { createdAt: iso(0, 8) });

  // Sample-mode recommendations grounded in the imported facts.
  const facts = ctx.approvedFacts(user.id);
  const recs = await sampleAdapter.recommend({ facts, existingApps: [], chosenInterests: [], count: 4 });
  ctx.replaceFreshRecommendations(user.id, recs.data, 'sample', ctx.factsHash(facts));
  log(`Created ${Object.keys(appIds).length} sample apps and ${recs.data.length} sample recommendations`);
  log(`Sign in: ${DEMO_EMAIL} / ${config.seedDemoPassword === 'demo-pass-2026' ? 'demo-pass-2026' : '(SEED_DEMO_PASSWORD from .env)'}`);
  return { userId: user.id, appIds };
}

const isMain = process.argv[1] && /seed\.ts$/.test(process.argv[1]);
if (isMain) {
  seedDemo({ reset: process.argv.includes('--reset') }).catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
