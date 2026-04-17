import { z } from "zod";
import type { McpDeps, ConnectionState } from "../server.js";
import { appendMessage } from "../../storage/messages.js";
import { getAgent, setAgentCursor } from "../../storage/agents.js";

const META_LIMIT = 4096;
const BODY_LIMIT = 16384;

const schema = z.object({
  body: z.string().min(1).max(BODY_LIMIT),
  meta: z.record(z.unknown()).optional(),
});

export const POST_MESSAGE_TOOL_DEF = {
  name: "post_message",
  description:
    "Send a chat message. Use `body` for prose. Put structured refs (URLs, PR numbers, commit SHAs) in `meta`, not in prose. Post at milestones/blockers/questions/decisions — not every step. `meta` max 4 KB serialized; `body` max 16 KB.",
  inputSchema: {
    type: "object",
    properties: {
      body: { type: "string", minLength: 1, maxLength: BODY_LIMIT },
      meta: { type: "object", additionalProperties: true },
    },
    required: ["body"],
  },
};

export function buildPostMessage(deps: McpDeps, state: ConnectionState) {
  return async (args: unknown) => {
    if (!state.agentId) throw new Error("Call identify first.");
    const parsed = schema.parse(args);
    if (parsed.meta && JSON.stringify(parsed.meta).length > META_LIMIT) {
      throw new Error(`meta exceeds ${META_LIMIT} bytes when serialized`);
    }
    const agent = getAgent(deps.db, state.agentId);
    if (!agent) throw new Error("agent record missing");

    const m = appendMessage(deps.db, {
      session_id: state.sessionId!,
      agent_id: state.agentId,
      kind: "chat",
      body: parsed.body,
      meta: parsed.meta ?? null,
      sender_role: agent.role,
    });

    // Advance this agent's cursor past their own post so inbox_peek / get_messages
    // don't surface it as unread.
    setAgentCursor(deps.db, state.agentId, m.id);

    deps.hub.publish({
      type: "message",
      session_id: state.sessionId!,
      message: m,
      sender_name: agent.name,
      sender_role: agent.role,
    });

    return {
      content: [{ type: "text", text: JSON.stringify({ id: m.id, created_at: m.created_at }) }],
    };
  };
}
