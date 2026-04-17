import type { IncomingMessage, ServerResponse } from "node:http";
import { Hono } from "hono";
import { getRequestListener } from "@hono/node-server";
import type { Db } from "../storage/db.js";
import type { SessionHub } from "../hub/session-hub.js";
import type { Logger } from "../logger.js";
import { restRoutes } from "./rest.js";
import { sseRoutes } from "./sse.js";
import { mcpHandler } from "./mcp.js";

export interface AppDeps {
  db: Db;
  hub: SessionHub;
  logger: Logger;
  startedAt: number;
}

export function buildApp(deps: AppDeps): Hono {
  const app = new Hono();
  app.get("/status", (c) =>
    c.json({ ok: true, uptime_ms: Date.now() - deps.startedAt, version: "0.1.0" }),
  );
  app.route("/", restRoutes(deps));
  app.route("/", sseRoutes(deps));
  app.onError((err, c) => {
    deps.logger.error("http error", { err: err.message });
    return c.json({ error: err.message }, 500);
  });
  return app;
}

export function buildRequestHandler(deps: AppDeps) {
  const app = buildApp(deps);
  const honoListener = getRequestListener(app.fetch);
  const mcpHandle = mcpHandler(deps);

  const mcpPath = /^\/mcp\/([^/?#]+)/;

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const match = req.url ? mcpPath.exec(req.url) : null;
    if (match) {
      try {
        await mcpHandle(req, res, match[1]);
      } catch (err) {
        deps.logger.error("mcp error", { err: (err as Error).message });
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: (err as Error).message }));
        }
      }
      return;
    }
    await honoListener(req, res);
  };
}
