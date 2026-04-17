import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { AppDeps } from "./app.js";
import { getSession } from "../storage/sessions.js";
import type { HubEvent } from "../hub/events.js";

function toSseEvent(e: HubEvent): { event: string; data: string } {
  switch (e.type) {
    case "message":
      return {
        event: "message",
        data: JSON.stringify({
          id: e.message.id,
          from: e.sender_name,
          role: e.sender_role,
          body: e.message.body,
          meta: e.message.meta,
          ts: e.message.created_at,
        }),
      };
    case "peer_join":
      return { event: "peer_join", data: JSON.stringify({ name: e.name, role: e.role, ts: Date.now() }) };
    case "peer_leave":
      return { event: "peer_leave", data: JSON.stringify({ name: e.name, ts: Date.now() }) };
    case "role_changed":
      return { event: "role", data: JSON.stringify({ name: e.name, role: e.role, ts: Date.now() }) };
    case "session_closed":
      return { event: "session_closed", data: JSON.stringify({ ts: Date.now() }) };
  }
}

export function sseRoutes(deps: AppDeps): Hono {
  const r = new Hono();
  r.get("/sessions/:id/stream", (c) => {
    const id = c.req.param("id");
    if (!getSession(deps.db, id)) return c.json({ error: "not found" }, 404);
    return streamSSE(c, async (stream) => {
      const queue: HubEvent[] = [];
      let notify: (() => void) | null = null;
      const unsub = deps.hub.subscribe(id, (e) => {
        queue.push(e);
        notify?.();
      });
      stream.onAbort(() => unsub());
      await stream.writeSSE({ event: "ready", data: "{}" });
      try {
        while (true) {
          if (queue.length === 0) {
            await new Promise<void>((resolve) => {
              notify = resolve;
            });
            notify = null;
          }
          while (queue.length) {
            const evt = queue.shift()!;
            await stream.writeSSE(toSseEvent(evt));
            if (evt.type === "session_closed") {
              unsub();
              return;
            }
          }
        }
      } finally {
        unsub();
      }
    });
  });
  return r;
}
