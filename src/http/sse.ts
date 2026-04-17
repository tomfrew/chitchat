import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { AppDeps } from "./app.js";
import { getSession } from "../storage/sessions.js";
import { getAgent } from "../storage/agents.js";
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
      return {
        event: "peer_join",
        data: JSON.stringify({ name: e.name, role: e.role, ts: Date.now() }),
      };
    case "peer_leave":
      return { event: "peer_leave", data: JSON.stringify({ name: e.name, ts: Date.now() }) };
    case "role_changed":
      return {
        event: "role",
        data: JSON.stringify({ name: e.name, role: e.role, ts: Date.now() }),
      };
    case "session_closed":
      return { event: "session_closed", data: JSON.stringify({ ts: Date.now() }) };
    case "server_shutdown":
      return {
        event: "server_shutdown",
        data: JSON.stringify({ reason: e.reason, ts: Date.now() }),
      };
  }
}

/**
 * Returns true if the event is about the given viewer (self-event to suppress).
 * The stream hands every event to every subscriber; without filtering, a posting
 * agent wakes itself up via Monitor. Suppressing self-events here breaks that loop.
 */
function isSelfEvent(e: HubEvent, viewerAgentId: string, viewerName: string): boolean {
  switch (e.type) {
    case "message":
      return e.message.agent_id === viewerAgentId;
    case "peer_join":
    case "peer_leave":
    case "role_changed":
      return e.name === viewerName;
    case "session_closed":
    case "server_shutdown":
      // Server-level events always reach every viewer, even yourself.
      return false;
  }
}

export function sseRoutes(deps: AppDeps): Hono {
  const r = new Hono();
  r.get("/sessions/:id/stream", (c) => {
    const id = c.req.param("id");
    if (!getSession(deps.db, id)) return c.json({ error: "not found" }, 404);

    const viewerId = c.req.query("viewer");
    let viewerName: string | null = null;
    if (viewerId) {
      const agent = getAgent(deps.db, viewerId);
      if (agent && agent.session_id === id) viewerName = agent.name;
      // If the viewer id is unknown or cross-session, don't filter — fail-open so
      // humans tailing with a stale id still see everything.
    }

    return streamSSE(c, async (stream) => {
      const queue: HubEvent[] = [];
      let notify: (() => void) | null = null;
      const unsub = deps.hub.subscribe(id, (e) => {
        if (viewerId && viewerName && isSelfEvent(e, viewerId, viewerName)) return;
        queue.push(e);
        notify?.();
      });

      // Keepalive: stream an SSE comment every 25s so idle-connection reapers
      // (client HTTP timeouts, OS-level NAT timeouts, corporate proxies) don't
      // silently close the stream. Comments don't surface as events to
      // consumers, so this is invisible to the Monitor tool.
      const keepalive = setInterval(() => {
        notify?.();
        // trigger a loop iteration that writes ":" below
        queue.push({ __keepalive: true } as unknown as HubEvent);
      }, 25_000);

      stream.onAbort(() => {
        clearInterval(keepalive);
        unsub();
      });
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
            if ((evt as { __keepalive?: boolean }).__keepalive) {
              // SSE comment; not an event. Safe for any consumer.
              await stream.write(": keepalive\n\n");
              continue;
            }
            await stream.writeSSE(toSseEvent(evt));
            if (evt.type === "session_closed" || evt.type === "server_shutdown") {
              clearInterval(keepalive);
              unsub();
              return;
            }
          }
        }
      } finally {
        clearInterval(keepalive);
        unsub();
      }
    });
  });
  return r;
}
