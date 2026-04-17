import { z } from "zod";
import type { McpDeps, ConnectionState } from "../server.js";
import { updateAgentRole, getAgent } from "../../storage/agents.js";
import { getSession } from "../../storage/sessions.js";

const schema = z.object({ role: z.string().min(1).max(200) });

export const UPDATE_ROLE_TOOL_DEF = {
  name: "update_role",
  description:
    "Change your self-described role. Peers get notified via a resource update and SSE event. Use when your responsibilities evolve (e.g., 'backend' → 'backend + migrations').",
  inputSchema: {
    type: "object",
    properties: { role: { type: "string", minLength: 1, maxLength: 200 } },
    required: ["role"],
  },
};

export function buildUpdateRole(deps: McpDeps, state: ConnectionState) {
  return async (args: unknown) => {
    if (!state.agentId) throw new Error("Call identify first.");
    const session = getSession(deps.db, state.sessionId!);
    if (!session || session.closed_at)
      throw new Error("Session is closed; role changes are disabled. Call `leave`.");
    const { role } = schema.parse(args);
    updateAgentRole(deps.db, state.agentId, role);
    const agent = getAgent(deps.db, state.agentId);
    if (!agent) throw new Error("agent record missing");
    deps.hub.publish({
      type: "role_changed",
      session_id: state.sessionId!,
      name: agent.name,
      role,
    });
    return { content: [{ type: "text", text: JSON.stringify({ name: agent.name, role }) }] };
  };
}
