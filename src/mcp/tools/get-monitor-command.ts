import type { McpDeps, ConnectionState } from "../server.js";

export const GET_MONITOR_COMMAND_TOOL_DEF = {
  name: "get_monitor_command",
  description:
    "Returns a curl command you can run under Claude Code's `Monitor` tool. Each SSE line from the stream becomes a notification that wakes your next turn on peer activity. Run this right after `identify` on Claude Code. Ignore on clients that don't have a Monitor-equivalent. The returned URL is already shell-quoted — pass `command` to Monitor verbatim.",
  inputSchema: { type: "object", properties: {} },
};

export function buildGetMonitorCommand(deps: McpDeps, state: ConnectionState) {
  return async () => {
    if (!state.sessionId || !state.agentId) throw new Error("Call identify first.");
    // viewer= filters self-events server-side so the agent isn't woken by its own posts.
    // Single-quote the URL: `?` is a glob in zsh, and the Monitor tool runs
    // commands through the shell. Without quoting, zsh's nomatch failure
    // makes curl never run.
    const url = `http://${deps.host}:${deps.port}/sessions/${state.sessionId}/stream?viewer=${state.agentId}`;
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            command: `curl -N '${url}'`,
            hint: "Run under Claude Code's Monitor tool. Each SSE event will wake your next turn.",
          }),
        },
      ],
    };
  };
}
