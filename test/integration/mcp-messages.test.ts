import { afterEach, beforeEach, describe, it, expect } from "bun:test";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { startTempServer, type TempServer } from "../helpers/temp-server.js";
import { createSession } from "../../src/storage/sessions.js";
import { connectMcp } from "../helpers/mcp-test-client.js";

type ToolRes = { content: Array<{ type: string; text: string }> };

async function identify(client: Client, role: string) {
  const res = (await client.callTool({ name: "identify", arguments: { role } })) as ToolRes;
  return JSON.parse(res.content[0].text);
}
async function post(client: Client, body: string, meta?: Record<string, unknown>) {
  const args: Record<string, unknown> = { body };
  if (meta) args.meta = meta;
  const res = (await client.callTool({ name: "post_message", arguments: args })) as ToolRes;
  return JSON.parse(res.content[0].text);
}
async function peek(client: Client) {
  const res = (await client.callTool({ name: "inbox_peek", arguments: {} })) as ToolRes;
  return JSON.parse(res.content[0].text);
}
async function getMsgs(client: Client, args: Record<string, unknown> = {}) {
  const res = (await client.callTool({ name: "get_messages", arguments: args })) as ToolRes;
  return JSON.parse(res.content[0].text);
}

describe("MCP messages", () => {
  let srv: TempServer;
  beforeEach(async () => {
    srv = await startTempServer();
  });
  afterEach(async () => {
    await srv.close();
  });

  it("two agents exchange messages; cursors prevent duplicates", async () => {
    const s = createSession(srv.db, { topic: "t" });
    const a = await connectMcp(srv.baseUrl, s.id);
    const b = await connectMcp(srv.baseUrl, s.id);
    await identify(a.client, "frontend");
    await identify(b.client, "backend");

    await post(a.client, "hello from Alice");
    const bPeek1 = await peek(b.client);
    expect(bPeek1.unread_count).toBe(1);

    const bMsgs1 = await getMsgs(b.client);
    expect(bMsgs1.map((m: { body: string }) => m.body)).toEqual(["hello from Alice"]);
    const bMsgs2 = await getMsgs(b.client);
    expect(bMsgs2).toEqual([]);
    await a.close();
    await b.close();
  });

  it("meta round-trips and 4KB cap rejects oversized", async () => {
    const s = createSession(srv.db, { topic: "t" });
    const a = await connectMcp(srv.baseUrl, s.id);
    const b = await connectMcp(srv.baseUrl, s.id);
    await identify(a.client, "r");
    await identify(b.client, "r");

    await post(a.client, "check refs", { pr_url: "https://ex.com/1", count: 3 });
    const msgs = await getMsgs(b.client);
    expect(msgs[0].meta).toEqual({ pr_url: "https://ex.com/1", count: 3 });

    const big = { blob: "x".repeat(5000) };
    await expect(post(a.client, "too big", big)).rejects.toThrow(/exceeds.*4096/);
    await a.close();
    await b.close();
  });

  it("get_messages before= pages backwards", async () => {
    const s = createSession(srv.db, { topic: "t" });
    const a = await connectMcp(srv.baseUrl, s.id);
    await identify(a.client, "r");
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push((await post(a.client, `m${i}`)).id);
    const page = await getMsgs(a.client, { before: ids[3], limit: 10 });
    expect(page.map((m: { body: string }) => m.body)).toEqual(["m0", "m1", "m2"]);
    await a.close();
  });
});
