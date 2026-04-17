import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { startTempServer, type TempServer } from "../helpers/temp-server.js";

describe("HTTP /status", () => {
  let srv: TempServer;
  beforeEach(async () => {
    srv = await startTempServer();
  });
  afterEach(async () => {
    await srv.close();
  });

  it("returns ok + uptime", async () => {
    const r = await fetch(`${srv.baseUrl}/status`);
    expect(r.status).toBe(200);
    const body = (await r.json()) as { ok: boolean; uptime_ms: number };
    expect(body.ok).toBe(true);
    expect(typeof body.uptime_ms).toBe("number");
  });
});
