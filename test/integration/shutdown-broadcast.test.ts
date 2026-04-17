import { describe, it, expect } from "vitest";
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

describe("graceful shutdown", () => {
  it("broadcasts server_shutdown to SSE subscribers and exits within 2s", async () => {
    const port = await findFreePort();
    const home = mkdtempSync(join(tmpdir(), "chitchat-shutdown-"));
    const daemon = spawn(
      "node",
      ["dist/bin/chitchat.js", "serve", "--port", String(port)],
      { env: { ...process.env, HOME: home }, stdio: "pipe" },
    );
    try {
      // wait for listen
      for (let i = 0; i < 60; i++) {
        try {
          const r = await fetch(`http://127.0.0.1:${port}/status`);
          if (r.ok) break;
        } catch {
          // still booting
        }
        await delay(100);
      }

      // create a session
      const created = (await (
        await fetch(`http://127.0.0.1:${port}/sessions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ topic: "shut" }),
        })
      ).json()) as { id: string };

      // open SSE
      const controller = new AbortController();
      const resp = await fetch(`http://127.0.0.1:${port}/sessions/${created.id}/stream`, {
        signal: controller.signal,
      });
      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      const events: string[] = [];
      const readOne = async (): Promise<string | null> => {
        while (true) {
          const i = buf.indexOf("\n\n");
          if (i !== -1) {
            const chunk = buf.slice(0, i);
            buf = buf.slice(i + 2);
            events.push(chunk);
            return chunk;
          }
          let read;
          try {
            read = await reader.read();
          } catch {
            return null;
          }
          if (read.done) return null;
          buf += decoder.decode(read.value);
        }
      };
      await readOne(); // consume initial `ready`

      const t0 = Date.now();
      daemon.kill("SIGINT");

      // Wait for the shutdown event, then expect the stream to end.
      let shutdownEvent: string | null = null;
      for (let i = 0; i < 10; i++) {
        const evt = await Promise.race([readOne(), delay(500).then(() => null)]);
        if (evt && typeof evt === "string" && /event: server_shutdown/.test(evt)) {
          shutdownEvent = evt;
          break;
        }
      }
      expect(shutdownEvent).not.toBeNull();
      expect(shutdownEvent).toMatch(/event: server_shutdown/);
      expect(shutdownEvent).toMatch(/SIGINT/);

      await new Promise<void>((resolve) => {
        daemon.once("exit", () => resolve());
      });
      const elapsed = Date.now() - t0;
      expect(elapsed).toBeLessThan(2500);
      controller.abort();
    } finally {
      if (!daemon.killed) daemon.kill("SIGKILL");
      rmSync(home, { recursive: true, force: true });
    }
  }, 30_000);
});
