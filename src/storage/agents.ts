import { ulid } from "ulid";
import type { Db } from "./db.js";

export interface Agent {
  id: string;
  session_id: string;
  name: string;
  role: string;
  joined_at: number;
  left_at: number | null;
  last_cursor: string | null;
  persistent_id: string | null;
}

export interface CreateAgentInput {
  session_id: string;
  name: string;
  role: string;
  persistent_id?: string | null;
}

export function createAgent(db: Db, input: CreateAgentInput): Agent {
  const row: Agent = {
    id: ulid(),
    session_id: input.session_id,
    name: input.name,
    role: input.role,
    joined_at: Date.now(),
    left_at: null,
    last_cursor: null,
    persistent_id: input.persistent_id ?? null,
  };
  db.prepare(
    `INSERT INTO agents (id, session_id, name, role, joined_at, left_at, last_cursor, persistent_id)
     VALUES (@id, @session_id, @name, @role, @joined_at, @left_at, @last_cursor, @persistent_id)`,
  ).run(row);
  return row;
}

/**
 * Find the most-recent prior agent in a session with the given persistent_id.
 * Used at identify to reclaim the name the agent had before.
 */
export function findAgentByPersistentId(
  db: Db,
  sessionId: string,
  persistentId: string,
): Agent | undefined {
  return db
    .prepare<[string, string], Agent>(
      `SELECT * FROM agents
       WHERE session_id = ? AND persistent_id = ?
       ORDER BY joined_at DESC LIMIT 1`,
    )
    .get(sessionId, persistentId);
}

export function getAgent(db: Db, id: string): Agent | undefined {
  return db.prepare<[string], Agent>("SELECT * FROM agents WHERE id = ?").get(id);
}

export function listActiveAgents(db: Db, sessionId: string): Agent[] {
  return db
    .prepare<[string], Agent>(
      "SELECT * FROM agents WHERE session_id = ? AND left_at IS NULL ORDER BY joined_at",
    )
    .all(sessionId);
}

export function listAllAgents(db: Db, sessionId: string): Agent[] {
  return db
    .prepare<[string], Agent>("SELECT * FROM agents WHERE session_id = ? ORDER BY joined_at")
    .all(sessionId);
}

export function markAgentLeft(db: Db, id: string): void {
  db.prepare("UPDATE agents SET left_at = ? WHERE id = ? AND left_at IS NULL").run(Date.now(), id);
}

export function updateAgentRole(db: Db, id: string, role: string): void {
  db.prepare("UPDATE agents SET role = ? WHERE id = ?").run(role, id);
}

export function setAgentCursor(db: Db, id: string, cursor: string): void {
  db.prepare("UPDATE agents SET last_cursor = ? WHERE id = ?").run(cursor, id);
}

/**
 * Clear left_at and update role in one step. Used when an agent reconnects
 * with a persistent_id that matches a prior record in this session — we want
 * to reuse the same agent row (and therefore the same name + cursor) rather
 * than allocate a new one.
 */
export function reviveAgent(db: Db, id: string, role: string): void {
  db.prepare("UPDATE agents SET left_at = NULL, role = ? WHERE id = ?").run(role, id);
}

export function activeNamesInSession(db: Db, sessionId: string): string[] {
  return db
    .prepare<[string], { name: string }>(
      "SELECT name FROM agents WHERE session_id = ? AND left_at IS NULL",
    )
    .all(sessionId)
    .map((r) => r.name);
}
