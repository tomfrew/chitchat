import { RestClient, defaultBaseUrl, ensureDaemonOrExit } from "../rest-client.js";
import { resolveRef } from "../resolve-ref.js";
import { color } from "../format.js";

export async function runTail(ref: string): Promise<void> {
  const client = new RestClient(defaultBaseUrl());
  await ensureDaemonOrExit(client);
  const session = await resolveRef(client, ref);
  const resp = await client.stream(`/sessions/${session.id}/stream`);
  process.stderr.write(`Following ${session.topic}. Ctrl-C to exit.\n`);
  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value);
    let i: number;
    while ((i = buf.indexOf("\n\n")) !== -1) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const lines = chunk.split("\n");
      const event = (lines.find((l) => l.startsWith("event:")) ?? "event: ?").slice(7).trim();
      const data = (lines.find((l) => l.startsWith("data:")) ?? "data: {}").slice(6);
      try {
        const obj = JSON.parse(data) as Record<string, unknown>;
        const ts = new Date((obj.ts as number | undefined) ?? Date.now())
          .toISOString()
          .slice(11, 19);
        if (event === "message") {
          const who = `${color.cyan(String(obj.from ?? "system"))} (${String(obj.role ?? "?")})`;
          process.stdout.write(`${color.dim(`[${ts}]`)} ${who}: ${String(obj.body ?? "")}\n`);
        } else if (event === "role") {
          process.stdout.write(
            color.dim(`[${ts}] --- ${String(obj.name)} role: ${String(obj.role)} ---\n`),
          );
        } else if (event === "peer_join") {
          process.stdout.write(
            color.dim(`[${ts}] --- ${String(obj.name)} (${String(obj.role)}) joined ---\n`),
          );
        } else if (event === "peer_leave") {
          process.stdout.write(color.dim(`[${ts}] --- ${String(obj.name)} left ---\n`));
        } else if (event === "session_closed") {
          process.stdout.write(color.dim(`[${ts}] --- session closed ---\n`));
          return;
        }
      } catch {
        // ignore malformed
      }
    }
  }
}
