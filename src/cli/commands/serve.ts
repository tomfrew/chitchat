import { createServer } from "node:http";
import { openDatabase } from "../../storage/db.js";
import { SessionHub } from "../../hub/session-hub.js";
import { consoleLogger } from "../../logger.js";
import { buildRequestHandler } from "../../http/app.js";
import { loadConfig } from "../../config.js";

export async function runServe(opts: { port?: number }): Promise<void> {
  const cfg = loadConfig({ port: opts.port });
  const db = openDatabase(cfg.dbPath);
  const hub = new SessionHub();
  const logger = consoleLogger();

  const handler = buildRequestHandler({ db, hub, logger, startedAt: Date.now() });

  const server = createServer((req, res) => {
    handler(req, res).catch((err) => {
      logger.error("request error", { err: (err as Error).message });
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: (err as Error).message }));
      }
    });
  });

  server.listen(cfg.port, cfg.host, () => {
    process.stderr.write(
      `chitchat listening on http://${cfg.host}:${cfg.port}\n`,
    );
  });

  let shuttingDown = false;
  const shutdown = (reason: string) => {
    if (shuttingDown) {
      // Second ^C → give up on graceful exit and hard-kill.
      process.stderr.write("force exit\n");
      process.exit(1);
    }
    shuttingDown = true;
    logger.info("shutdown", { reason });
    // Tell every connected SSE subscriber we're going down so agents can stop
    // their Monitor cleanly rather than seeing a raw socket drop. Give the
    // queues a brief flush window before we force connections closed.
    hub.broadcast((sessionId) => ({
      type: "server_shutdown",
      session_id: sessionId,
      reason,
    }));
    setTimeout(() => {
      // SSE streams and MCP long-lived transports never self-close, so a plain
      // server.close(cb) hangs forever. Force them closed.
      server.closeAllConnections?.();
      server.close(() => {
        db.close();
        process.exit(0);
      });
    }, 150);
    // Safety net: if closeAllConnections missed something or the OS takes too
    // long to fire the close event, hard-exit after a short grace window.
    setTimeout(() => {
      process.stderr.write("shutdown timeout; forcing exit\n");
      process.exit(1);
    }, 2000).unref();
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}
