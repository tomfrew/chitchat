import { RestClient, defaultBaseUrl, ensureDaemonOrExit } from "../rest-client.js";
import { resolveRef } from "../resolve-ref.js";
import { color } from "../format.js";

interface Msg {
  id: string;
  from: string | null;
  role: string | null;
  body: string;
  meta: unknown;
  ts: number;
}

export async function runShow(
  ref: string,
  opts: { limit?: number; json?: boolean },
): Promise<void> {
  const client = new RestClient(defaultBaseUrl());
  await ensureDaemonOrExit(client);
  const session = await resolveRef(client, ref, { includeClosed: true });
  const limit = opts.limit ?? 100;
  const { messages } = await client.get<{ messages: Msg[] }>(
    `/sessions/${session.id}/messages?limit=${limit}`,
  );
  if (opts.json) {
    process.stdout.write(JSON.stringify(messages) + "\n");
    return;
  }
  for (const m of messages) {
    const ts = new Date(m.ts).toISOString().slice(11, 19);
    const who = m.from ? `${color.cyan(m.from)} (${m.role})` : color.dim("system");
    process.stdout.write(`${color.dim(`[${ts}]`)} ${who}: ${m.body}\n`);
  }
}
