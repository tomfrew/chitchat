import { z } from "zod";
import type { McpDeps, ConnectionState } from "../server.js";
import { pickName, NAME_POOL } from "../../names/generator.js";
import {
  activeNamesInSession,
  createAgent,
  findAgentByPersistentId,
  listActiveAgents,
  setAgentCursor,
} from "../../storage/agents.js";
import { getMessages, latestMessageId } from "../../storage/messages.js";
import { getSession, getSessionByTopic } from "../../storage/sessions.js";

const schema = z.object({
  role: z.string().min(1).max(200),
  session: z.string().min(1).max(200).optional(),
  persistent_id: z.string().min(1).max(200).optional(),
});

export const IDENTIFY_TOOL_DEF = {
  name: "identify",
  description:
    "Register with a session. Must be called before any messaging tools become available.\n\n" +
    "Args:\n" +
    "- `role` (required): your team role in ONE short phrase. Think Slack status, not turn narration. Good: 'frontend on the auth refactor', 'backend — API + migrations', 'QA on MCP surface', 'docs + DX'. Bad: 'verifying the fix works', 'observing and will assist', 'reconnected after restart'. See the agent skill for examples.\n" +
    "- `session`: topic name or session id to join. Omit only if the MCP URL already pinned a session.\n" +
    "- `persistent_id` (optional but strongly recommended): an opaque string that identifies YOU across reconnects. Generate it once (e.g. a UUID you save to memory), then pass the same value on every identify. If a prior agent in this session used the same persistent_id, you get that same friendly name back instead of a fresh one — so peers don't see you flip from Bob to Alice on reconnect.\n\n" +
    "Returns: `{ agent_id, session_id, name, peers, recent_messages, cursor }`.",
  inputSchema: {
    type: "object",
    properties: {
      role: {
        type: "string",
        minLength: 1,
        maxLength: 200,
        description:
          "Your team role in one short phrase (e.g. 'frontend on auth', 'backend — API + migrations'). Stable across turns; update only when your position changes.",
      },
      session: {
        type: "string",
        minLength: 1,
        maxLength: 200,
        description: "Topic name or session id to join. Omit only if URL already pinned a session.",
      },
      persistent_id: {
        type: "string",
        minLength: 1,
        maxLength: 200,
        description:
          "Opaque self-chosen id for name reclaim across reconnects. Save it in your memory and reuse it.",
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
    const { role, session, persistent_id } = schema.parse(args);

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

    // Name reclaim via persistent_id: look up prior record, prefer that name.
    let preferName: string | undefined;
    if (persistent_id) {
      const prior = findAgentByPersistentId(deps.db, sessionId, persistent_id);
      if (prior) preferName = prior.name;
    }

    const name = pickName(taken, { seed: sessionId, prefer: preferName });

    const agent = createAgent(deps.db, {
      session_id: sessionId,
      name,
      role,
      persistent_id: persistent_id ?? null,
    });

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
            name_reclaimed: preferName === agent.name,
            peers,
            recent_messages: recent,
            cursor: latest ?? "",
          }),
        },
      ],
    };
  };
}
