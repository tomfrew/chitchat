#!/usr/bin/env node
// Live smoke test: two MCP clients coordinate via /mcp through the real built daemon.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:17800";
const topic = process.env.TOPIC ?? "smoke-coord";
const log = (who, msg, extra) =>
  console.log(`[${who}] ${msg}${extra ? "  " + JSON.stringify(extra) : ""}`);

async function connect(label) {
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`));
  const client = new Client({ name: `smoke-${label}`, version: "0.1.0" });
  await client.connect(transport);
  return client;
}

async function call(client, name, args = {}) {
  const res = await client.callTool({ name, arguments: args });
  return JSON.parse(res.content[0].text);
}

async function assertDeep(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`FAIL ${label}: expected ${e}, got ${a}`);
  log("ok ", label);
}

async function assert(label, cond, detail) {
  if (!cond) throw new Error(`FAIL ${label}${detail ? ": " + detail : ""}`);
  log("ok ", label);
}

async function main() {
  // Alice connects to the global endpoint, lists sessions, joins our topic.
  const alice = await connect("alice");
  const sessions = await call(alice, "list_sessions");
  await assert("list_sessions includes our topic", sessions.some((s) => s.topic === topic));

  const meA = await call(alice, "identify", { session: topic, role: "frontend" });
  await assertDeep("alice identified as Alice", meA.name, "Alice");

  // Pre-identify check on a fresh connection confirms the toolset is restricted.
  const peek = await connect("peek");
  const peekTools = (await peek.listTools()).tools.map((t) => t.name).sort();
  await assertDeep("pre-identify tools", peekTools, ["identify", "list_sessions"]);
  await peek.close();

  // Bob joins the same session via its id (proves topic/id interchangeability).
  const bob = await connect("bob");
  const meB = await call(bob, "identify", { session: meA.session_id, role: "backend" });
  await assertDeep("bob identified as Bob", meB.name, "Bob");

  // Alice posts; Bob peeks then reads.
  await call(alice, "post_message", {
    body: "pushed auth fix, does /login render?",
    meta: { pr_url: "https://ex.com/pr/42" },
  });
  const peekBob = await call(bob, "inbox_peek");
  await assertDeep("bob unread_count=1", peekBob.unread_count, 1);
  const msgsBob = await call(bob, "get_messages");
  await assertDeep("bob received 1 message", msgsBob.length, 1);
  await assertDeep("message preserves meta", msgsBob[0].meta, {
    pr_url: "https://ex.com/pr/42",
  });

  // Bob replies with a role change partway through.
  await call(bob, "update_role", { role: "backend + migrations" });
  await call(bob, "post_message", { body: "rendered clean, merging" });
  const peers = await call(alice, "list_peers");
  const bobPeer = peers.find((p) => p.name === "Bob");
  await assert("alice sees Bob's role change", bobPeer?.role === "backend + migrations");

  const msgsAlice = await call(alice, "get_messages");
  await assertDeep("alice got bob's reply", msgsAlice.map((m) => m.body), ["rendered clean, merging"]);

  // Alice leaves; tool list should shrink back.
  await call(alice, "leave");
  const afterLeaveTools = (await alice.listTools()).tools.map((t) => t.name).sort();
  await assertDeep("post-leave tools", afterLeaveTools, ["identify", "list_sessions"]);

  // Alice re-joins a fresh session on the same connection — proves one-session-at-a-time + reuse.
  const sessions2 = await call(alice, "list_sessions");
  await assert("second session now listed", sessions2.some((s) => s.topic === topic));
  const meA2 = await call(alice, "identify", { session: topic, role: "frontend-v2" });
  await assertDeep("rejoin name is Alice (Bob still there)", meA2.name, "Alice");

  await alice.close();
  await bob.close();
  console.log("\nALL CHECKS PASSED");
}

main().catch((err) => {
  console.error("SMOKE FAILED:", err.message);
  process.exit(1);
});
