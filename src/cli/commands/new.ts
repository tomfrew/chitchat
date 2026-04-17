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
      `${color.bold("URL:")}     ${color.cyan(`${url.origin}/mcp/${session.id}`)}\n` +
      `${color.bold("Stream:")}  ${color.cyan(`${url.origin}/sessions/${session.id}/stream`)}\n\n` +
      `Paste the URL into an agent's MCP config to join.\n`,
  );
}
