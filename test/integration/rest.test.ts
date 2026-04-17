import { afterEach, beforeEach, describe, it, expect } from "bun:test";
import { startTempServer, type TempServer } from "../helpers/temp-server.js";

describe("REST sessions", () => {
  let srv: TempServer;
  beforeEach(async () => {
    srv = await startTempServer();
  });
  afterEach(async () => {
    await srv.close();
  });

  const j = async (r: Response) => ({ status: r.status, body: (await r.json()) as any });

  it("status works", async () => {
    const r = await fetch(`${srv.baseUrl}/status`);
    expect(r.status).toBe(200);
  });

  it("creates, lists, and reads a session", async () => {
    const post = await fetch(`${srv.baseUrl}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topic: "auth", description: "work" }),
    });
    const created = await j(post);
    expect(created.status).toBe(201);
    expect(created.body.topic).toBe("auth");

    const list = await j(await fetch(`${srv.baseUrl}/sessions`));
    expect(list.status).toBe(200);
    expect(list.body.sessions.map((s: { id: string }) => s.id)).toContain(created.body.id);

    const get = await j(await fetch(`${srv.baseUrl}/sessions/${created.body.id}`));
    expect(get.status).toBe(200);
    expect(get.body.session.topic).toBe("auth");
    expect(get.body.peers).toEqual([]);
    expect(get.body.message_count).toBe(0);
  });

  it("rejects duplicate open topic", async () => {
    await fetch(`${srv.baseUrl}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topic: "x" }),
    });
    const dup = await fetch(`${srv.baseUrl}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topic: "x" }),
    });
    expect(dup.status).toBe(409);
  });

  it("closes a session", async () => {
    const { body: s } = await j(
      await fetch(`${srv.baseUrl}/sessions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic: "closeme" }),
      }),
    );
    const close = await fetch(`${srv.baseUrl}/sessions/${s.id}/close`, { method: "POST" });
    expect(close.status).toBe(204);
    const list = await j(await fetch(`${srv.baseUrl}/sessions`));
    expect(list.body.sessions.find((x: { id: string }) => x.id === s.id)).toBeUndefined();
    const listAll = await j(await fetch(`${srv.baseUrl}/sessions?all=1`));
    expect(listAll.body.sessions.find((x: { id: string }) => x.id === s.id)).toBeDefined();
  });

  it("deletes a session", async () => {
    const { body: s } = await j(
      await fetch(`${srv.baseUrl}/sessions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic: "rm" }),
      }),
    );
    const del = await fetch(`${srv.baseUrl}/sessions/${s.id}`, { method: "DELETE" });
    expect(del.status).toBe(204);
    const get = await fetch(`${srv.baseUrl}/sessions/${s.id}`);
    expect(get.status).toBe(404);
  });

  it("returns 404 for unknown session", async () => {
    const r = await fetch(`${srv.baseUrl}/sessions/sess_nope`);
    expect(r.status).toBe(404);
  });
});
