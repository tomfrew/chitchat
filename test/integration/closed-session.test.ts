import { afterEach, beforeEach, describe, it, expect } from "bun:test";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { startTempServer, type TempServer } from "../helpers/temp-server.js";
import { createSession, closeSession } from "../../src/storage/sessions.js";
import { connectMcp } from "../helpers/mcp-test-client.js";

type ToolRes = { content: Array<{ type: string; text: string }> };

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const res = (await client.callTool({ name, arguments: args })) as ToolRes;
  return JSON.parse(res.content[0].text);
}

describe("closed session guards", () => {
  let srv: TempServer;
  beforeEach(async () => {
    srv = await startTempServer();
  });
  afterEach(async () => {
    await srv.close();
  });

  it("post_message rejects on a closed session", async () => {
    const s = createSession(srv.db, { topic: "t" });
    const a = await connectMcp(srv.baseUrl, s.id);
    await call(a.client, "identify", { role: "r" });
    closeSession(srv.db, s.id);
    await expect(call(a.client, "post_message", { body: "after close" })).rejects.toThrow(
      /closed/i,
    );
    await a.close();
  });

  it("update_role rejects on a closed session", async () => {
    const s = createSession(srv.db, { topic: "t" });
    const a = await connectMcp(srv.baseUrl, s.id);
    await call(a.client, "identify", { role: "r" });
    closeSession(srv.db, s.id);
    await expect(call(a.client, "update_role", { role: "new" })).rejects.toThrow(/closed/i);
    await a.close();
  });

  it("reads still work on a closed session (historical view)", async () => {
    const s = createSession(srv.db, { topic: "t" });
    const a = await connectMcp(srv.baseUrl, s.id);
    await call(a.client, "identify", { role: "r" });
    await call(a.client, "post_message", { body: "while open" });
    closeSession(srv.db, s.id);
    const msgs = await call(a.client, "get_messages", { since: "" });
    expect(msgs.map((m: { body: string }) => m.body)).toEqual(["while open"]);
    await a.close();
  });
});
