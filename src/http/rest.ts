import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "./app.js";
import {
  createSession,
  getSession,
  listSessions,
  closeSession,
  deleteSession,
} from "../storage/sessions.js";
import { listActiveAgents } from "../storage/agents.js";
import { countMessagesAfter } from "../storage/messages.js";

const createSchema = z.object({
  topic: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});

export function restRoutes(deps: AppDeps): Hono {
  const r = new Hono();

  r.post("/sessions", async (c) => {
    const parsed = createSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: parsed.error.message }, 400);
    try {
      const session = createSession(deps.db, parsed.data);
      return c.json(session, 201);
    } catch (err) {
      const msg = (err as Error).message;
      if (/already/i.test(msg)) return c.json({ error: msg }, 409);
      throw err;
    }
  });

  r.get("/sessions", (c) => {
    const all = c.req.query("all") === "1" || c.req.query("all") === "true";
    return c.json({ sessions: listSessions(deps.db, { all }) });
  });

  r.get("/sessions/:id", (c) => {
    const id = c.req.param("id");
    const session = getSession(deps.db, id);
    if (!session) return c.json({ error: "not found" }, 404);
    const peers = listActiveAgents(deps.db, id).map((a) => ({
      name: a.name,
      role: a.role,
      joined_at: a.joined_at,
    }));
    const message_count = countMessagesAfter(deps.db, id, null);
    return c.json({ session, peers, message_count });
  });

  r.post("/sessions/:id/close", (c) => {
    const id = c.req.param("id");
    try {
      closeSession(deps.db, id);
      deps.hub.publish({ type: "session_closed", session_id: id });
      return c.body(null, 204);
    } catch {
      return c.json({ error: "session not open" }, 404);
    }
  });

  r.delete("/sessions/:id", (c) => {
    const id = c.req.param("id");
    deleteSession(deps.db, id);
    return c.body(null, 204);
  });

  return r;
}
