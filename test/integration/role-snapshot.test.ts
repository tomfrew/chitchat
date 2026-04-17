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

describe("message role snapshotting", () => {
  let srv: TempServer;
  beforeEach(async () => {
    srv = await startTempServer();
  });
  afterEach(async () => {
    await srv.close();
  });

  it("old messages keep old role after update_role", async () => {
    const s = createSession(srv.db, { topic: "t" });
    const a = await connectMcp(srv.baseUrl, s.id);
    const b = await connectMcp(srv.baseUrl, s.id);
    await call(a.client, "identify", { role: "frontend" });
    await call(b.client, "identify", { role: "backend" });

    await call(a.client, "post_message", { body: "first as frontend" });
    await call(a.client, "update_role", { role: "fullstack" });
    await call(a.client, "post_message", { body: "second as fullstack" });

    const msgs = await call(b.client, "get_messages");
    expect(msgs).toHaveLength(2);
    expect(msgs[0].body).toBe("first as frontend");
    expect(msgs[0].role).toBe("frontend");
    expect(msgs[1].body).toBe("second as fullstack");
    expect(msgs[1].role).toBe("fullstack");
    await a.close();
    await b.close();
  });
});
