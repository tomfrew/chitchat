import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { openDatabase, type Db } from "../../src/storage/db.js";
import { SessionHub } from "../../src/hub/session-hub.js";
import { silentLogger } from "../../src/logger.js";
import { buildRequestHandler } from "../../src/http/app.js";

export interface TempServer {
  baseUrl: string;
  db: Db;
  hub: SessionHub;
  close: () => Promise<void>;
}

export async function startTempServer(): Promise<TempServer> {
  const db = openDatabase(":memory:");
  const hub = new SessionHub();
  const handler = buildRequestHandler({ db, hub, logger: silentLogger(), startedAt: Date.now() });
  const server = createServer((req, res) => {
    handler(req, res).catch((err) => {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: (err as Error).message }));
      }
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    db,
    hub,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}
