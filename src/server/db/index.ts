import "server-only";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { migrate, migrationFiles } from "./migrate";

export type Row = Record<string, unknown>;

/** What queries run against: the database itself or a transaction. */
export interface Queryable {
  /** Runs one parameterised statement and returns its rows. */
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
  /** Runs a script of several statements without parameters (migrations). */
  exec(text: string): Promise<void>;
}

export interface Database extends Queryable {
  kind: "postgres" | "pglite";
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

// ---- PostgreSQL server (DATABASE_URL) ----

async function openPostgres(connectionString: string): Promise<Database> {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString, max: Number(process.env.DATABASE_POOL_SIZE ?? 10) });
  const wrap = (q: { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }): Queryable => ({
    query: async <T>(text: string, params?: unknown[]) => (await q.query(text, params)).rows as T[],
    exec: async (text: string) => {
      await q.query(text);
    },
  });
  return {
    kind: "postgres",
    ...wrap(pool),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const result = await fn(wrap(client));
        await client.query("commit");
        return result;
      } catch (err) {
        await client.query("rollback").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

// ---- Embedded PostgreSQL (PGlite) for development and single-server setups ----

function pgliteDir(): string {
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.PGLITE_DIR?.trim() || "data/pg");
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * PGlite keeps the whole database inside one process. Two processes opening the same folder (say the
 * dev server and a script) would corrupt it, so the folder is claimed with a lock file.
 */
function claimPgliteDir(dir: string) {
  mkdirSync(dir, { recursive: true });
  const lock = path.join(dir, ".uptrack.lock");
  if (existsSync(lock)) {
    const pid = Number(readFileSync(lock, "utf8"));
    if (pid && pid !== process.pid && processAlive(pid)) {
      throw new Error(
        `The embedded database in ${dir} is in use by another process (pid ${pid}). ` +
          "Stop the UpTrack server before running scripts, or set DATABASE_URL to use a PostgreSQL server.",
      );
    }
  }
  writeFileSync(lock, String(process.pid));
  const release = () => {
    try {
      if (Number(readFileSync(lock, "utf8")) === process.pid) rmSync(lock);
    } catch {}
  };
  process.once("exit", release);
  return release;
}

async function openPglite(): Promise<Database> {
  const [{ PGlite }, { citext }, { pg_trgm }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("@electric-sql/pglite/contrib/citext"),
    import("@electric-sql/pglite/contrib/pg_trgm"),
  ]);
  const dir = pgliteDir();
  const release = claimPgliteDir(dir);
  const db = await PGlite.create(dir, { extensions: { citext, pg_trgm } });
  return {
    kind: "pglite",
    query: async <T>(text: string, params?: unknown[]) => (await db.query<T>(text, params)).rows,
    exec: async (text: string) => {
      await db.exec(text);
    },
    transaction: (fn) =>
      db.transaction((tx) =>
        fn({
          query: async <T>(text: string, params?: unknown[]) => (await tx.query<T>(text, params)).rows,
          exec: async (text: string) => {
            await tx.exec(text);
          },
        }),
      ),
    async close() {
      await db.close();
      release();
    },
  };
}

// ---- Shared instance ----

const shared = globalThis as typeof globalThis & {
  __uptrackDb?: Promise<Database>;
  /** The migration files the open database was last migrated with. */
  __uptrackMigrated?: string;
  __uptrackMigrating?: Promise<void>;
};

/**
 * Database reads are request-time work: tell Next.js not to try prerendering past this point (the
 * drivers use timers internally, which prerendering rejects). Outside a request (scripts) it's a no-op.
 */
async function atRequestTime() {
  try {
    const { connection } = await import("next/server");
    await connection();
  } catch {
    // Not inside a Next.js request, e.g. a command-line script.
  }
}

/**
 * The app's database, opened and migrated on first use. Kept on globalThis so development hot reloads
 * reuse the same connection pool (and, for PGlite, the same in-process database).
 */
export async function getDb(): Promise<Database> {
  await atRequestTime();
  const db = await openShared();
  if (process.env.NODE_ENV !== "production") await migrateIfChanged(db);
  return db;
}

/**
 * In development the database stays open across code reloads, so a migration added while the dev server
 * runs would otherwise wait for a restart. Apply it as soon as its file appears. (Production servers
 * migrate when they start, which every deploy does.)
 */
async function migrateIfChanged(db: Database) {
  const files = migrationFiles().join(",");
  if (shared.__uptrackMigrated === files) return;
  shared.__uptrackMigrating ??= migrate(db)
    .then(() => {
      shared.__uptrackMigrated = files;
    })
    .finally(() => {
      shared.__uptrackMigrating = undefined;
    });
  await shared.__uptrackMigrating;
}

function openShared(): Promise<Database> {
  shared.__uptrackDb ??= (async () => {
    const url = process.env.DATABASE_URL?.trim();
    const db = url ? await openPostgres(url) : await openPglite();
    await migrate(db);
    shared.__uptrackMigrated = migrationFiles().join(",");
    return db;
  })().catch((err) => {
    shared.__uptrackDb = undefined;
    throw err;
  });
  return shared.__uptrackDb;
}

/**
 * Runs fn in a transaction scoped to one organization. Row-level security policies read
 * app.current_org_id, so when the app connects as a non-owner role it can't touch other tenants.
 */
export async function inOrg<T>(orgId: string, fn: (tx: Queryable) => Promise<T>): Promise<T> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    await tx.query("select set_config('app.current_org_id', $1, true)", [orgId]);
    return fn(tx);
  });
}

/** First row or null. */
export async function one<T = Row>(q: Queryable, text: string, params?: unknown[]): Promise<T | null> {
  return (await q.query<T>(text, params))[0] ?? null;
}
