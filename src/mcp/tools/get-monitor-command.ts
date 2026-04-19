import type { McpDeps, ConnectionState } from "../server.js";

// Single-quote the URL so zsh doesn't glob '?'. Pipe through grep to drop SSE
// comment lines (keepalives, starting with ':') and blank event terminators —
// Monitor wakes on every stdout line, so unfiltered keepalives fire a wake
// every 10s. The while-loop self-heals across SSE drops.
function buildMonitorShellCommand(
  host: string,
  port: number,
  sessionId: string,
  agentId: string,
): string {
  const url = `http://${host}:${port}/sessions/${sessionId}/stream?viewer=${agentId}`;
  return `while :; do curl -N -s '${url}' | grep --line-buffered -Ev '^(:|$)'; sleep 1; done`;
}

export const GET_MONITOR_COMMAND_TOOL_DEF = {
  name: "get_monitor_command",
  description:
    "Returns a shell command you can run under Claude Code's `Monitor` tool. Each SSE event from the stream becomes a notification that wakes your next turn on peer activity. Run this right after `identify` on Claude Code; ignore on clients without a Monitor-equivalent. The command filters SSE keepalive comments and blank lines so only real events wake you, and self-heals across SSE drops, daemon restarts, and network blips. The URL inside is already shell-quoted. Pass the returned `command` to Monitor verbatim.",
  inputSchema: { type: "object", properties: {} },
};

export function buildGetMonitorCommand(deps: McpDeps, state: ConnectionState) {
  return async () => {
    if (!state.sessionId || !state.agentId) throw new Error("Call identify first.");
    const command = buildMonitorShellCommand(
      deps.host,
      deps.port,
      state.sessionId,
      state.agentId,
    );
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            command,
            hint: "Run under Claude Code's Monitor tool. Real SSE events wake your next turn; keepalives and blank lines are filtered out. Self-healing across drops and restarts.",
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
  return {
    command: buildMonitorShellCommand(host, port, sessionId, agentId),
    why: "On Claude Code, run this under the Monitor tool so peer activity wakes your next turn. Keepalives are filtered so idle time doesn't burn turns. Self-healing across drops and restarts. Ignore on clients without Monitor.",
  };
}
