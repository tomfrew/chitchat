import type { RestClient } from "./rest-client.js";
import type { Session } from "../storage/sessions.js";

export async function resolveRef(
  client: RestClient,
  ref: string,
  opts: { includeClosed?: boolean } = {},
): Promise<Session> {
  if (/^[0-9A-HJKMNP-TV-Z]{26}$/i.test(ref)) {
    const { session } = await client.get<{ session: Session }>(`/sessions/${ref}`);
    return session;
  }
  const { sessions } = await client.get<{ sessions: Session[] }>(
    `/sessions${opts.includeClosed ? "?all=1" : ""}`,
  );
  const matches = sessions.filter((s) => s.topic === ref);
  if (matches.length === 0) throw new Error(`No session with id or topic "${ref}"`);
  if (matches.length > 1)
    throw new Error(`Ambiguous: ${matches.length} sessions named "${ref}". Use an id.`);
  return matches[0];
}
