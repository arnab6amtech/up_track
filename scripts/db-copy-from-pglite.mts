// Copies everything in the embedded database (PGlite) into an empty PostgreSQL database: tables, rows,
// migration history. The PGlite folder is copied first and only the copy is read, so the original is
// never changed and the dev server can keep running (anything saved after the copy stays behind).
//
// Usage: DATABASE_URL=postgres://… npm run db:copy-from-pglite [-- path/to/pglite-folder]
// The folder defaults to PGLITE_DIR, else data/pg. The target database must be empty.
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { pgDump } from "@electric-sql/pglite-tools/pg_dump";
import pg from "pg";

const target = process.env.DATABASE_URL?.trim();
if (!target) {
  console.error("Set DATABASE_URL to the PostgreSQL database to copy into.");
  process.exit(1);
}
const source = path.resolve(process.argv[2] ?? (process.env.PGLITE_DIR?.trim() || "data/pg"));
const hidePassword = (url: string) => url.replace(/\/\/([^:/@]+):[^@]*@/, "//$1:***@");

const client = new pg.Client({ connectionString: target });
await client.connect();
const { rows: existing } = await client.query<{ n: number }>(
  "select count(*)::int as n from pg_tables where schemaname = 'public'",
);
if (existing[0].n > 0) {
  console.error(`${hidePassword(target)} already has ${existing[0].n} tables. Copy into an empty database.`);
  process.exit(1);
}

// Work on a snapshot: the app may have the original open, and PGlite allows one process per folder.
const snapshot = mkdtempSync(path.join(tmpdir(), "uptrack-pglite-"));
cpSync(source, snapshot, { recursive: true });
rmSync(path.join(snapshot, ".uptrack.lock"), { force: true });
console.log(`Reading a copy of ${source}…`);
const lite = await PGlite.create(snapshot, { extensions: { citext, pg_trgm } });

const tables = (
  await lite.query<{ name: string }>("select tablename as name from pg_tables where schemaname = 'public' order by tablename")
).rows.map((r) => r.name);
/** Rows per table, one query at a time (a single connection runs one query at once). */
async function countAll(query: (sql: string) => Promise<number>): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const t of tables) counts[t] = await query(`select count(*)::int as n from public.${JSON.stringify(t)}`);
  return counts;
}
const before = await countAll(async (sql) => (await lite.query<{ n: number }>(sql)).rows[0].n);

// INSERT statements rather than COPY blocks, so the dump runs as plain SQL; no owners or grants, so
// everything belongs to the account in DATABASE_URL.
const dump = await pgDump({ pg: lite, args: ["--no-owner", "--no-privileges", "--inserts", "--rows-per-insert=500"] });
await lite.close();
rmSync(snapshot, { recursive: true, force: true });
// Recent pg_dump versions add psql commands (\restrict) that aren't SQL; the server doesn't need them.
const sql = (await dump.text())
  .split("\n")
  .filter((line) => !line.startsWith("\\"))
  .join("\n");

console.log(`Writing ${tables.length} tables into ${hidePassword(target)}…`);
try {
  await client.query("begin");
  await client.query(sql);
  await client.query("commit");
} catch (err) {
  await client.query("rollback").catch(() => {});
  console.error("The copy failed and nothing was written:", (err as Error).message);
  process.exit(1);
}

const after = await countAll(async (q) => (await client.query<{ n: number }>(q)).rows[0].n);
await client.end();
const mismatched = tables.filter((t) => before[t] !== after[t]);
for (const t of tables) console.log(`  ${before[t] === after[t] ? "ok " : "DIFF"} ${t.padEnd(28)} ${String(before[t]).padStart(7)} → ${after[t]}`);
if (mismatched.length) {
  console.error(`Row counts differ in ${mismatched.join(", ")}.`);
  process.exit(1);
}
console.log(`Done: ${Object.values(after).reduce((a, b) => a + b, 0)} rows in ${tables.length} tables. Set DATABASE_URL in .env.local and restart UpTrack.`);
