import { describe, it, expect, beforeEach } from "vitest";
import { openDatabase } from "../../../src/storage/db.js";
import {
  createSession,
  getSession,
  listSessions,
  closeSession,
  deleteSession,
} from "../../../src/storage/sessions.js";

describe("sessions storage", () => {
  let db = openDatabase(":memory:");
  beforeEach(() => {
    db = openDatabase(":memory:");
  });

  it("creates and retrieves a session", () => {
    const s = createSession(db, { topic: "auth-refactor", description: "big job" });
    expect(s.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/i);
    expect(s.topic).toBe("auth-refactor");
    expect(s.closed_at).toBeNull();

    const found = getSession(db, s.id);
    expect(found?.topic).toBe("auth-refactor");
  });

  it("rejects duplicate open topic", () => {
    createSession(db, { topic: "t1" });
    expect(() => createSession(db, { topic: "t1" })).toThrow(/open.*already/i);
  });

  it("allows reusing topic after close", () => {
    const a = createSession(db, { topic: "t1" });
    closeSession(db, a.id);
    const b = createSession(db, { topic: "t1" });
    expect(b.id).not.toBe(a.id);
  });

  it("lists open sessions by default, all with flag", () => {
    const a = createSession(db, { topic: "a" });
    const b = createSession(db, { topic: "b" });
    closeSession(db, a.id);
    expect(listSessions(db).map((s) => s.id)).toEqual([b.id]);
    expect(listSessions(db, { all: true }).length).toBe(2);
  });

  it("deleteSession removes the row", () => {
    const s = createSession(db, { topic: "x" });
    deleteSession(db, s.id);
    expect(getSession(db, s.id)).toBeUndefined();
  });
});
