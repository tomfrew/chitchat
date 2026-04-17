import { afterEach, beforeEach, describe, it, expect } from "bun:test";
import { startTempServer, type TempServer } from "../helpers/temp-server.js";
import { createSession } from "../../src/storage/sessions.js";
import type { HubEvent } from "../../src/hub/events.js";

describe("SSE stream", () => {
  let srv: TempServer;
  beforeEach(async () => {
    srv = await startTempServer();
  });
  afterEach(async () => {
    await srv.close();
  });

  it("delivers hub events as SSE lines", async () => {
    const session = createSession(srv.db, { topic: "sse" });
    const controller = new AbortController();
    const resp = await fetch(`${srv.baseUrl}/sessions/${session.id}/stream`, {
      signal: controller.signal,
    });
    expect(resp.headers.get("content-type")).toMatch(/text\/event-stream/);

    const reader = resp.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    const readOnce = async (): Promise<string> => {
      while (true) {
        const i = buf.indexOf("\n\n");
        if (i !== -1) {
          const chunk = buf.slice(0, i);
          buf = buf.slice(i + 2);
          return chunk;
        }
        const { value, done } = await reader.read();
        if (done) throw new Error("stream ended");
        buf += decoder.decode(value);
      }
    };

    // Consume the initial "ready" event before injecting our own.
    const ready = await readOnce();
    expect(ready).toMatch(/^event: ready/m);

    const event: HubEvent = {
      type: "peer_join",
      session_id: session.id,
      name: "Alice",
      role: "frontend",
    };
    setTimeout(() => srv.hub.publish(event), 50);

    const chunk = await readOnce();
    expect(chunk).toMatch(/^event: peer_join/m);
    expect(chunk).toMatch(/"name":"Alice"/);

    controller.abort();
  });

  it("returns 404 for missing session", async () => {
    const r = await fetch(`${srv.baseUrl}/sessions/sess_nope/stream`);
    expect(r.status).toBe(404);
  });
});
