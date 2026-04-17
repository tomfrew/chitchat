import { afterEach, beforeEach, describe, it, expect } from "bun:test";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { startTempServer, type TempServer } from "../helpers/temp-server.js";
import { createSession } from "../../src/storage/sessions.js";
import { connectMcp } from "../helpers/mcp-test-client.js";

type ToolRes = { content: Array<{ type: string; text: string }> };

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const res = (await client.callTool({ name, arguments: args })) as ToolRes;
  return JSON.parse(res.content[0].text);
}

describe("identity persistence via persistent_id", () => {
  let srv: TempServer;
  beforeEach(async () => {
    srv = await startTempServer();
  });
  afterEach(async () => {
    await srv.close();
  });

  it("revives prior agent on reconnect after leave (same id, same cursor)", async () => {
    const s = createSession(srv.db, { topic: "t" });
    const a1 = await connectMcp(srv.baseUrl, s.id);
    const first = await call(a1.client, "identify", {
      role: "frontend on auth",
      persistent_id: "stable-abc",
    });
    expect(first.reclaim).toBe("none");
    await call(a1.client, "leave");
    await a1.close();

    const a2 = await connectMcp(srv.baseUrl, s.id);
    const second = await call(a2.client, "identify", {
      role: "frontend on auth",
      persistent_id: "stable-abc",
    });
    expect(second.reclaim).toBe("revived");
    expect(second.agent_id).toBe(first.agent_id);
    expect(second.name).toBe(first.name);
    await a2.close();
  });

  it("reuses the same active record on reconnect without requiring leave", async () => {
    // This is the transport-drop case: prior agent row is still marked active
    // because the client couldn't signal leave before the connection died.
    // Reconnecting with the same persistent_id should reuse that record rather
    // than allocate a new one (the old bug produced a 'Zara' when you asked
    // for Fatima).
    const s = createSession(srv.db, { topic: "t" });
    const a1 = await connectMcp(srv.baseUrl, s.id);
    const first = await call(a1.client, "identify", {
      role: "r",
      persistent_id: "p-reuse",
    });
    // Do NOT call leave — simulate the dirty-disconnect case. a1.close just
    // tears down the client transport; the server's agent row stays active.
    await a1.close();

    const a2 = await connectMcp(srv.baseUrl, s.id);
    const second = await call(a2.client, "identify", {
      role: "r",
      persistent_id: "p-reuse",
    });
    expect(second.reclaim).toBe("reused");
    expect(second.agent_id).toBe(first.agent_id);
    expect(second.name).toBe(first.name);
    await a2.close();
  });

  it("reused reconnect does NOT emit a spurious peer_join", async () => {
    // peer_join on reconnect would be a false signal to peers that a new agent
    // joined. For 'reused' reclaims we suppress it entirely.
    const s = createSession(srv.db, { topic: "t" });
    const observer = await connectMcp(srv.baseUrl, s.id);
    await call(observer.client, "identify", { role: "observer" });

    const joins: Array<{ name: string }> = [];
    const unsub = srv.hub.subscribe(s.id, (e) => {
      if (e.type === "peer_join") joins.push({ name: e.name });
    });

    const a1 = await connectMcp(srv.baseUrl, s.id);
    const first = await call(a1.client, "identify", {
      role: "r",
      persistent_id: "p-nojoin",
    });
    await a1.close();
    expect(joins.map((j) => j.name)).toEqual([first.name]);

    const a2 = await connectMcp(srv.baseUrl, s.id);
    const second = await call(a2.client, "identify", {
      role: "r",
      persistent_id: "p-nojoin",
    });
    expect(second.reclaim).toBe("reused");
    // Still only the original peer_join — no duplicate.
    expect(joins.map((j) => j.name)).toEqual([first.name]);

    unsub();
    await observer.close();
    await a2.close();
  });

  it("revived reconnect DOES emit peer_join (they had left)", async () => {
    const s = createSession(srv.db, { topic: "t" });
    const observer = await connectMcp(srv.baseUrl, s.id);
    await call(observer.client, "identify", { role: "observer" });

    const joins: string[] = [];
    const unsub = srv.hub.subscribe(s.id, (e) => {
      if (e.type === "peer_join") joins.push(e.name);
    });

    const a1 = await connectMcp(srv.baseUrl, s.id);
    const first = await call(a1.client, "identify", { role: "r", persistent_id: "p-revive" });
    await call(a1.client, "leave");
    await a1.close();

    const a2 = await connectMcp(srv.baseUrl, s.id);
    await call(a2.client, "identify", { role: "r", persistent_id: "p-revive" });
    expect(joins.filter((n) => n === first.name)).toHaveLength(2);

    unsub();
    await observer.close();
    await a2.close();
  });

  it("first-time join without persistent_id returns reclaim=none", async () => {
    const s = createSession(srv.db, { topic: "t" });
    const a = await connectMcp(srv.baseUrl, s.id);
    const me = await call(a.client, "identify", { role: "r" });
    expect(me.reclaim).toBe("none");
    await a.close();
  });
});
