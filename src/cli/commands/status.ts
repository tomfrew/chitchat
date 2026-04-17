import { RestClient, defaultBaseUrl } from "../rest-client.js";

export async function runStatus(opts: { json?: boolean }): Promise<void> {
  const client = new RestClient(defaultBaseUrl());
  try {
    const s = await client.get<{ ok: boolean; uptime_ms: number; version: string }>("/status");
    if (opts.json) {
      process.stdout.write(JSON.stringify({ running: true, ...s }) + "\n");
      return;
    }
    process.stdout.write(
      `chitchat ${s.version} running at ${client.baseUrl} (uptime ${Math.round(s.uptime_ms / 1000)}s)\n`,
    );
  } catch {
    if (opts.json) {
      process.stdout.write(
        JSON.stringify({ running: false, baseUrl: client.baseUrl }) + "\n",
      );
      process.exit(2);
    }
    process.stdout.write(`no daemon at ${client.baseUrl}\n`);
    process.exit(2);
  }
}
