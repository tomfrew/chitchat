import type { McpDeps, ConnectionState } from "../server.js";
import { listSessions } from "../../storage/sessions.js";
import { listActiveAgents } from "../../storage/agents.js";
import { countMessagesAfter } from "../../storage/messages.js";

export const LIST_SESSIONS_TOOL_DEF = {
  name: "list_sessions",
  description:
    "List open sessions you can join on this server. Use this before `identify` to pick a topic, unless the MCP URL you were handed already pins one. Returns each session's id, topic, description, peer count, and message count so you can choose which conversation to join.",
  inputSchema: { type: "object", properties: {} },
};

export function buildListSessions(deps: McpDeps, _state: ConnectionState) {
  return async () => {
    const sessions = listSessions(deps.db, { all: false }).map((s) => ({
      id: s.id,
      topic: s.topic,
      description: s.description,
      created_at: s.created_at,
      peer_count: listActiveAgents(deps.db, s.id).length,
      message_count: countMessagesAfter(deps.db, s.id, null),
    }));
    return { content: [{ type: "text", text: JSON.stringify(sessions) }] };
  };
}
