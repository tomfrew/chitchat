import { ulid } from "ulid";
import type { Db } from "./db.js";

export interface Session {
  id: string;
  topic: string;
  description: string | null;
  created_at: number;
  closed_at: number | null;
}

export interface CreateSessionInput {
  topic: string;
  description?: string | null;
}

export function createSession(db: Db, input: CreateSessionInput): Session {
  const existing = db
    .prepare<[string], { id: string }>("SELECT id FROM sessions WHERE topic = ? AND closed_at IS NULL")
    .get(input.topic);
  if (existing) throw new Error(`Open session already exists for topic "${input.topic}".`);

  const row: Session = {
    id: ulid(),
    topic: input.topic,
    description: input.description ?? null,
    created_at: Date.now(),
    closed_at: null,
  };
  db.prepare(
    `INSERT INTO sessions (id, topic, description, created_at, closed_at)
     VALUES (@id, @topic, @description, @created_at, @closed_at)`,
  ).run(row);
  return row;
}

export function getSession(db: Db, id: string): Session | undefined {
  return db.prepare<[string], Session>("SELECT * FROM sessions WHERE id = ?").get(id);
}

export function getSessionByTopic(
  db: Db,
  topic: string,
  opts: { includeClosed?: boolean } = {},
): Session | undefined {
  const sql = opts.includeClosed
    ? "SELECT * FROM sessions WHERE topic = ? ORDER BY created_at DESC LIMIT 1"
    : "SELECT * FROM sessions WHERE topic = ? AND closed_at IS NULL";
  return db.prepare<[string], Session>(sql).get(topic);
}

export function listSessions(db: Db, opts: { all?: boolean } = {}): Session[] {
  const sql = opts.all
    ? "SELECT * FROM sessions ORDER BY created_at DESC"
    : "SELECT * FROM sessions WHERE closed_at IS NULL ORDER BY created_at DESC";
  return db.prepare<[], Session>(sql).all();
}

export function closeSession(db: Db, id: string): void {
  const res = db
    .prepare("UPDATE sessions SET closed_at = ? WHERE id = ? AND closed_at IS NULL")
    .run(Date.now(), id);
  if (res.changes === 0) throw new Error(`No open session with id ${id}`);
}

export function deleteSession(db: Db, id: string): void {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
}
