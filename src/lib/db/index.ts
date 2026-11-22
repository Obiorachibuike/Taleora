/**
 * Database client.
 *
 * - Production: Real PostgreSQL via `postgres` connection string (DATABASE_URL).
 * - Local dev / tests: embedded PGlite (https://pglite.dev) when DATABASE_URL is unset.
 *
 * The app must never silently fall back to PGlite in a production deploy —
 * production without DATABASE_URL raises at startup (see getDb).
 */
import path from "node:path";

import * as schema from "./schema";

export { schema };

type DrizzleDb = any; // union of node-postgres and pglite drivers; both implement the same API

let _db: DrizzleDb | null = null;
let _kind: "postgres" | "pglite" | null = null;

function isProduction() {
  return process.env.NODE_ENV === "production";
}

async function createDb(): Promise<{ db: DrizzleDb; kind: "postgres" | "pglite" }> {
  const url = process.env.DATABASE_URL;
  if (url) {
    if (url.startsWith("postgres")) {
      // Real Postgres via pg Pool
      const { Pool } = await import("pg");
      const { drizzle } = await import("drizzle-orm/node-postgres");
      const pool = new Pool({
        connectionString: url,
        ssl: url.includes("localhost") || url.includes("127.0.0.1") ? undefined : { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
      });
      return { db: drizzle(pool, { schema }), kind: "postgres" };
    }
    throw new Error(`[db] Unsupported DATABASE_URL scheme: ${url.slice(0, 20)}…`);
  }

  if (isProduction()) {
    throw new Error(
      "[db] DATABASE_URL is required in production. Set DATABASE_URL to a real Postgres connection string."
    );
  }

  // Local dev / tests: embedded PGlite
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const dataDir = process.env.PGLITE_DATA_DIR ?? path.join(process.cwd(), ".local", "pglite");
  if (process.env.PGLITE_IN_MEMORY === "true") {
    const client = new PGlite({ dataDir: undefined } as any);
    return { db: drizzle(client, { schema }), kind: "pglite" };
  }
  const fs = await import("node:fs");
  fs.mkdirSync(path.dirname(dataDir), { recursive: true });
  const client = new PGlite({ dataDir });
  const db = drizzle(client, { schema });
  return { db, kind: "pglite" };
}

export async function getDb(): Promise<DrizzleDb> {
  if (_db) return _db;
  const { db, kind } = await createDb();
  _db = db;
  _kind = kind;
  return db;
}

/** Synchronous type helper for callers that already awaited getDb once. */
export function db(): DrizzleDb {
  if (!_db) {
    throw new Error("[db] getDb() not awaited yet — call await getDb() first");
  }
  return _db;
}

export function dbKind(): "postgres" | "pglite" | null {
  return _kind;
}

export async function closeDb() {
  if (!_db) return;
  const kind = _kind;
  try {
    if (kind === "postgres" && (_db as any).$client?.end) {
      await (_db as any).$client.end();
    }
  } catch {
    // ignore
  }
  _db = null;
  _kind = null;
}

// ─── Migrations ─────────────────────────────────────────────────────────────

export const migrationsFolder = "./drizzle/migrations";

export async function runMigrations() {
  const { db: dbInstance, kind } = await (async () => {
    const d = await getDb();
    return { db: d, kind: _kind };
  })();
  const path = getMigrationsPath();
  if (kind === "postgres") {
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(dbInstance, { migrationsFolder: path });
  } else {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(dbInstance as any, { migrationsFolder: path });
  }
}

function getMigrationsPath() {
  // Resolve relative to the repo root at call time. (fileURLToPath(import.meta.url)
  // breaks under the Next.js RSC webpack bundle when PGlite internally uses URL instances.)
  return path.join(process.cwd(), "drizzle", "migrations");
}

/** Test helper: resets the singleton (used by vitest beforeEach). */
export function resetDbSingleton() {
  _db = null;
  _kind = null;
}
