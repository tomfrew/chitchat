import { describe, it, expect, beforeEach } from "vitest";
import { openDatabase } from "../../../src/storage/db.js";
import { createSession } from "../../../src/storage/sessions.js";
import { createAgent } from "../../../src/storage/agents.js";
import {
  appendMessage,
  getMessages,
  countMessagesAfter,
  latestMessageId,
} from "../../../src/storage/messages.js";

describe("messages storage", () => {
  let db = openDatabase(":memory:");
  let sessionId = "";
  let agentId = "";
  beforeEach(() => {
    db = openDatabase(":memory:");
    sessionId = createSession(db, { topic: "t" }).id;
    agentId = createAgent(db, { session_id: sessionId, name: "Alice", role: "r" }).id;
  });

  it("appends a chat message and returns it", () => {
    const m = appendMessage(db, {
      session_id: sessionId,
      agent_id: agentId,
      kind: "chat",
      body: "hi",
      meta: null,
    });
    expect(m.body).toBe("hi");
    expect(m.kind).toBe("chat");
    expect(m.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/i);
  });

  it("orders by ulid id ascending", () => {
    const a = appendMessage(db, { session_id: sessionId, agent_id: agentId, kind: "chat", body: "1", meta: null });
    const b = appendMessage(db, { session_id: sessionId, agent_id: agentId, kind: "chat", body: "2", meta: null });
    const c = appendMessage(db, { session_id: sessionId, agent_id: agentId, kind: "chat", body: "3", meta: null });
    expect(getMessages(db, sessionId, {}).map((m) => m.id)).toEqual([a.id, b.id, c.id]);
  });

  it("since=X returns messages strictly after X", () => {
    const a = appendMessage(db, { session_id: sessionId, agent_id: agentId, kind: "chat", body: "1", meta: null });
    const b = appendMessage(db, { session_id: sessionId, agent_id: agentId, kind: "chat", body: "2", meta: null });
    const got = getMessages(db, sessionId, { since: a.id });
    expect(got.map((m) => m.body)).toEqual(["2"]);
    expect(got[0].id).toBe(b.id);
  });

  it("before=X returns messages strictly before X, in chronological order, respecting limit", () => {
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) {
      ids.push(
        appendMessage(db, {
          session_id: sessionId,
          agent_id: agentId,
          kind: "chat",
          body: `m${i}`,
          meta: null,
        }).id,
      );
    }
    const got = getMessages(db, sessionId, { before: ids[7], limit: 3 });
    expect(got.map((m) => m.body)).toEqual(["m4", "m5", "m6"]);
  });

  it("respects limit with since", () => {
    for (let i = 0; i < 5; i++) {
      appendMessage(db, {
        session_id: sessionId,
        agent_id: agentId,
        kind: "chat",
        body: `m${i}`,
        meta: null,
      });
    }
    expect(getMessages(db, sessionId, { limit: 2 }).map((m) => m.body)).toEqual(["m0", "m1"]);
  });

  it("countMessagesAfter counts correctly", () => {
    const a = appendMessage(db, { session_id: sessionId, agent_id: agentId, kind: "chat", body: "1", meta: null });
    appendMessage(db, { session_id: sessionId, agent_id: agentId, kind: "chat", body: "2", meta: null });
    appendMessage(db, { session_id: sessionId, agent_id: agentId, kind: "chat", body: "3", meta: null });
    expect(countMessagesAfter(db, sessionId, a.id)).toBe(2);
    expect(countMessagesAfter(db, sessionId, null)).toBe(3);
  });

  it("latestMessageId returns null on empty session, else newest id", () => {
    expect(latestMessageId(db, sessionId)).toBeNull();
    const m = appendMessage(db, {
      session_id: sessionId,
      agent_id: agentId,
      kind: "chat",
      body: "x",
      meta: null,
    });
    expect(latestMessageId(db, sessionId)).toBe(m.id);
  });

  it("round-trips meta JSON", () => {
    appendMessage(db, {
      session_id: sessionId,
      agent_id: agentId,
      kind: "chat",
      body: "x",
      meta: { pr_url: "https://example.com/pr/1", count: 7 },
    });
    const fetched = getMessages(db, sessionId, {})[0];
    expect(fetched.meta).toEqual({ pr_url: "https://example.com/pr/1", count: 7 });
  });
});
