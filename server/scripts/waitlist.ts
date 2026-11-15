/**
 * Print the homepage waitlist as CSV (email,source,created_at), oldest first, from the database this
 * environment points at (DATABASE_PATH). On Render: open the service's Shell tab and run `npm run waitlist`;
 * redirect to a file with `npm run waitlist --silent > waitlist.csv` if you like. Read-only.
 */
import { getDb, openDatabase } from '../db/index.ts';

const csv = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

openDatabase();
const rows = getDb().prepare('SELECT email, source, created_at FROM waitlist ORDER BY created_at').all() as {
  email: string;
  source: string;
  created_at: string;
}[];
console.log('email,source,created_at');
for (const r of rows) console.log([r.email, r.source, r.created_at].map(csv).join(','));
console.error(`${rows.length} ${rows.length === 1 ? 'person' : 'people'} on the waitlist`);
