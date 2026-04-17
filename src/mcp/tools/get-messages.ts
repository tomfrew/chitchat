import { z } from "zod";
import type { McpDeps, ConnectionState } from "../server.js";
import { getMessagesWithSender } from "../../storage/messages.js";
import { setAgentCursor, getAgent } from "../../storage/agents.js";

const schema = z
  .object({
    since: z.string().optional(),
    before: z.string().optional(),
    limit: z.number().int().positive().max(500).optional(),
    mark_read: z.boolean().optional(),
  })
  .refine((v) => !(v.since && v.before), {
    message: "`since` and `before` are mutually exclusive",
  });

export const GET_MESSAGES_TOOL_DEF = {
  name: "get_messages",
  description:
    "Fetch messages. With no args: everything after your last read cursor, mark read (this is the canonical 'what's new' call). `before` pages backwards through history. `since` pages forwards. `limit` defaults to 50, max 500. `mark_read` defaults true when paging forward, false when paging backward.",
  inputSchema: {
    type: "object",
    properties: {
      since: { type: "string" },
      before: { type: "string" },
      limit: { type: "integer", minimum: 1, maximum: 500 },
      mark_read: { type: "boolean" },
    },
  },
};

export function buildGetMessages(deps: McpDeps, state: ConnectionState) {
  return async (args: unknown) => {
    if (!state.agentId) throw new Error("Call identify first.");
    const opts = schema.parse(args ?? {});
    const agent = getAgent(deps.db, state.agentId);
    if (!agent) throw new Error("agent record missing");

    const defaultSince = agent.last_cursor ?? "";
    const isBackward = opts.before !== undefined;
    const effective = {
      since: isBackward ? undefined : (opts.since ?? defaultSince),
      before: opts.before,
      limit: opts.limit,
    };
    const markRead = opts.mark_read ?? !isBackward;

    const rows = getMessagesWithSender(deps.db, deps.sessionId, effective);
    const payload = rows.map((m) => ({
      id: m.id,
      from: m.sender_name,
      role: m.sender_role,
      body: m.body,
      meta: m.meta,
      ts: m.created_at,
    }));

    if (markRead && rows.length > 0 && !isBackward) {
      setAgentCursor(deps.db, state.agentId, rows[rows.length - 1].id);
    }

    return { content: [{ type: "text", text: JSON.stringify(payload) }] };
  };
}
