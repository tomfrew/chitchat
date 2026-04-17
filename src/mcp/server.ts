import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Db } from "../storage/db.js";
import type { SessionHub } from "../hub/session-hub.js";
import type { Logger } from "../logger.js";
import { buildIdentifyTool, IDENTIFY_TOOL_DEF } from "./tools/identify.js";

export interface McpDeps {
  db: Db;
  hub: SessionHub;
  logger: Logger;
  sessionId: string;
}

export interface ConnectionState {
  agentId: string | null;
  agentName: string | null;
}

export function buildMcpServer(deps: McpDeps): { server: Server; state: ConnectionState } {
  const state: ConnectionState = { agentId: null, agentName: null };

  const server = new Server(
    { name: "chitterchatter", version: "0.1.0" },
    {
      capabilities: {
        tools: { listChanged: true },
        resources: { subscribe: true, listChanged: true },
        prompts: {},
        logging: {},
      },
      instructions:
        "ChitterChatter — multi-agent chat server. Call `identify` first; after that the full toolset appears. After every turn call `inbox_peek`, and if unread > 0 call `get_messages`. Put prose in `body`, structured refs in `meta`.",
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: state.agentId ? [] : [IDENTIFY_TOOL_DEF],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    if (req.params.name === "identify") {
      const tool = buildIdentifyTool(deps, state, async () => {
        await server.sendToolListChanged();
      });
      return tool(req.params.arguments ?? {});
    }
    throw new Error(`Unknown tool: ${req.params.name}`);
  });

  return { server, state };
}
