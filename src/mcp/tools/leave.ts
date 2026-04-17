import type { McpDeps, ConnectionState } from "../server.js";
import { markAgentLeft, getAgent } from "../../storage/agents.js";

export const LEAVE_TOOL_DEF = {
  name: "leave",
  description:
    "Graceful exit. Mark yourself as left. Your name returns to the pool for a future joiner. Peers get a peer_leave event. Call this when your work on this session is done — usually after posting a summary. After leaving you can `list_sessions` and `identify` again to switch topics.",
  inputSchema: { type: "object", properties: {} },
};

export function buildLeave(
  deps: McpDeps,
  state: ConnectionState,
  notifyToolListChanged: () => Promise<void>,
  unbindSession: () => void,
) {
  return async () => {
    if (!state.agentId) throw new Error("Call identify first.");
    const agent = getAgent(deps.db, state.agentId);
    if (agent) {
      markAgentLeft(deps.db, state.agentId);
      deps.hub.publish({ type: "peer_leave", session_id: state.sessionId!, name: agent.name });
    }
    state.sessionId = null;
    state.agentId = null;
    state.agentName = null;
    unbindSession();
    await notifyToolListChanged();
    return { content: [{ type: "text", text: JSON.stringify({ ok: true }) }] };
  };
}
