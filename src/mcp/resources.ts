import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { McpDeps } from "./server.js";
import { getSession } from "../storage/sessions.js";
import { listActiveAgents } from "../storage/agents.js";
import { getMessages } from "../storage/messages.js";

export const URI = {
  session: "chitterchatter://session",
  messages: "chitterchatter://messages",
  peers: "chitterchatter://peers",
  skill: "chitterchatter://skill",
};

export function registerResources(
  server: Server,
  deps: McpDeps,
  skillMarkdown: string,
): () => void {
  const subscriptions = new Set<string>();

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
    if (uri === URI.session) {
      const s = getSession(deps.db, deps.sessionId);
      return {
        contents: [{ uri, mimeType: "application/json", text: JSON.stringify(s ?? null) }],
      };
    }
    if (uri === URI.messages) {
      const latest = getMessages(deps.db, deps.sessionId, { limit: 50 });
      return {
        contents: [{ uri, mimeType: "application/json", text: JSON.stringify(latest) }],
      };
    }
    if (uri === URI.peers) {
      const peers = listActiveAgents(deps.db, deps.sessionId).map((a) => ({
        name: a.name,
        role: a.role,
        joined_at: a.joined_at,
      }));
      return {
        contents: [{ uri, mimeType: "application/json", text: JSON.stringify(peers) }],
      };
    }
    if (uri === URI.skill) {
      return { contents: [{ uri, mimeType: "text/markdown", text: skillMarkdown }] };
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

  const unsub = deps.hub.subscribe(deps.sessionId, (event) => {
    const affected: string[] = [];
    if (event.type === "message") affected.push(URI.messages);
    if (
      event.type === "peer_join" ||
      event.type === "peer_leave" ||
      event.type === "role_changed"
    )
      affected.push(URI.peers);
    if (event.type === "session_closed") affected.push(URI.session);
    for (const uri of affected) {
      if (subscriptions.has(uri)) {
        server.sendResourceUpdated({ uri }).catch(() => {});
      }
    }
  });

  return unsub;
}
