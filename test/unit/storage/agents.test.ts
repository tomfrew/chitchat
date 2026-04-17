import { describe, it, expect, beforeEach } from "vitest";
import { openDatabase } from "../../../src/storage/db.js";
import { createSession } from "../../../src/storage/sessions.js";
import {
  createAgent,
  getAgent,
  listActiveAgents,
  listAllAgents,
  markAgentLeft,
  updateAgentRole,
  setAgentCursor,
  activeNamesInSession,
} from "../../../src/storage/agents.js";

describe("agents storage", () => {
  let db = openDatabase(":memory:");
  let sessionId = "";
  beforeEach(() => {
    db = openDatabase(":memory:");
    sessionId = createSession(db, { topic: "t" }).id;
  });

  it("creates an agent with given name + role", () => {
    const a = createAgent(db, { session_id: sessionId, name: "Alice", role: "frontend" });
    expect(a.name).toBe("Alice");
    expect(a.role).toBe("frontend");
    expect(a.left_at).toBeNull();
    expect(getAgent(db, a.id)?.name).toBe("Alice");
  });

  it("enforces unique (session, name)", () => {
    createAgent(db, { session_id: sessionId, name: "Alice", role: "r" });
    expect(() =>
      createAgent(db, { session_id: sessionId, name: "Alice", role: "r" }),
    ).toThrow();
  });

  it("listActiveAgents excludes left", () => {
    const a = createAgent(db, { session_id: sessionId, name: "Alice", role: "r" });
    createAgent(db, { session_id: sessionId, name: "Bob", role: "r" });
    markAgentLeft(db, a.id);
    expect(listActiveAgents(db, sessionId).map((x) => x.name)).toEqual(["Bob"]);
    expect(listAllAgents(db, sessionId).length).toBe(2);
  });

  it("activeNamesInSession returns currently-held names", () => {
    createAgent(db, { session_id: sessionId, name: "Alice", role: "r" });
    const b = createAgent(db, { session_id: sessionId, name: "Bob", role: "r" });
    markAgentLeft(db, b.id);
    expect(activeNamesInSession(db, sessionId).sort()).toEqual(["Alice"]);
  });

  it("updates role", () => {
    const a = createAgent(db, { session_id: sessionId, name: "Alice", role: "old" });
    updateAgentRole(db, a.id, "new");
    expect(getAgent(db, a.id)?.role).toBe("new");
  });

  it("updates cursor", () => {
    const a = createAgent(db, { session_id: sessionId, name: "Alice", role: "r" });
    setAgentCursor(db, a.id, "01HXYZ");
    expect(getAgent(db, a.id)?.last_cursor).toBe("01HXYZ");
  });
});
