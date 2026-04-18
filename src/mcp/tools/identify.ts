import { z } from "zod";
import type { McpDeps, ConnectionState } from "../server.js";
import { pickName, NAME_POOL } from "../../names/generator.js";
import {
  activeNamesInSession,
  createAgent,
  findAgentByPersistentId,
  getAgent,
  listActiveAgents,
  reviveAgent,
  setAgentCursor,
  updateAgentRole,
} from "../../storage/agents.js";
import { getMessagesWithSender, latestMessageId } from "../../storage/messages.js";
import { getSession, getSessionByTopic } from "../../storage/sessions.js";
import { buildMonitorHint } from "./get-monitor-command.js";

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
    "- `role` (required): your team role in ONE short phrase. Think Slack status, not turn narration. Good: 'frontend on the auth refactor', 'backend — API + migrations', 'QA on MCP surface', 'docs + DX'. Bad: 'verifying the fix works', 'observing and will assist', 'reconnected after restart'.\n" +
    "- `session`: topic name or session id to join. Omit only if the MCP URL already pinned a session.\n" +
    "- `persistent_id` (strongly recommended): an opaque string that identifies YOU across reconnects. Reusing the same value on reconnect gets you the SAME agent row back — same friendly name, same read cursor, no duplicate peer_join — so peers don't see you churn if your MCP transport drops.\n\n" +
    "Returns: `{ agent_id, session_id, name, reclaim, peers, recent_messages, cursor }`. `reclaim` is 'none' (fresh join), 'revived' (had called leave before), or 'reused' (prior session still considered active — this is the transport-reconnect case).",
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
          "Opaque self-chosen id. Use the same value on every identify — server reuses your prior agent row, so your name/cursor/history survive transport drops.",
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

    let agent: NonNullable<ReturnType<typeof getAgent>>;
    let reclaim: "none" | "reused" | "revived" = "none";
    let emitPeerJoin = true;

    const prior = persistent_id
      ? findAgentByPersistentId(deps.db, sessionId, persistent_id)
      : undefined;

    if (prior && prior.left_at === null) {
      if (prior.role !== role) updateAgentRole(deps.db, prior.id, role);
      agent = { ...prior, role };
      reclaim = "reused";
      emitPeerJoin = false;
    } else if (prior && prior.left_at !== null) {
      reviveAgent(deps.db, prior.id, role);
      agent = { ...prior, role, left_at: null };
      reclaim = "revived";
    } else {
      const taken = activeNamesInSession(deps.db, sessionId);
      if (taken.length >= NAME_POOL.length * 50) throw new Error("Session is too full.");
      const name = pickName(taken, { seed: sessionId });
      agent = createAgent(deps.db, {
        session_id: sessionId,
        name,
        role,
        persistent_id: persistent_id ?? null,
      });
      const latest = latestMessageId(deps.db, sessionId);
      if (latest) {
        setAgentCursor(deps.db, agent.id, latest);
        agent = { ...agent, last_cursor: latest };
      }
    }

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
        online: true,
      }));

    const recent = getMessagesWithSender(deps.db, sessionId, { limit: 20 }).map((m) => ({
      id: m.id,
      from: m.sender_name,
      role: m.sender_role,
      body: m.body,
      meta: m.meta,
      ts: m.created_at,
    }));

    if (emitPeerJoin) {
      deps.hub.publish({
        type: "peer_join",
        session_id: sessionId,
        name: agent.name,
        role: agent.role,
      });
    } else if (prior && prior.role !== role) {
      // Silent reuse, but we did change the role — let peers see that.
      deps.hub.publish({
        type: "role_changed",
        session_id: sessionId,
        name: agent.name,
        role,
      });
    }

    await notifyToolListChanged();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            agent_id: agent.id,
            session_id: sessionId,
            name: agent.name,
            reclaim,
            peers,
            recent_messages: recent,
            cursor: agent.last_cursor ?? "",
            monitor_hint: buildMonitorHint(deps.host, deps.port, sessionId, agent.id),
          }),
        },
      ],
    };
  };
}
