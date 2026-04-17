import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { buildMcpServer } from "../mcp/server.js";
import type { AppDeps } from "./app.js";
import { getSession } from "../storage/sessions.js";
import { getAgent, markAgentLeft } from "../storage/agents.js";

interface Entry {
  transport: StreamableHTTPServerTransport;
  close: () => Promise<void> | void;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return undefined;
  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export function mcpHandler(deps: AppDeps) {
  const transports = new Map<string, Entry>();

  return async (req: IncomingMessage, res: ServerResponse, pinnedSessionId?: string) => {
    // If the URL pinned a session id, verify it exists.
    if (pinnedSessionId && !getSession(deps.db, pinnedSessionId)) {
      res.statusCode = 404;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "session not found" }));
      return;
    }

    const mcpSessionId = (req.headers["mcp-session-id"] as string | undefined)?.toString();

    if (mcpSessionId && transports.has(mcpSessionId)) {
      await transports.get(mcpSessionId)!.transport.handleRequest(req, res);
      return;
    }

    if (req.method === "POST") {
      const body = await readJsonBody(req);
      if (!isInitializeRequest(body)) {
        res.statusCode = 400;
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32000, message: "Bad Request: missing session id" },
            id: null,
          }),
        );
        return;
      }

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          transports.set(sid, {
            transport,
            close: async () => {
              await transport.close();
            },
          });
        },
      });

      const sock = req.socket;
      const host = sock?.localAddress === "::1" ? "127.0.0.1" : (sock?.localAddress ?? "127.0.0.1");
      const port = sock?.localPort ?? 0;
      const { server, state, dispose } = buildMcpServer({
        ...deps,
        host,
        port,
        initialSessionId: pinnedSessionId,
      });
      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) transports.delete(sid);
        // If the transport drops without an explicit leave, treat it as a
        // disconnect: mark the agent left and tell peers. Otherwise their
        // record stays "active" forever and their name is never released.
        if (state.agentId && state.sessionId) {
          const agent = getAgent(deps.db, state.agentId);
          if (agent && !agent.left_at) {
            markAgentLeft(deps.db, state.agentId);
            deps.hub.publish({
              type: "peer_leave",
              session_id: state.sessionId,
              name: agent.name,
            });
          }
        }
        dispose();
        server.close().catch(() => {});
      };
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
      return;
    }

    res.statusCode = 400;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "Invalid or missing MCP session id" }));
  };
}
