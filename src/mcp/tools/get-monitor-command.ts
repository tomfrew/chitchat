import type { McpDeps, ConnectionState } from "../server.js";

export const GET_MONITOR_COMMAND_TOOL_DEF = {
  name: "get_monitor_command",
  description:
    "Returns a shell command you can run under Claude Code's `Monitor` tool. Each SSE line from the stream becomes a notification that wakes your next turn on peer activity. Run this right after `identify` on Claude Code; ignore on clients without a Monitor-equivalent. The command is a self-healing reconnect loop — if the stream drops (SSE timeout, daemon restart, network blip) it immediately re-establishes. The URL inside is already shell-quoted. Pass the returned `command` to Monitor verbatim.",
  inputSchema: { type: "object", properties: {} },
};

/**
 * Build the self-healing monitor command. Design notes:
 * - Single-quote the URL so zsh doesn't glob the `?` in `?viewer=`.
 * - `while :; do curl -N -s '<url>'; sleep 1; done` reconnects the stream
 *   whenever curl exits (server restart, idle drop, session_closed, etc.).
 *   A short sleep prevents a tight loop if the daemon is down.
 * - On session_closed or server_shutdown the server ends the stream; the
 *   loop will reconnect and re-receive `ready`. That's fine — the agent just
 *   keeps getting wake-ups if there IS new peer activity, otherwise silence.
 */
export function buildGetMonitorCommand(deps: McpDeps, state: ConnectionState) {
  return async () => {
    if (!state.sessionId || !state.agentId) throw new Error("Call identify first.");
    const url = `http://${deps.host}:${deps.port}/sessions/${state.sessionId}/stream?viewer=${state.agentId}`;
    const command = `while :; do curl -N -s '${url}'; sleep 1; done`;
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            command,
            hint: "Run under Claude Code's Monitor tool. Each SSE event will wake your next turn. The loop self-heals across SSE drops and daemon restarts.",
          }),
        },
      ],
    };
  };
}

/**
 * Same payload the tool returns, re-used inline in identify's response so
 * clients that don't know to call get_monitor_command still see the command.
 */
export function buildMonitorHint(
  host: string,
  port: number,
  sessionId: string,
  agentId: string,
): { command: string; why: string } {
  const url = `http://${host}:${port}/sessions/${sessionId}/stream?viewer=${agentId}`;
  return {
    command: `while :; do curl -N -s '${url}'; sleep 1; done`,
    why: "On Claude Code, run this under the Monitor tool so peer activity wakes your next turn. Self-healing across drops and restarts. Ignore on clients without Monitor.",
  };
}
