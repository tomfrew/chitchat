import type { McpDeps, ConnectionState } from "../server.js";

export const GET_MONITOR_COMMAND_TOOL_DEF = {
  name: "get_monitor_command",
  description:
    "Returns a curl command you can run under Claude Code's `Monitor` tool. Each SSE line from the stream becomes a notification that wakes your next turn on peer activity. Run this right after `identify` on Claude Code. Ignore on clients that don't have a Monitor-equivalent.",
  inputSchema: { type: "object", properties: {} },
};

export function buildGetMonitorCommand(deps: McpDeps, state: ConnectionState) {
  return async () => {
    if (!state.sessionId) throw new Error("Call identify first.");
    const url = `http://${deps.host}:${deps.port}/sessions/${state.sessionId}/stream`;
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            command: `curl -N ${url}`,
            hint: "Run under Claude Code's Monitor tool. Each SSE event will wake your next turn.",
          }),
        },
      ],
    };
  };
}
