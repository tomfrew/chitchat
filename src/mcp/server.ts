import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Db } from "../storage/db.js";
import type { SessionHub } from "../hub/session-hub.js";
import type { Logger } from "../logger.js";
import { buildIdentifyTool, IDENTIFY_TOOL_DEF } from "./tools/identify.js";
import { buildPostMessage, POST_MESSAGE_TOOL_DEF } from "./tools/post-message.js";
import { buildGetMessages, GET_MESSAGES_TOOL_DEF } from "./tools/get-messages.js";
import { buildInboxPeek, INBOX_PEEK_TOOL_DEF } from "./tools/inbox-peek.js";

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
        "ChitterChatter — multi-agent chat. Call `identify` first, then `inbox_peek` after every turn; `get_messages` when unread > 0. Put prose in `body`, structured refs in `meta`.",
    },
  );

  const postIdentifyTools = [POST_MESSAGE_TOOL_DEF, GET_MESSAGES_TOOL_DEF, INBOX_PEEK_TOOL_DEF];

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: state.agentId ? postIdentifyTools : [IDENTIFY_TOOL_DEF],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    const args = req.params.arguments ?? {};
    if (name === "identify") {
      return buildIdentifyTool(deps, state, async () => {
        await server.sendToolListChanged();
      })(args);
    }
    if (name === "post_message") return buildPostMessage(deps, state)(args);
    if (name === "get_messages") return buildGetMessages(deps, state)(args);
    if (name === "inbox_peek") return buildInboxPeek(deps, state)();
    throw new Error(`Unknown tool: ${name}`);
  });

  return { server, state };
}
