import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { buildMcpServer } from "../mcp/server.js";
import type { AppDeps } from "./app.js";
import { getSession } from "../storage/sessions.js";

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

  return async (req: IncomingMessage, res: ServerResponse, sessionId: string) => {
    if (!getSession(deps.db, sessionId)) {
      res.statusCode = 404;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "session not found" }));
      return;
    }

    const mcpSessionId =
      (req.headers["mcp-session-id"] as string | undefined)?.toString();

    // Existing transport — reuse.
    if (mcpSessionId && transports.has(mcpSessionId)) {
      await transports.get(mcpSessionId)!.transport.handleRequest(req, res);
      return;
    }

    if (req.method === "POST") {
      // Initialize request starts a new transport.
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

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) transports.delete(sid);
      };

      const sock = req.socket;
      const host = sock?.localAddress === "::1" ? "127.0.0.1" : (sock?.localAddress ?? "127.0.0.1");
      const port = sock?.localPort ?? 0;
      const { server } = buildMcpServer({ ...deps, sessionId, host, port });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
      return;
    }

    // GET/DELETE without a valid session id → bad request.
    res.statusCode = 400;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "Invalid or missing MCP session id" }));
  };
}
