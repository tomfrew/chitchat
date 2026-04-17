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

  process.on("SIGINT", () => {
    logger.info("shutdown", { reason: "SIGINT" });
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
