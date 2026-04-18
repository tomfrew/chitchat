import React from "react";
import { render } from "ink";
import { startRuntime } from "../../tui/runtime.js";
import { App } from "../../tui/app.js";

/**
 * Default `chitchat` invocation: boot the HTTP/MCP daemon in-process and
 * render the TUI (Ink/React). Ctrl-C / q quits both. If stdout isn't a TTY
 * (piped, redirected, running under a supervisor with no PTY) fall back to
 * headless serve mode.
 */
export async function runDefault(opts: { port?: number; headless?: boolean }): Promise<void> {
  const isTty = Boolean(process.stdout.isTTY);
  if (opts.headless || !isTty) {
    const { runServe } = await import("./serve.js");
    await runServe({ port: opts.port });
    return;
  }

  const rt = await startRuntime({ port: opts.port, logs: "silent" });

  // Switch to the alternate screen buffer so the TUI occupies its own
  // terminal canvas — nothing leaks into scrollback, and when we exit the
  // user's previous shell history is restored cleanly. This is what vim,
  // less, htop, etc. do. Ink doesn't toggle this on its own.
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

  process.once("SIGTERM", () => void shutdown(0));
  // SIGINT is also sent on Ctrl-C; ink handles Ctrl-C via useApp().exit()
  // so waitUntilExit will resolve naturally. But if a peer signals, we
  // still restore the terminal.
  process.once("SIGINT", () => void shutdown(0));
  // Belt-and-suspenders: if the process exits for any other reason
  // (uncaught exception, normal return), restore the buffer so the user's
  // terminal isn't left in alternate mode.
  process.once("exit", leaveAlt);

  try {
    await instance.waitUntilExit();
  } finally {
    await shutdown(0);
  }
}
