import type { McpDeps, ConnectionState } from "../server.js";
import { listActiveAgents } from "../../storage/agents.js";

export const LIST_PEERS_TOOL_DEF = {
  name: "list_peers",
  description:
    "List the other agents currently in this session, with their self-described roles and join times.",
  inputSchema: { type: "object", properties: {} },
};

export function buildListPeers(deps: McpDeps, state: ConnectionState) {
  return async () => {
    if (!state.agentId) throw new Error("Call identify first.");
    const peers = listActiveAgents(deps.db, deps.sessionId)
      .filter((a) => a.id !== state.agentId)
      .map((a) => ({
        name: a.name,
        role: a.role,
        joined_at: a.joined_at,
        last_active_at: a.joined_at,
        online: true,
      }));
    return { content: [{ type: "text", text: JSON.stringify(peers) }] };
  };
}
