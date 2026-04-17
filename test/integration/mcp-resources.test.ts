import { afterEach, beforeEach, describe, it, expect } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ResourceUpdatedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { startTempServer, type TempServer } from "../helpers/temp-server.js";
import { createSession } from "../../src/storage/sessions.js";
import { connectMcp } from "../helpers/mcp-test-client.js";

type ToolRes = { content: Array<{ type: string; text: string }> };

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const res = (await client.callTool({ name, arguments: args })) as ToolRes;
  return JSON.parse(res.content[0].text);
}

describe("MCP resources", () => {
  let srv: TempServer;
  beforeEach(async () => {
    srv = await startTempServer();
  });
  afterEach(async () => {
    await srv.close();
  });

  it("lists and reads the four core resources", async () => {
    const s = createSession(srv.db, { topic: "t" });
    const a = await connectMcp(srv.baseUrl, s.id);
    const list = await a.client.listResources();
    expect(list.resources.map((r) => r.uri).sort()).toEqual([
      "chitterchatter://messages",
      "chitterchatter://peers",
      "chitterchatter://session",
      "chitterchatter://skill",
    ]);
    const skill = await a.client.readResource({ uri: "chitterchatter://skill" });
    const text = (skill.contents[0] as { text: string }).text;
    expect(text).toMatch(/ChitterChatter Agent Skill/);
    await a.close();
  });

  it("fires resources/updated for subscribed messages URI on post", async () => {
    const s = createSession(srv.db, { topic: "t" });
    const a = await connectMcp(srv.baseUrl, s.id);
    const b = await connectMcp(srv.baseUrl, s.id);

    let updated = 0;
    b.client.setNotificationHandler(ResourceUpdatedNotificationSchema, async (n) => {
      if (n.params.uri === "chitterchatter://messages") updated++;
    });
    await b.client.subscribeResource({ uri: "chitterchatter://messages" });

    await call(a.client, "identify", { role: "r" });
    await call(b.client, "identify", { role: "r" });
    await call(a.client, "post_message", { body: "ping" });

    await new Promise((r) => setTimeout(r, 100));
    expect(updated).toBeGreaterThanOrEqual(1);
    await a.close();
    await b.close();
  });
});
