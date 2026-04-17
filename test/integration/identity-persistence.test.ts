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

  it("reclaims the same name on reconnect with the same persistent_id", async () => {
    const s = createSession(srv.db, { topic: "t" });

    const a1 = await connectMcp(srv.baseUrl, s.id);
    const first = await call(a1.client, "identify", {
      role: "frontend on auth",
      persistent_id: "stable-abc",
    });
    const originalName = first.name;
    await call(a1.client, "leave");
    await a1.close();

    const a2 = await connectMcp(srv.baseUrl, s.id);
    const second = await call(a2.client, "identify", {
      role: "frontend on auth",
      persistent_id: "stable-abc",
    });
    expect(second.name).toBe(originalName);
    expect(second.name_reclaimed).toBe(true);
    await a2.close();
  });

  it("reclaim works even when another agent briefly held the slot", async () => {
    // Three-way: a1 joins → leaves. filler joins (takes a1's name). filler
    // leaves. a1 reconnects with same persistent_id — name is now free again
    // and gets reclaimed.
    const s = createSession(srv.db, { topic: "t" });

    const a1 = await connectMcp(srv.baseUrl, s.id);
    const first = await call(a1.client, "identify", {
      role: "r",
      persistent_id: "pid-A",
    });
    await call(a1.client, "leave");
    await a1.close();

    const filler = await connectMcp(srv.baseUrl, s.id);
    await call(filler.client, "identify", { role: "r" });
    await call(filler.client, "leave");
    await filler.close();

    const a2 = await connectMcp(srv.baseUrl, s.id);
    const second = await call(a2.client, "identify", {
      role: "r",
      persistent_id: "pid-A",
    });
    expect(second.name).toBe(first.name);
    expect(second.name_reclaimed).toBe(true);
    await a2.close();
  });

  it("without persistent_id, reconnecting agents may get a different name", async () => {
    const s = createSession(srv.db, { topic: "t" });
    const a1 = await connectMcp(srv.baseUrl, s.id);
    const first = await call(a1.client, "identify", { role: "r" });
    await call(a1.client, "leave");
    await a1.close();

    // Second agent reconnects without persistent_id. With no reclaim signal, pool
    // pick runs — the seeded shuffle gives some deterministic name, which MAY
    // or may not match the first. We only assert `name_reclaimed` is false.
    const a2 = await connectMcp(srv.baseUrl, s.id);
    const second = await call(a2.client, "identify", { role: "r" });
    expect(second.name_reclaimed).toBe(false);
    // Sanity: both were the session's first-picked name, so they SHOULD match
    // under seeded shuffle + empty-active pool. Document that.
    expect(second.name).toBe(first.name);
    await a2.close();
  });

  it("name reclaim fails gracefully when the name is still held", async () => {
    const s = createSession(srv.db, { topic: "t" });
    const a = await connectMcp(srv.baseUrl, s.id);
    const me = await call(a.client, "identify", {
      role: "r",
      persistent_id: "pid-1",
    });

    // Second agent uses the SAME persistent_id but the first agent hasn't left.
    const b = await connectMcp(srv.baseUrl, s.id);
    const other = await call(b.client, "identify", {
      role: "r",
      persistent_id: "pid-1",
    });
    expect(other.name).not.toBe(me.name);
    expect(other.name_reclaimed).toBe(false);
    await a.close();
    await b.close();
  });

  // NOTE: we deliberately don't test raw-socket-drop-marks-left here.
  // The MCP SDK's server transport only fires onclose on explicit
  // transport.close() or a client-sent DELETE — not on underlying socket
  // drop. The mcp.ts onclose handler is still useful (it runs on explicit
  // leave and server shutdown), but catching dirty disconnects requires
  // heartbeat/timeout logic that's out of scope for v0.1.
});
