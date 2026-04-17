import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../../../src/storage/db.js";
import { createSession } from "../../../src/storage/sessions.js";
import { createAgent } from "../../../src/storage/agents.js";

/**
 * Regression guard: the Bun migration dropped the migrations ledger in favour
 * of one consolidated CREATE TABLE IF NOT EXISTS block. That means if someone
 * has an existing DB file on disk from a prior schema, openDatabase silently
 * leaves the old schema in place and the first query against a missing
 * column blows up at runtime (as happened on first live boot post-migration).
 *
 * These tests codify the current behavior: opening a fresh file works; opening
 * a file with a partial/old schema does NOT auto-migrate. The docs + "delete
 * your db to upgrade" flow is the known workaround until we either re-add a
 * migration system or introspect and ALTER TABLE on open.
 */
describe("openDatabase file behaviour", () => {
  it("creates the full schema in a fresh file", () => {
    const dir = mkdtempSync(join(tmpdir(), "chitchat-db-"));
    const path = join(dir, "db.sqlite");
    try {
      const db = openDatabase(path);
      // Every table/column the storage layer expects must be present.
      const s = createSession(db, { topic: "t" });
      const a = createAgent(db, {
        session_id: s.id,
        name: "Alice",
        role: "r",
        persistent_id: "pid-1",
      });
      expect(a.persistent_id).toBe("pid-1");
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails loudly against a file with a stale/partial schema (no auto-migrate)", () => {
    const dir = mkdtempSync(join(tmpdir(), "chitchat-stale-"));
    const path = join(dir, "db.sqlite");
    try {
      // Write a pre-v5 schema directly (no persistent_id column on agents).
      const pre = new Database(path);
      pre.exec(`
        CREATE TABLE sessions (
          id TEXT PRIMARY KEY, topic TEXT NOT NULL, description TEXT,
          created_at INTEGER NOT NULL, closed_at INTEGER
        );
        CREATE TABLE agents (
          id TEXT PRIMARY KEY, session_id TEXT NOT NULL,
          name TEXT NOT NULL, role TEXT NOT NULL, joined_at INTEGER NOT NULL,
          left_at INTEGER, last_cursor TEXT
        );
      `);
      pre.close();

      // openDatabase itself trips: the consolidated schema emits an index on
      // agents(session_id, persistent_id), but the existing `agents` table has
      // no such column, so CREATE INDEX errors — which is exactly what a live
      // daemon saw on startup after the schema-consolidation commit.
      expect(() => openDatabase(path)).toThrow(/persistent_id|no such column/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
