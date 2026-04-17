import { z } from "zod";
import type { McpDeps, ConnectionState } from "../server.js";
import { pickName, NAME_POOL } from "../../names/generator.js";
import {
  activeNamesInSession,
  createAgent,
  listActiveAgents,
  setAgentCursor,
} from "../../storage/agents.js";
import { getMessages, latestMessageId } from "../../storage/messages.js";

const schema = z.object({ role: z.string().min(1).max(200) });

export const IDENTIFY_TOOL_DEF = {
  name: "identify",
  description:
    "Register with the session. Must be called first (it is the only tool available until you do). Pass a 1-sentence `role` describing what you are doing. Returns your assigned friendly name, peers already here, and the last ~20 messages so you can catch up.",
  inputSchema: {
    type: "object",
    properties: { role: { type: "string", minLength: 1, maxLength: 200 } },
    required: ["role"],
  },
};

export function buildIdentifyTool(
  deps: McpDeps,
  state: ConnectionState,
  notifyToolListChanged: () => Promise<void>,
) {
  return async (args: unknown) => {
    if (state.agentId) throw new Error("Already identified.");
    const { role } = schema.parse(args);

    const taken = activeNamesInSession(deps.db, deps.sessionId);
    if (taken.length >= NAME_POOL.length * 50) throw new Error("Session is too full.");
    const name = pickName(taken);

    const agent = createAgent(deps.db, { session_id: deps.sessionId, name, role });

    const latest = latestMessageId(deps.db, deps.sessionId);
    if (latest) setAgentCursor(deps.db, agent.id, latest);

    state.agentId = agent.id;
    state.agentName = agent.name;

    const peers = listActiveAgents(deps.db, deps.sessionId)
      .filter((a) => a.id !== agent.id)
      .map((a) => ({
        name: a.name,
        role: a.role,
        joined_at: a.joined_at,
        last_active_at: a.joined_at,
        online: true,
      }));

    const recent = getMessages(deps.db, deps.sessionId, { limit: 20 })
      .slice(-20)
      .map((m) => ({
        id: m.id,
        from: null as string | null,
        role: null as string | null,
        body: m.body,
        meta: m.meta,
        ts: m.created_at,
      }));

    deps.hub.publish({
      type: "peer_join",
      session_id: deps.sessionId,
      name: agent.name,
      role: agent.role,
    });

    await notifyToolListChanged();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            agent_id: agent.id,
            name: agent.name,
            peers,
            recent_messages: recent,
            cursor: latest ?? "",
          }),
        },
      ],
    };
  };
}
