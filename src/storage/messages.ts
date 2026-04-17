import { monotonicFactory } from "ulid";
import type { Db } from "./db.js";

const ulid = monotonicFactory();

export type MessageKind = "chat" | "system";

export interface MessageRow {
  id: string;
  session_id: string;
  agent_id: string | null;
  kind: MessageKind;
  body: string;
  meta: Record<string, unknown> | null;
  created_at: number;
  /** Sender's role snapshotted at post time; null for system messages. */
  sender_role: string | null;
}

export interface AppendMessageInput {
  session_id: string;
  agent_id: string | null;
  kind: MessageKind;
  body: string;
  meta: Record<string, unknown> | null;
  /** Role at post time. Stored verbatim; never re-derived from agents.role. Defaults to null. */
  sender_role?: string | null;
}

interface DbRow extends Omit<MessageRow, "meta"> {
  meta: string | null;
}

function rowToMessage(r: DbRow): MessageRow {
  return { ...r, meta: r.meta ? (JSON.parse(r.meta) as Record<string, unknown>) : null };
}

export function appendMessage(db: Db, input: AppendMessageInput): MessageRow {
  const row: DbRow = {
    id: ulid(),
    session_id: input.session_id,
    agent_id: input.agent_id,
    kind: input.kind,
    body: input.body,
    meta: input.meta ? JSON.stringify(input.meta) : null,
    created_at: Date.now(),
    sender_role: input.sender_role ?? null,
  };
  db.prepare(
    `INSERT INTO messages (id, session_id, agent_id, kind, body, meta, created_at, sender_role)
     VALUES (@id, @session_id, @agent_id, @kind, @body, @meta, @created_at, @sender_role)`,
  ).run(row);
  return rowToMessage(row);
}

export interface GetMessagesOptions {
  since?: string;
  before?: string;
  limit?: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

export function getMessages(db: Db, sessionId: string, opts: GetMessagesOptions): MessageRow[] {
  if (opts.since !== undefined && opts.before !== undefined) {
    throw new Error("getMessages: pass at most one of { since, before }");
  }
  const limit = Math.min(opts.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

  if (opts.before !== undefined) {
    const rows = db
      .prepare<[string, string, number], DbRow>(
        "SELECT * FROM messages WHERE session_id = ? AND id < ? ORDER BY id DESC LIMIT ?",
      )
      .all(sessionId, opts.before, limit)
      .map(rowToMessage)
      .reverse();
    return rows;
  }

  const sinceId = opts.since ?? "";
  return db
    .prepare<[string, string, number], DbRow>(
      "SELECT * FROM messages WHERE session_id = ? AND id > ? ORDER BY id ASC LIMIT ?",
    )
    .all(sessionId, sinceId, limit)
    .map(rowToMessage);
}

export function countMessagesAfter(db: Db, sessionId: string, cursor: string | null): number {
  const row = db
    .prepare<[string, string], { c: number }>(
      "SELECT COUNT(*) AS c FROM messages WHERE session_id = ? AND id > ?",
    )
    .get(sessionId, cursor ?? "");
  return row?.c ?? 0;
}

export function latestMessageId(db: Db, sessionId: string): string | null {
  const row = db
    .prepare<[string], { id: string }>(
      "SELECT id FROM messages WHERE session_id = ? ORDER BY id DESC LIMIT 1",
    )
    .get(sessionId);
  return row?.id ?? null;
}

export interface MessageWithSender extends MessageRow {
  sender_name: string | null;
}

type JoinRow = DbRow & { sender_name: string | null };

function joinRowToMessage(r: JoinRow): MessageWithSender {
  return { ...rowToMessage(r), sender_name: r.sender_name };
}

export function getMessagesWithSender(
  db: Db,
  sessionId: string,
  opts: GetMessagesOptions,
): MessageWithSender[] {
  if (opts.since !== undefined && opts.before !== undefined) {
    throw new Error("getMessagesWithSender: pass at most one of { since, before }");
  }
  const limit = Math.min(opts.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  // sender_role comes from messages.sender_role (snapshot at post time), not agents.role.
  const joinSql = `
    SELECT m.*, a.name AS sender_name
    FROM messages m LEFT JOIN agents a ON a.id = m.agent_id
    WHERE m.session_id = ?`;

  if (opts.before !== undefined) {
    return db
      .prepare<[string, string, number], JoinRow>(
        `${joinSql} AND m.id < ? ORDER BY m.id DESC LIMIT ?`,
      )
      .all(sessionId, opts.before, limit)
      .map(joinRowToMessage)
      .reverse();
  }

  const sinceId = opts.since ?? "";
  return db
    .prepare<[string, string, number], JoinRow>(
      `${joinSql} AND m.id > ? ORDER BY m.id ASC LIMIT ?`,
    )
    .all(sessionId, sinceId, limit)
    .map(joinRowToMessage);
}
