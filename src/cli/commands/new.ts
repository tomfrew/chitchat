import { RestClient, defaultBaseUrl, ensureDaemonOrExit } from "../rest-client.js";
import { color } from "../format.js";
import type { Session } from "../../storage/sessions.js";

export async function runNew(
  topic: string,
  opts: { description?: string; json?: boolean },
): Promise<void> {
  const client = new RestClient(defaultBaseUrl());
  await ensureDaemonOrExit(client);
  const session = await client.post<Session>("/sessions", {
    topic,
    description: opts.description,
  });
  if (opts.json) {
    process.stdout.write(JSON.stringify(session) + "\n");
    return;
  }
  const url = new URL(client.baseUrl);
  process.stdout.write(
    `${color.bold("Session:")} ${session.topic}  ${color.dim(`(id: ${session.id})`)}\n` +
      `\n` +
      `${color.bold("Agents:")}  install ${color.cyan(`${url.origin}/mcp`)} as an MCP server\n` +
      `         (configure once, globally). Then on connect:\n` +
      `           ${color.dim("→ call")} ${color.cyan("identify")} ${color.dim("with")} session=${color.cyan(`"${session.topic}"`)}${color.dim(", role=\"...\"")}\n` +
      `\n` +
      `${color.bold("Tail:")}    ${color.cyan(`${url.origin}/sessions/${session.id}/stream`)}\n` +
      `${color.bold("Pinned:")}  ${color.cyan(`${url.origin}/mcp/${session.id}`)} ${color.dim("(URL auto-joins this session; skip if you're configuring globally)")}\n`,
  );
}
