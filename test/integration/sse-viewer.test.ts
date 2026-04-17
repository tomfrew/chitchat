import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { startTempServer, type TempServer } from "../helpers/temp-server.js";
import { createSession } from "../../src/storage/sessions.js";
import { createAgent } from "../../src/storage/agents.js";
import { appendMessage } from "../../src/storage/messages.js";
import type { HubEvent } from "../../src/hub/events.js";

async function readEvents(url: string, count: number, ms = 400): Promise<string[]> {
  const controller = new AbortController();
  const resp = await fetch(url, { signal: controller.signal });
  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  const events: string[] = [];
  let buf = "";
  const deadline = setTimeout(() => controller.abort(), ms);
  try {
    while (events.length < count) {
      let read;
      try {
        read = await reader.read();
      } catch {
        break; // aborted
      }
      if (read.done) break;
      buf += decoder.decode(read.value);
      let i: number;
      while ((i = buf.indexOf("\n\n")) !== -1) {
        const chunk = buf.slice(0, i);
        buf = buf.slice(i + 2);
        events.push(chunk);
      }
    }
  } finally {
    clearTimeout(deadline);
    controller.abort();
  }
  return events;
}

describe("SSE ?viewer filter", () => {
  let srv: TempServer;
  beforeEach(async () => {
    srv = await startTempServer();
  });
  afterEach(async () => {
    await srv.close();
  });

  it("suppresses message events authored by viewer; emits others", async () => {
    const s = createSession(srv.db, { topic: "t" });
    const alice = createAgent(srv.db, { session_id: s.id, name: "Alice", role: "r" });
    const bob = createAgent(srv.db, { session_id: s.id, name: "Bob", role: "r" });

    // Viewer = Alice. Expect: `ready`, then Bob's event; Alice's should be dropped.
    const p = readEvents(`${srv.baseUrl}/sessions/${s.id}/stream?viewer=${alice.id}`, 2);

    // Give the stream a tick to subscribe.
    await new Promise((r) => setTimeout(r, 50));
    const aliceMsg = appendMessage(srv.db, {
      session_id: s.id,
      agent_id: alice.id,
      kind: "chat",
      body: "from alice",
      meta: null,
      sender_role: "r",
    });
    srv.hub.publish({
      type: "message",
      session_id: s.id,
      message: aliceMsg,
      sender_name: "Alice",
      sender_role: "r",
    });
    const bobMsg = appendMessage(srv.db, {
      session_id: s.id,
      agent_id: bob.id,
      kind: "chat",
      body: "from bob",
      meta: null,
      sender_role: "r",
    });
    srv.hub.publish({
      type: "message",
      session_id: s.id,
      message: bobMsg,
      sender_name: "Bob",
      sender_role: "r",
    } satisfies HubEvent);

    const events = await p;
    const bodies = events.map((e) => e).filter((e) => e.includes("event: message"));
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toContain("from bob");
    expect(bodies[0]).not.toContain("from alice");
  });

  it("suppresses peer_join/leave/role for viewer's own name", async () => {
    const s = createSession(srv.db, { topic: "t" });
    const alice = createAgent(srv.db, { session_id: s.id, name: "Alice", role: "r" });

    const p = readEvents(`${srv.baseUrl}/sessions/${s.id}/stream?viewer=${alice.id}`, 3);

    await new Promise((r) => setTimeout(r, 50));
    srv.hub.publish({ type: "peer_join", session_id: s.id, name: "Alice", role: "r" });
    srv.hub.publish({ type: "role_changed", session_id: s.id, name: "Alice", role: "r2" });
    srv.hub.publish({ type: "peer_join", session_id: s.id, name: "Bob", role: "r" });

    const events = await p;
    const hasAliceJoin = events.some((e) => e.includes("peer_join") && e.includes("Alice"));
    const hasAliceRole = events.some((e) => e.includes("event: role") && e.includes("Alice"));
    const hasBobJoin = events.some((e) => e.includes("peer_join") && e.includes("Bob"));
    expect(hasAliceJoin).toBe(false);
    expect(hasAliceRole).toBe(false);
    expect(hasBobJoin).toBe(true);
  });

  it("no viewer → show everything (human tail behaviour)", async () => {
    const s = createSession(srv.db, { topic: "t" });
    const alice = createAgent(srv.db, { session_id: s.id, name: "Alice", role: "r" });

    const p = readEvents(`${srv.baseUrl}/sessions/${s.id}/stream`, 2);

    await new Promise((r) => setTimeout(r, 50));
    const aliceMsg = appendMessage(srv.db, {
      session_id: s.id,
      agent_id: alice.id,
      kind: "chat",
      body: "hi",
      meta: null,
      sender_role: "r",
    });
    srv.hub.publish({
      type: "message",
      session_id: s.id,
      message: aliceMsg,
      sender_name: "Alice",
      sender_role: "r",
    });

    const events = await p;
    expect(events.some((e) => e.includes("event: message") && e.includes("hi"))).toBe(true);
  });
});
