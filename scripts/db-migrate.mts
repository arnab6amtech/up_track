// Applies pending migrations (the app also does this on start-up) and reports the result.
// Usage: npm run db:migrate
import { getDb } from "@/server/db";

const db = await getDb().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
const rows = await db.query<{ version: string }>("select version from schema_migrations order by version");
console.log(`Database (${db.kind}) is at ${rows.at(-1)?.version ?? "no migrations"}.`);
await db.close();
