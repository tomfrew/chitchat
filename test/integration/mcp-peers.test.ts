import { afterEach, beforeEach, describe, it, expect } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { startTempServer, type TempServer } from "../helpers/temp-server.js";
import { createSession } from "../../src/storage/sessions.js";
import { connectMcp } from "../helpers/mcp-test-client.js";

type ToolRes = { content: Array<{ type: string; text: string }> };

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const res = (await client.callTool({ name, arguments: args })) as ToolRes;
  return JSON.parse(res.content[0].text);
}

describe("MCP peers", () => {
  let srv: TempServer;
  beforeEach(async () => {
    srv = await startTempServer();
  });
  afterEach(async () => {
    await srv.close();
  });

  it("list_peers shows the other agent but not self", async () => {
    const s = createSession(srv.db, { topic: "t" });
    const a = await connectMcp(srv.baseUrl, s.id);
    const b = await connectMcp(srv.baseUrl, s.id);
    const meA = await call(a.client, "identify", { role: "frontend" });
    const meB = await call(b.client, "identify", { role: "backend" });
    const peersFromA = await call(a.client, "list_peers");
    expect(peersFromA.map((p: { name: string }) => p.name)).toEqual([meB.name]);
    expect(meA.name).not.toBe(meB.name);
    await a.close();
    await b.close();
  });

  it("update_role changes role visible to peers", async () => {
    const s = createSession(srv.db, { topic: "t" });
    const a = await connectMcp(srv.baseUrl, s.id);
    const b = await connectMcp(srv.baseUrl, s.id);
    await call(a.client, "identify", { role: "frontend" });
    await call(b.client, "identify", { role: "backend" });
    await call(b.client, "update_role", { role: "backend + migrations" });
    const peersFromA = await call(a.client, "list_peers");
    expect(peersFromA[0].role).toBe("backend + migrations");
    await a.close();
    await b.close();
  });

  it("leave frees the name", async () => {
    const s = createSession(srv.db, { topic: "t" });
    const a = await connectMcp(srv.baseUrl, s.id);
    const first = await call(a.client, "identify", { role: "r" });
    await call(a.client, "leave");
    await a.close();

    const c = await connectMcp(srv.baseUrl, s.id);
    const me = await call(c.client, "identify", { role: "r" });
    // Pool pick with the same seed = same first-free name.
    expect(me.name).toBe(first.name);
    await c.close();
  });

  it("get_monitor_command returns a curl pointing at this session's stream", async () => {
    const s = createSession(srv.db, { topic: "t" });
    const a = await connectMcp(srv.baseUrl, s.id);
    await call(a.client, "identify", { role: "r" });
    const out = await call(a.client, "get_monitor_command");
    expect(out.command).toMatch(
      /^curl -N http:\/\/127\.0\.0\.1:\d+\/sessions\/[^\/]+\/stream\?viewer=[0-9A-HJKMNP-TV-Z]{26}$/i,
    );
    await a.close();
  });
});
