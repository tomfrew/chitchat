import { Hono } from "hono";
import type { Db } from "../storage/db.js";
import type { SessionHub } from "../hub/session-hub.js";
import type { Logger } from "../logger.js";

export interface AppDeps {
  db: Db;
  hub: SessionHub;
  logger: Logger;
  startedAt: number;
}

export function buildApp(deps: AppDeps): Hono {
  const app = new Hono();
  app.get("/status", (c) =>
    c.json({
      ok: true,
      uptime_ms: Date.now() - deps.startedAt,
      version: "0.1.0",
    }),
  );
  app.onError((err, c) => {
    deps.logger.error("http error", { err: err.message });
    return c.json({ error: err.message }, 500);
  });
  return app;
}
