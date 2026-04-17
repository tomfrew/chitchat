import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { ToolListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { startTempServer, type TempServer } from "../helpers/temp-server.js";
import { createSession } from "../../src/storage/sessions.js";
import { connectMcp } from "../helpers/mcp-test-client.js";

describe("MCP identify", () => {
  let srv: TempServer;
  beforeEach(async () => {
    srv = await startTempServer();
  });
  afterEach(async () => {
    await srv.close();
  });

  it("pre-identify tool list contains identify + list_sessions only", async () => {
    const s = createSession(srv.db, { topic: "t" });
    const { client, close } = await connectMcp(srv.baseUrl, s.id);
    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name).sort()).toEqual(["identify", "list_sessions"]);
    await close();
  });

  it("identify assigns Alice, returns empty peers on first join, emits tool-list-change", async () => {
    const s = createSession(srv.db, { topic: "t" });
    const { client, close } = await connectMcp(srv.baseUrl, s.id);

    let notified = false;
    client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
      notified = true;
    });

    const res = await client.callTool({ name: "identify", arguments: { role: "frontend" } });
    const content = res.content as Array<{ type: string; text: string }>;
    const payload = JSON.parse(content[0].text);
    expect(typeof payload.name).toBe("string");
    expect(payload.name.length).toBeGreaterThan(0);
    expect(payload.peers).toEqual([]);
    expect(Array.isArray(payload.recent_messages)).toBe(true);

    await new Promise((r) => setTimeout(r, 50));
    expect(notified).toBe(true);

    await close();
  });

  it("returns 404 when session does not exist", async () => {
    const r = await fetch(`${srv.baseUrl}/mcp/sess_nope`, { method: "POST" });
    expect(r.status).toBe(404);
  });
});
