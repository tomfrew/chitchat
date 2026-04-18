import { createServer } from "node:http";
import type { Server as HttpServer } from "node:http";
import { openDatabase, type Db } from "../storage/db.js";
import { SessionHub } from "../hub/session-hub.js";
import { consoleLogger, silentLogger, type Logger } from "../logger.js";
import { buildRequestHandler } from "../http/app.js";
import { loadConfig, type Config } from "../config.js";
import { listSessions, type Session } from "../storage/sessions.js";
import { getMessagesWithSender, type MessageWithSender } from "../storage/messages.js";

export interface RuntimeOptions {
  port?: number;
  /** Route logs to stderr as structured JSON (headless) or swallow (TUI). */
  logs?: "stderr" | "silent";
}

export interface Runtime {
  cfg: Config;
  db: Db;
  hub: SessionHub;
  server: HttpServer;
  logger: Logger;
  sessions(): SessionSummary[];
  messages(sessionId: string, limit?: number): MessageWithSender[];
  close(): Promise<void>;
}

export type SessionSummary = Session;

// Same code path as `chitchat serve` but without signal-handler/exit wiring; caller owns lifecycle.
export async function startRuntime(opts: RuntimeOptions = {}): Promise<Runtime> {
  const cfg = loadConfig({ port: opts.port });
  const db = openDatabase(cfg.dbPath);
  const hub = new SessionHub();
  const logger = opts.logs === "silent" ? silentLogger() : consoleLogger();

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

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(cfg.port, cfg.host, () => resolve());
  });

  return {
    cfg,
    db,
    hub,
    server,
    logger,
    sessions: () => listSessions(db, { all: false }),
    messages: (sessionId, limit = 100) =>
      getMessagesWithSender(db, sessionId, { limit }),
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => {
          db.close();
          resolve();
        });
      }),
  };
}
