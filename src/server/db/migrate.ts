import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Database } from "./index";

/** SQL files in db/migrations, applied in name order, each exactly once. */
export function migrationsDir(): string {
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), "db/migrations");
}

/**
 * Applies pending migrations in one transaction, so a failure leaves the database untouched. On a
 * PostgreSQL server a transaction-scoped advisory lock stops several app servers migrating at once.
 */
export async function migrate(db: Database): Promise<string[]> {
  await db.exec(`create table if not exists schema_migrations (
    version    text primary key,
    applied_at timestamptz not null default now()
  )`);

  return db.transaction(async (tx) => {
    if (db.kind === "postgres") await tx.query("select pg_advisory_xact_lock(727274)");
    const applied = new Set((await tx.query<{ version: string }>("select version from schema_migrations")).map((r) => r.version));
    const pending = readdirSync(migrationsDir())
      .filter((f) => /^\d{4}_[\w-]+\.sql$/.test(f))
      .sort()
      .filter((f) => !applied.has(f));

    for (const file of pending) {
      await tx.exec(readFileSync(path.join(migrationsDir(), file), "utf8"));
      await tx.query("insert into schema_migrations (version) values ($1)", [file]);
      console.info(`[db] applied migration ${file}`);
    }
    return pending;
  });
}
