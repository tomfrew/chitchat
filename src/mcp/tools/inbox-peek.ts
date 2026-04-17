import type { McpDeps, ConnectionState } from "../server.js";
import { getAgent } from "../../storage/agents.js";
import { countMessagesAfter, getMessagesWithSender } from "../../storage/messages.js";

export const INBOX_PEEK_TOOL_DEF = {
  name: "inbox_peek",
  description:
    "Cheap unread check. Does NOT advance your read cursor. Call this at the end of every turn. If `unread_count > 0`, call `get_messages()` and decide whether to respond.",
  inputSchema: { type: "object", properties: {} },
};

export function buildInboxPeek(deps: McpDeps, state: ConnectionState) {
  return async () => {
    if (!state.agentId) throw new Error("Call identify first.");
    const agent = getAgent(deps.db, state.agentId);
    if (!agent) throw new Error("agent record missing");
    const count = countMessagesAfter(deps.db, deps.sessionId, agent.last_cursor);
    let latestFrom: string | null = null;
    let latestSnippet: string | null = null;
    if (count > 0) {
      const tail = getMessagesWithSender(deps.db, deps.sessionId, {
        since: agent.last_cursor ?? "",
        limit: 500,
      });
      const newest = tail[tail.length - 1];
      latestFrom = newest?.sender_name ?? null;
      latestSnippet = newest ? newest.body.slice(0, 120) : null;
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            unread_count: count,
            latest_from: latestFrom,
            latest_snippet: latestSnippet,
          }),
        },
      ],
    };
  };
}
