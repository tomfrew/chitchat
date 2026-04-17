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
  const alice = await connect("a");
  const sessions = await call(alice, "list_sessions");
  await assert("list_sessions includes our topic", sessions.some((s) => s.topic === topic));

  const meA = await call(alice, "identify", { session: topic, role: "frontend", persistent_id: "smoke-alice" });
  await assert("alice got a name", typeof meA.name === "string" && meA.name.length > 0);
  const aliceName = meA.name;

  // Tool list exposes the full surface regardless of identify state.
  const peek = await connect("peek");
  const peekTools = (await peek.listTools()).tools.map((t) => t.name).sort();
  await assertDeep("full toolset exposed pre-identify", peekTools, [
    "get_messages", "get_monitor_command", "identify", "inbox_peek", "leave",
    "list_peers", "list_sessions", "post_message", "update_role",
  ]);
  await peek.close();

  // Bob joins the same session via its id (proves topic/id interchangeability).
  const bob = await connect("b");
  const meB = await call(bob, "identify", { session: meA.session_id, role: "backend", persistent_id: "smoke-bob" });
  await assert("bob got a distinct name", typeof meB.name === "string" && meB.name !== aliceName);
  const bobName = meB.name;

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
  const bobPeer = peers.find((p) => p.name === bobName);
  await assert("alice sees bob's role change", bobPeer?.role === "backend + migrations");

  const msgsAlice = await call(alice, "get_messages");
  await assertDeep("alice got bob's reply", msgsAlice.map((m) => m.body), ["rendered clean, merging"]);

  // Alice leaves; tool list should shrink back.
  await call(alice, "leave");
  const afterLeaveTools = (await alice.listTools()).tools.map((t) => t.name).sort();
  await assertDeep("post-leave tools", afterLeaveTools, ["identify", "list_sessions"]);

  // Alice re-joins a fresh session on the same connection — proves one-session-at-a-time + reuse.
  const sessions2 = await call(alice, "list_sessions");
  await assert("second session now listed", sessions2.some((s) => s.topic === topic));
  const meA2 = await call(alice, "identify", {
    session: topic,
    role: "frontend-v2",
    persistent_id: "smoke-alice",
  });
  await assertDeep("rejoin reclaims original name via persistent_id", meA2.name, aliceName);
  await assert("reclaim flag is set (reused or revived)", meA2.reclaim === "reused" || meA2.reclaim === "revived");

  await alice.close();
  await bob.close();
  console.log("\nALL CHECKS PASSED");
}

main().catch((err) => {
  console.error("SMOKE FAILED:", err.message);
  process.exit(1);
});
