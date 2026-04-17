import { describe, it, expect } from "bun:test";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function findFreePort(): Promise<number> {
  const net = await import("node:net");
  return new Promise<number>((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (addr && typeof addr !== "string") {
        const { port } = addr;
        srv.close((err) => (err ? reject(err) : resolve(port)));
      } else reject(new Error("no address"));
    });
  });
}

function run(
  args: string[],
  env: Record<string, string> = {},
): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve) => {
    const child = spawn("bun", ["run", "bin/chitchat.ts", ...args], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("close", (code) => resolve({ code: code ?? 0, out, err }));
  });
}

describe("CLI", () => {
  it("status prints 'no daemon' and exits 2 when nothing is running", async () => {
    const port = await findFreePort();
    const { code, out } = await run(["status", "--json"], {
      CHITCHAT_PORT: String(port),
    });
    expect(code).toBe(2);
    expect(JSON.parse(out)).toMatchObject({ running: false });
  });

  it(
    "serve boots; new/show/close/rm lifecycle works",
    async () => {
      const port = await findFreePort();
      const home = mkdtempSync(join(tmpdir(), "chitchat-home-"));
      const daemon = spawn(
        "bun", ["run", "bin/chitchat.ts", "serve", "--port", String(port)],
        { env: { ...process.env, HOME: home }, stdio: "pipe" },
      );
      try {
        for (let i = 0; i < 60; i++) {
          const s = await run(["status", "--json"], { CHITCHAT_PORT: String(port) });
          if (s.code === 0) break;
          await delay(100);
        }
        await run(["new", "life-topic", "--json"], { CHITCHAT_PORT: String(port) });
        const show = await run(["show", "life-topic", "--json"], {
          CHITCHAT_PORT: String(port),
        });
        expect(show.code).toBe(0);
        expect(JSON.parse(show.out)).toEqual([]);

        const close = await run(["close", "life-topic"], {
          CHITCHAT_PORT: String(port),
        });
        expect(close.code).toBe(0);

        const rm = await run(["rm", "life-topic", "--yes"], {
          CHITCHAT_PORT: String(port),
        });
        expect(rm.code).toBe(0);

        const lsAll = await run(["ls", "--all", "--json"], {
          CHITCHAT_PORT: String(port),
        });
        const parsed = JSON.parse(lsAll.out) as Array<{ topic: string }>;
        expect(parsed.find((s) => s.topic === "life-topic")).toBeUndefined();
      } finally {
        daemon.kill("SIGINT");
        await delay(200);
        rmSync(home, { recursive: true, force: true });
      }
    },
    30_000,
  );

  it(
    "serve boots, new creates a session visible via ls",
    async () => {
      const port = await findFreePort();
      const home = mkdtempSync(join(tmpdir(), "chitchat-home-"));
      const daemon = spawn(
        "bun", ["run", "bin/chitchat.ts", "serve", "--port", String(port)],
        { env: { ...process.env, HOME: home }, stdio: "pipe" },
      );
      try {
        for (let i = 0; i < 60; i++) {
          const s = await run(["status", "--json"], {
            CHITCHAT_PORT: String(port),
          });
          if (s.code === 0) break;
          await delay(100);
        }
        const create = await run(["new", "topic-a", "--json"], {
          CHITCHAT_PORT: String(port),
        });
        expect(create.code).toBe(0);
        const ls = await run(["ls", "--json"], {
          CHITCHAT_PORT: String(port),
        });
        expect(ls.code).toBe(0);
        const parsed = JSON.parse(ls.out) as Array<{ topic: string }>;
        expect(parsed.map((s) => s.topic)).toContain("topic-a");
      } finally {
        daemon.kill("SIGINT");
        await delay(200);
        rmSync(home, { recursive: true, force: true });
      }
    },
    30_000,
  );
});
