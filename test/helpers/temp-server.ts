import { serve } from "@hono/node-server";
import type { AddressInfo } from "node:net";
import { openDatabase, type Db } from "../../src/storage/db.js";
import { SessionHub } from "../../src/hub/session-hub.js";
import { silentLogger } from "../../src/logger.js";
import { buildApp } from "../../src/http/app.js";

export interface TempServer {
  baseUrl: string;
  db: Db;
  hub: SessionHub;
  close: () => Promise<void>;
}

export async function startTempServer(): Promise<TempServer> {
  const db = openDatabase(":memory:");
  const hub = new SessionHub();
  const app = buildApp({ db, hub, logger: silentLogger(), startedAt: Date.now() });
  const server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const addr = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    db,
    hub,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
