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
import { getSession, getSessionByTopic } from "../../storage/sessions.js";

const schema = z.object({
  role: z.string().min(1).max(200),
  session: z.string().min(1).max(200).optional(),
});

export const IDENTIFY_TOOL_DEF = {
  name: "identify",
  description:
    "Register with a session. Must be called before any messaging tools become available. Pass a 1-sentence `role` describing what you are doing. Pass `session` (topic name or session id) to pick which session to join — omit it only if the MCP URL already pinned a session. Returns your assigned friendly name, the current peers, and the last ~20 messages so you can catch up.",
  inputSchema: {
    type: "object",
    properties: {
      role: { type: "string", minLength: 1, maxLength: 200 },
      session: {
        type: "string",
        minLength: 1,
        maxLength: 200,
        description: "Topic name or session id to join. Omit only if URL already pinned a session.",
      },
    },
    required: ["role"],
  },
};

function resolveSession(db: McpDeps["db"], ref: string): string | null {
  if (/^[0-9A-HJKMNP-TV-Z]{26}$/i.test(ref)) {
    const s = getSession(db, ref);
    if (s && !s.closed_at) return s.id;
    return null;
  }
  const s = getSessionByTopic(db, ref);
  return s ? s.id : null;
}

export function buildIdentifyTool(
  deps: McpDeps,
  state: ConnectionState,
  notifyToolListChanged: () => Promise<void>,
  bindSession: (sessionId: string) => void,
) {
  return async (args: unknown) => {
    if (state.agentId) throw new Error("Already identified.");
    const { role, session } = schema.parse(args);

    let sessionId = state.sessionId;
    if (session) {
      const resolved = resolveSession(deps.db, session);
      if (!resolved) throw new Error(`No open session matches "${session}".`);
      if (sessionId && sessionId !== resolved) {
        throw new Error(
          `This connection is pinned to session ${sessionId}; cannot join a different session.`,
        );
      }
      sessionId = resolved;
    }
    if (!sessionId) {
      throw new Error(
        "Pass `session` (topic or id). Call `list_sessions` to see available topics.",
      );
    }

    const taken = activeNamesInSession(deps.db, sessionId);
    if (taken.length >= NAME_POOL.length * 50) throw new Error("Session is too full.");
    const name = pickName(taken);

    const agent = createAgent(deps.db, { session_id: sessionId, name, role });

    const latest = latestMessageId(deps.db, sessionId);
    if (latest) setAgentCursor(deps.db, agent.id, latest);

    state.sessionId = sessionId;
    state.agentId = agent.id;
    state.agentName = agent.name;
    bindSession(sessionId);

    const peers = listActiveAgents(deps.db, sessionId)
      .filter((a) => a.id !== agent.id)
      .map((a) => ({
        name: a.name,
        role: a.role,
        joined_at: a.joined_at,
        last_active_at: a.joined_at,
        online: true,
      }));

    const recent = getMessages(deps.db, sessionId, { limit: 20 })
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
      session_id: sessionId,
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
            session_id: sessionId,
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
