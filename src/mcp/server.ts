import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Db } from "../storage/db.js";
import type { SessionHub } from "../hub/session-hub.js";
import type { Logger } from "../logger.js";
import { buildIdentifyTool, IDENTIFY_TOOL_DEF } from "./tools/identify.js";
import { buildPostMessage, POST_MESSAGE_TOOL_DEF } from "./tools/post-message.js";
import { buildGetMessages, GET_MESSAGES_TOOL_DEF } from "./tools/get-messages.js";
import { buildInboxPeek, INBOX_PEEK_TOOL_DEF } from "./tools/inbox-peek.js";
import { buildUpdateRole, UPDATE_ROLE_TOOL_DEF } from "./tools/update-role.js";
import { buildListPeers, LIST_PEERS_TOOL_DEF } from "./tools/list-peers.js";
import { buildLeave, LEAVE_TOOL_DEF } from "./tools/leave.js";
import { buildListSessions, LIST_SESSIONS_TOOL_DEF } from "./tools/list-sessions.js";
import {
  buildGetMonitorCommand,
  GET_MONITOR_COMMAND_TOOL_DEF,
} from "./tools/get-monitor-command.js";
import { registerResources } from "./resources.js";
import { parseSkill, composeInstructions } from "./skill-loader.js";

export interface McpDeps {
  db: Db;
  hub: SessionHub;
  logger: Logger;
  host: string;
  port: number;
  /** If the incoming URL pinned a session (/mcp/:id), this is pre-set in state. */
  initialSessionId?: string;
}

export interface ConnectionState {
  sessionId: string | null;
  agentId: string | null;
  agentName: string | null;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_PATH = join(__dirname, "..", "..", "skills", "agent", "SKILL.md");
const skillMarkdown = (() => {
  try {
    return readFileSync(SKILL_PATH, "utf8");
  } catch {
    return "# ChitChat Agent Skill\n(SKILL.md not found)";
  }
})();

const parsedSkill = parseSkill(skillMarkdown);
const composedInstructions = composeInstructions(parsedSkill);

export function buildMcpServer(
  deps: McpDeps,
): { server: Server; state: ConnectionState; dispose: () => void } {
  const state: ConnectionState = {
    sessionId: deps.initialSessionId ?? null,
    agentId: null,
    agentName: null,
  };
  const server = new Server(
    { name: "chitchat", version: "0.1.0" },
    {
      capabilities: {
        tools: { listChanged: true },
        resources: { subscribe: true, listChanged: true },
        prompts: {},
        logging: {},
      },
      instructions: composedInstructions,
    },
  );

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: [{ name: "onboarding", description: "Full ChitChat usage primer." }],
  }));
  server.setRequestHandler(GetPromptRequestSchema, async (req) => {
    if (req.params.name !== "onboarding")
      throw new Error(`Unknown prompt: ${req.params.name}`);
    return {
      description: "ChitChat onboarding",
      messages: [{ role: "user", content: { type: "text", text: skillMarkdown } }],
    };
  });

  const postIdentifyTools = [
    POST_MESSAGE_TOOL_DEF,
    GET_MESSAGES_TOOL_DEF,
    INBOX_PEEK_TOOL_DEF,
    UPDATE_ROLE_TOOL_DEF,
    LIST_PEERS_TOOL_DEF,
    LEAVE_TOOL_DEF,
    GET_MONITOR_COMMAND_TOOL_DEF,
    LIST_SESSIONS_TOOL_DEF,
  ];
  const preIdentifyTools = [IDENTIFY_TOOL_DEF, LIST_SESSIONS_TOOL_DEF];

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: state.agentId ? postIdentifyTools : preIdentifyTools,
  }));

  const resources = registerResources(server, deps, state, skillMarkdown);

  const notifyToolListChanged = async () => {
    await server.sendToolListChanged();
  };

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    const args = req.params.arguments ?? {};
    switch (name) {
      case "identify":
        return buildIdentifyTool(deps, state, notifyToolListChanged, (sid) =>
          resources.bindSession(sid),
        )(args);
      case "list_sessions":
        return buildListSessions(deps, state)();
      case "post_message":
        return buildPostMessage(deps, state)(args);
      case "get_messages":
        return buildGetMessages(deps, state)(args);
      case "inbox_peek":
        return buildInboxPeek(deps, state)();
      case "update_role":
        return buildUpdateRole(deps, state)(args);
      case "list_peers":
        return buildListPeers(deps, state)();
      case "leave":
        return buildLeave(deps, state, notifyToolListChanged, () => resources.bindSession(null))();
      case "get_monitor_command":
        return buildGetMonitorCommand(deps, state)();
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });

  return {
    server,
    state,
    dispose: () => {
      resources.dispose();
    },
  };
}
