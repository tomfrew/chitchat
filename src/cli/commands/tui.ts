import { startRuntime } from "../../tui/runtime.js";
import { runTui } from "../../tui/app.js";

/**
 * Default `chitchat` invocation: boot the HTTP/MCP daemon in-process and
 * render the TUI. Ctrl-C / q quits both. If stdout isn't a TTY (piped,
 * redirected, running under a supervisor with no PTY) fall back to headless
 * serve mode so you don't end up with a silent process you can't interact
 * with.
 */
export async function runDefault(opts: { port?: number; headless?: boolean }): Promise<void> {
  const isTty = Boolean(process.stdout.isTTY);
  if (opts.headless || !isTty) {
    const { runServe } = await import("./serve.js");
    await runServe({ port: opts.port });
    return;
  }

  const rt = await startRuntime({ port: opts.port, logs: "silent" });
  const shutdown = async () => {
    await rt.close();
  };
  process.once("SIGTERM", () => {
    shutdown().then(() => process.exit(0));
  });
  try {
    await runTui(rt);
  } finally {
    await shutdown();
    process.exit(0);
  }
}
