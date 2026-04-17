import readline from "node:readline";
import { RestClient, defaultBaseUrl, ensureDaemonOrExit } from "../rest-client.js";
import { resolveRef } from "../resolve-ref.js";

export async function runRm(ref: string, opts: { yes?: boolean }): Promise<void> {
  const client = new RestClient(defaultBaseUrl());
  await ensureDaemonOrExit(client);
  const session = await resolveRef(client, ref, { includeClosed: true });
  if (!opts.yes) {
    const answer = await new Promise<string>((resolve) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
      rl.question(
        `Delete session "${session.topic}" (${session.id}) and all its messages? [y/N] `,
        (a) => {
          rl.close();
          resolve(a);
        },
      );
    });
    if (!/^y(es)?$/i.test(answer.trim())) {
      process.stdout.write("cancelled\n");
      return;
    }
  }
  await client.delete(`/sessions/${session.id}`);
  process.stdout.write(`Removed ${session.id}\n`);
}
