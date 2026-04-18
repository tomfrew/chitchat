import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Minimal Statement / Database surface the rest of storage/ depends on.
 * Loose generics so SQL row types stay the source of truth.
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

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT PRIMARY KEY,
  topic        TEXT NOT NULL,
  description  TEXT,
  created_at   INTEGER NOT NULL,
  closed_at    INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS sessions_topic_open
  ON sessions(topic) WHERE closed_at IS NULL;

CREATE TABLE IF NOT EXISTS agents (
  id             TEXT PRIMARY KEY,
  session_id     TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  role           TEXT NOT NULL,
  joined_at      INTEGER NOT NULL,
  left_at        INTEGER,
  last_cursor    TEXT,
  persistent_id  TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS agents_session_name_active
  ON agents(session_id, name) WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS agents_session_persistent_id
  ON agents(session_id, persistent_id) WHERE persistent_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS messages (
  id           TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  agent_id     TEXT REFERENCES agents(id),
  kind         TEXT NOT NULL CHECK (kind IN ('chat','system')),
  body         TEXT NOT NULL,
  meta         TEXT,
  created_at   INTEGER NOT NULL,
  sender_role  TEXT
);
CREATE INDEX IF NOT EXISTS messages_session_id ON messages(session_id, id);
`;

// bun:sqlite binds named params by looking up prefixed keys ("@name") on the
// input object, not plain keys. Prefix here so call sites can pass idiomatic rows.
function prefixKeys(arg: unknown): unknown {
  if (arg === null || typeof arg !== "object" || Array.isArray(arg)) return arg;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(arg as Record<string, unknown>)) {
    out[k.startsWith("@") || k.startsWith("$") || k.startsWith(":") ? k : `@${k}`] = v;
  }
  return out;
}

function wrapDatabase(raw: InstanceType<typeof Database>): Db {
  return {
    prepare<P extends unknown[] = unknown[], R = unknown>(sql: string): Statement<R> {
      const stmt = raw.prepare(sql);
      return {
        run: (...args: unknown[]) => stmt.run(...(args.map(prefixKeys) as never[])),
        get: (...args: unknown[]) => stmt.get(...(args.map(prefixKeys) as never[])) as R | null ?? undefined,
        all: (...args: unknown[]) => stmt.all(...(args.map(prefixKeys) as never[])) as R[],
      };
    },
    exec: (sql: string) => raw.exec(sql),
    close: () => raw.close(),
  };
}

export function openDatabase(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const raw = new Database(path);
  raw.exec("PRAGMA journal_mode = WAL");
  raw.exec("PRAGMA foreign_keys = ON");
  raw.exec(SCHEMA);
  return wrapDatabase(raw);
}
