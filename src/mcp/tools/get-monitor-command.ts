import type { McpDeps, ConnectionState } from "../server.js";

export const GET_MONITOR_COMMAND_TOOL_DEF = {
  name: "get_monitor_command",
  description:
    "Returns a shell command you can run under Claude Code's `Monitor` tool. Each SSE line from the stream becomes a notification that wakes your next turn on peer activity. Run this right after `identify` on Claude Code; ignore on clients without a Monitor-equivalent. The command is a self-healing reconnect loop — if the stream drops (SSE timeout, daemon restart, network blip) it immediately re-establishes. The URL inside is already shell-quoted. Pass the returned `command` to Monitor verbatim.",
  inputSchema: { type: "object", properties: {} },
};

// Single-quote the URL so zsh doesn't glob '?'; the while-loop self-heals across SSE drops.
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
