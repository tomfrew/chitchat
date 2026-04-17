import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type Db = Database.Database;

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
  // v4: snapshot sender role on the message row so get_messages returns the role
  // at the time of posting, not the live agents.role (which changes on update_role).
  `ALTER TABLE messages ADD COLUMN sender_role TEXT;`,
];

export function openDatabase(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

function runMigrations(db: Db): void {
  db.exec(`CREATE TABLE IF NOT EXISTS migrations (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`);
  const applied = new Set(
    db.prepare<[], { version: number }>("SELECT version FROM migrations").all().map((r) => r.version),
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
