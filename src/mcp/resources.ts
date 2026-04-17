import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { McpDeps, ConnectionState } from "./server.js";
import { getSession } from "../storage/sessions.js";
import { listActiveAgents } from "../storage/agents.js";
import { getMessages } from "../storage/messages.js";

export const URI = {
  session: "chitchat://session",
  messages: "chitchat://messages",
  peers: "chitchat://peers",
  skill: "chitchat://skill",
};

export interface ResourceHandle {
  bindSession(sessionId: string | null): void;
  dispose(): void;
}

export function registerResources(
  server: Server,
  deps: McpDeps,
  state: ConnectionState,
  skillMarkdown: string,
): ResourceHandle {
  const subscriptions = new Set<string>();
  let hubUnsub: (() => void) | null = null;

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      { uri: URI.session, name: "Session metadata", mimeType: "application/json" },
      { uri: URI.messages, name: "Recent messages", mimeType: "application/json" },
      { uri: URI.peers, name: "Peer list", mimeType: "application/json" },
      { uri: URI.skill, name: "Agent skill (markdown)", mimeType: "text/markdown" },
    ],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    const uri = req.params.uri;
    if (uri === URI.skill) {
      return { contents: [{ uri, mimeType: "text/markdown", text: skillMarkdown }] };
    }
    const sessionId = state.sessionId;
    const empty = (text: string) => ({
      contents: [{ uri, mimeType: "application/json", text }],
    });
    if (!sessionId) return empty("null");

    if (uri === URI.session) {
      const s = getSession(deps.db, sessionId);
      return empty(JSON.stringify(s ?? null));
    }
    if (uri === URI.messages) {
      const latest = getMessages(deps.db, sessionId, { limit: 50 });
      return empty(JSON.stringify(latest));
    }
    if (uri === URI.peers) {
      const peers = listActiveAgents(deps.db, sessionId).map((a) => ({
        name: a.name,
        role: a.role,
        joined_at: a.joined_at,
      }));
      return empty(JSON.stringify(peers));
    }
    throw new Error(`Unknown resource: ${uri}`);
  });

  server.setRequestHandler(SubscribeRequestSchema, async (req) => {
    subscriptions.add(req.params.uri);
    return {};
  });
  server.setRequestHandler(UnsubscribeRequestSchema, async (req) => {
    subscriptions.delete(req.params.uri);
    return {};
  });

  function bindSession(sessionId: string | null) {
    if (hubUnsub) {
      hubUnsub();
      hubUnsub = null;
    }
    if (!sessionId) return;
    hubUnsub = deps.hub.subscribe(sessionId, (event) => {
      const affected: string[] = [];
      if (event.type === "message") affected.push(URI.messages);
      if (
        event.type === "peer_join" ||
        event.type === "peer_leave" ||
        event.type === "role_changed"
      )
        affected.push(URI.peers);
      if (event.type === "session_closed") affected.push(URI.session);
    if (event.type === "server_shutdown") {
      // Let subscribed MCP clients know state may be changing even if they're
      // not on the SSE stream. No URI-specific signal exists, so nudge session.
      affected.push(URI.session);
    }
      for (const uri of affected) {
        if (subscriptions.has(uri)) {
          server.sendResourceUpdated({ uri }).catch(() => {});
        }
      }
    });
  }

  // If the connection URL pinned a session, bind immediately.
  if (state.sessionId) bindSession(state.sessionId);

  return {
    bindSession,
    dispose: () => {
      if (hubUnsub) hubUnsub();
      hubUnsub = null;
    },
  };
}
