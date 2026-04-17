import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Minimal Statement / Database interface covering the subset used by the
 * storage layer. Intentionally loose on the param/row type parameters so the
 * same code path compiles under both better-sqlite3 and bun:sqlite, whose
 * generic shapes differ.
 */
export interface Statement<R = unknown> {
  run(...args: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  get(...args: unknown[]): R | undefined;
  all(...args: unknown[]): R[];
}

export interface Db {
  prepare<P extends unknown[] = unknown[], R = unknown>(sql: string): Statement<R>;
  exec(sql: string): void;
  close(): void;
}

/**
 * Pick the SQLite driver at module load based on runtime. Bun ships bun:sqlite
 * natively and doesn't support the better-sqlite3 native binary. Node uses
 * better-sqlite3. The driver APIs we touch — prepare, exec, run/get/all with
 * @named or ? params — are compatible across both.
 */
const DatabaseImpl: new (path: string) => Db = await (async () => {
  const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
  if (isBun) {
    // @ts-expect-error bun:sqlite is resolved by Bun at runtime only.
    const mod = await import("bun:sqlite");
    return mod.Database as unknown as new (path: string) => Db;
  }
  const mod = await import("better-sqlite3");
  return mod.default as unknown as new (path: string) => Db;
})();

const MIGRATIONS: string[] = [
  `CREATE TABLE sessions (
    id           TEXT PRIMARY KEY,
    topic        TEXT NOT NULL,
    description  TEXT,
    created_at   INTEGER NOT NULL,
    closed_at    INTEGER
  );
  CREATE UNIQUE INDEX sessions_topic_open
    ON sessions(topic) WHERE closed_at IS NULL;`,
  `CREATE TABLE agents (
    id           TEXT PRIMARY KEY,
    session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    role         TEXT NOT NULL,
    joined_at    INTEGER NOT NULL,
    left_at      INTEGER,
    last_cursor  TEXT
  );
  CREATE UNIQUE INDEX agents_session_name_active
    ON agents(session_id, name) WHERE left_at IS NULL;`,
  `CREATE TABLE messages (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    agent_id    TEXT REFERENCES agents(id),
    kind        TEXT NOT NULL CHECK (kind IN ('chat','system')),
    body        TEXT NOT NULL,
    meta        TEXT,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX messages_session_id ON messages(session_id, id);`,
  `ALTER TABLE messages ADD COLUMN sender_role TEXT;`,
  `ALTER TABLE agents ADD COLUMN persistent_id TEXT;
   CREATE INDEX agents_session_persistent_id
     ON agents(session_id, persistent_id) WHERE persistent_id IS NOT NULL;`,
];

export function openDatabase(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseImpl(path);
  // PRAGMAs via exec work on both drivers; better-sqlite3's db.pragma helper
  // doesn't exist on bun:sqlite.
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  runMigrations(db);
  return db;
}

function runMigrations(db: Db): void {
  db.exec(`CREATE TABLE IF NOT EXISTS migrations (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`);
  const applied = new Set(
    db
      .prepare<[], { version: number }>("SELECT version FROM migrations")
      .all()
      .map((r) => r.version),
  );
  const insert = db.prepare("INSERT INTO migrations (version, applied_at) VALUES (?, ?)");
  for (let i = 0; i < MIGRATIONS.length; i++) {
    const v = i + 1;
    if (applied.has(v)) continue;
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[i]);
      insert.run(v, Date.now());
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}
