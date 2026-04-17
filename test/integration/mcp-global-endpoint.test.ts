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

describe("MCP global endpoint (/mcp without session id)", () => {
  let srv: TempServer;
  beforeEach(async () => {
    srv = await startTempServer();
  });
  afterEach(async () => {
    await srv.close();
  });

  it("list_sessions returns open sessions with counts", async () => {
    createSession(srv.db, { topic: "alpha", description: "first" });
    createSession(srv.db, { topic: "beta" });
    const a = await connectMcp(srv.baseUrl);
    const out = await call(a.client, "list_sessions");
    const topics = out.map((s: { topic: string }) => s.topic).sort();
    expect(topics).toEqual(["alpha", "beta"]);
    await a.close();
  });

  it("identify without session rejects with actionable error", async () => {
    createSession(srv.db, { topic: "alpha" });
    const a = await connectMcp(srv.baseUrl);
    await expect(call(a.client, "identify", { role: "r" })).rejects.toThrow(/list_sessions/i);
    await a.close();
  });

  it("identify by topic joins; second agent joins by id", async () => {
    const s = createSession(srv.db, { topic: "alpha" });
    const a = await connectMcp(srv.baseUrl);
    const b = await connectMcp(srv.baseUrl);

    const meA = await call(a.client, "identify", { session: "alpha", role: "frontend" });
    expect(typeof meA.name).toBe("string");
    expect(meA.session_id).toBe(s.id);

    const meB = await call(b.client, "identify", { session: s.id, role: "backend" });
    expect(meB.name).not.toBe(meA.name);

    await call(a.client, "post_message", { body: "hi from alpha" });
    const msgs = await call(b.client, "get_messages");
    expect(msgs[0].body).toBe("hi from alpha");
    await a.close();
    await b.close();
  });

  it("leave leaves the tool surface unchanged (tools are not gated)", async () => {
    createSession(srv.db, { topic: "alpha" });
    const a = await connectMcp(srv.baseUrl);
    await call(a.client, "identify", { session: "alpha", role: "r" });
    const before = (await a.client.listTools()).tools.map((t) => t.name).sort();
    await call(a.client, "leave");
    const after = (await a.client.listTools()).tools.map((t) => t.name).sort();
    expect(after).toEqual(before);
    // But post_message now errors because state was cleared.
    await expect(call(a.client, "post_message", { body: "x" })).rejects.toThrow(/identify first/i);
    await a.close();
  });

  it("pinned URL rejects attempt to identify into a different session", async () => {
    const alpha = createSession(srv.db, { topic: "alpha" });
    createSession(srv.db, { topic: "beta" });
    const a = await connectMcp(srv.baseUrl, alpha.id);
    await expect(
      call(a.client, "identify", { session: "beta", role: "r" }),
    ).rejects.toThrow(/pinned/i);
    await a.close();
  });
});
