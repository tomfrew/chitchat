import React from "react";
import { render } from "ink";
import { startRuntime } from "../../tui/runtime.js";
import { App } from "../../tui/app.js";

export async function runDefault(opts: { port?: number; headless?: boolean }): Promise<void> {
  const isTty = Boolean(process.stdout.isTTY);
  if (opts.headless || !isTty) {
    const { runServe } = await import("./serve.js");
    await runServe({ port: opts.port });
    return;
  }

  const rt = await startRuntime({ port: opts.port, logs: "silent" });

  // Alternate screen buffer — Ink doesn't toggle this itself.
  const ALT_ENTER = "\x1b[?1049h\x1b[H";
  const ALT_LEAVE = "\x1b[?1049l";
  let altActive = false;
  const enterAlt = () => {
    if (altActive) return;
    process.stdout.write(ALT_ENTER);
    altActive = true;
  };
  const leaveAlt = () => {
    if (!altActive) return;
    process.stdout.write(ALT_LEAVE);
    altActive = false;
  };

  enterAlt();
  const instance = render(React.createElement(App, { runtime: rt }));

  let shuttingDown = false;
  const shutdown = async (code = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    instance.unmount();
    leaveAlt();
    try {
      await rt.close();
    } catch {
      /* ignore */
    }
    process.exit(code);
  };

  // Always restore the alt buffer on any exit path.
  process.once("SIGTERM", () => void shutdown(0));
  process.once("SIGINT", () => void shutdown(0));
  process.once("exit", leaveAlt);

  try {
    await instance.waitUntilExit();
  } finally {
    await shutdown(0);
  }
}
