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

describe("end-to-end scenario", () => {
  let srv: TempServer;
  beforeEach(async () => {
    srv = await startTempServer();
  });
  afterEach(async () => {
    await srv.close();
  });

  it("Alice + Bob chat, Carol joins mid-way, catches up, Bob leaves", async () => {
    const s = createSession(srv.db, { topic: "e2e" });
    const a = await connectMcp(srv.baseUrl, s.id);
    const b = await connectMcp(srv.baseUrl, s.id);
    const idA = await call(a.client, "identify", { role: "frontend" });
    const idB = await call(b.client, "identify", { role: "backend" });
    expect(idA.name).not.toBe(idB.name);

    await call(a.client, "post_message", { body: "starting on the login form" });
    await call(b.client, "post_message", {
      body: "wiring /auth",
      meta: { pr_url: "https://ex.com/pr/1" },
    });
    await call(a.client, "post_message", { body: "hook up that endpoint when ready" });

    const c = await connectMcp(srv.baseUrl, s.id);
    const idC = await call(c.client, "identify", { role: "qa" });
    expect([idA.name, idB.name]).not.toContain(idC.name);
    expect(idC.recent_messages.length).toBe(3);
    expect(idC.recent_messages.map((m: { body: string }) => m.body)).toEqual([
      "starting on the login form",
      "wiring /auth",
      "hook up that endpoint when ready",
    ]);

    await call(b.client, "update_role", { role: "backend + migrations" });
    const peersFromA = await call(a.client, "list_peers");
    const bobPeer = peersFromA.find((p: { name: string }) => p.name === idB.name);
    expect(bobPeer.role).toBe("backend + migrations");

    await call(b.client, "leave");
    const d = await connectMcp(srv.baseUrl, s.id);
    const idD = await call(d.client, "identify", { role: "ops" });
    // b's name is freed; d should reclaim it via pool pick (first-free under seed).
    expect(idD.name).toBe(idB.name);

    await a.close();
    await b.close();
    await c.close();
    await d.close();
  });
});
