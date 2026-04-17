import { RestClient, defaultBaseUrl, ensureDaemonOrExit } from "../rest-client.js";
import { resolveRef } from "../resolve-ref.js";

export async function runClose(ref: string): Promise<void> {
  const client = new RestClient(defaultBaseUrl());
  await ensureDaemonOrExit(client);
  const session = await resolveRef(client, ref);
  await client.post(`/sessions/${session.id}/close`);
  process.stdout.write(`Closed ${session.topic} (${session.id})\n`);
}
