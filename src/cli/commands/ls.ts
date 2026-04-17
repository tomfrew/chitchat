import { RestClient, defaultBaseUrl, ensureDaemonOrExit } from "../rest-client.js";
import { humanAge } from "../format.js";
import type { Session } from "../../storage/sessions.js";

export async function runLs(opts: { all?: boolean; json?: boolean }): Promise<void> {
  const client = new RestClient(defaultBaseUrl());
  await ensureDaemonOrExit(client);
  const { sessions } = await client.get<{ sessions: Session[] }>(
    "/sessions" + (opts.all ? "?all=1" : ""),
  );
  if (opts.json) {
    process.stdout.write(JSON.stringify(sessions) + "\n");
    return;
  }
  if (sessions.length === 0) {
    process.stdout.write("(no sessions)\n");
    return;
  }
  const rows = sessions.map((s) => ({
    id: s.id,
    topic: s.topic,
    age: humanAge(s.created_at),
    state: s.closed_at ? "closed" : "open",
  }));
  const w = (k: keyof (typeof rows)[0], min = 0) =>
    Math.max(min, ...rows.map((r) => String(r[k]).length));
  const wId = w("id", 10);
  const wTopic = w("topic", 10);
  const wAge = w("age", 4);
  process.stdout.write(
    ["ID".padEnd(wId), "TOPIC".padEnd(wTopic), "AGE".padEnd(wAge), "STATE"].join("  ") + "\n",
  );
  for (const r of rows) {
    process.stdout.write(
      [r.id.padEnd(wId), r.topic.padEnd(wTopic), r.age.padEnd(wAge), r.state].join("  ") + "\n",
    );
  }
}
