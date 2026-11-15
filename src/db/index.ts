import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { migrate } from "drizzle-orm/sqlite-proxy/migrator";
import { sql } from "drizzle-orm";
import * as schema from "@/db/schema";

const databaseUrl = process.env.DATABASE_URL || "file:./dev.db";

if (!databaseUrl.startsWith("file:")) {
  throw new Error("DATABASE_URL must use the SQLite file: protocol, for example file:./dev.db");
}

const databasePath = databaseUrl.slice("file:".length).split("?")[0] || "./dev.db";

const globalForDb = globalThis as typeof globalThis & {
  __multiAgentSqlite?: DatabaseSync;
};

const sqlite =
  globalForDb.__multiAgentSqlite ??
  new DatabaseSync(databasePath, {
    timeout: 5000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__multiAgentSqlite = sqlite;
}

export const db = drizzle(
  async (query, params, method) => {
    const statement = sqlite.prepare(query);

    if (method === "run") {
      statement.run(...params);
      return { rows: [] };
    }

    if (method === "get") {
      const row = statement.get(...params);
      return { rows: row ? [Object.values(row)] : [] };
    }

    const rows = statement.all(...params);
    return {
      rows: rows.map((row) => Object.values(row)),
    };
  },
  { schema },
);

const migrationsFolder = process.env.DRIZZLE_MIGRATIONS_DIR || path.join(process.cwd(), "drizzle");

let migrationsDone = false;

export async function runMigrations() {
  if (migrationsDone) return;

  await migrate(
    db,
    async (migrationQueries) => {
      for (const query of migrationQueries) {
        sqlite.exec(query);
      }
    },
    { migrationsFolder },
  );

  migrationsDone = true;
}

export { sqlite, sql };

// Audit M9: several code paths open a manual BEGIN IMMEDIATE on the shared
// connection. Two concurrent requests used to hit "cannot start a transaction
// within a transaction" and could roll back each other's work. The queue keeps
// those critical sections strictly sequential.
let writeQueue: Promise<unknown> = Promise.resolve();

export function withSqliteTransaction<T>(work: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(async () => {
    sqlite.exec("BEGIN IMMEDIATE");
    try {
      const result = await work();
      sqlite.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        sqlite.exec("ROLLBACK");
      } catch {
        // No active transaction: nothing to roll back.
      }
      throw error;
    }
  });
  writeQueue = run.catch(() => undefined);
  return run;
}
