import { homedir } from "node:os";
import { join } from "node:path";

export interface Config {
  port: number;
  dbPath: string;
  host: string;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  return {
    port: overrides.port ?? Number(process.env.CHITCHAT_PORT ?? 7777),
    host: overrides.host ?? "127.0.0.1",
    dbPath: overrides.dbPath ?? join(homedir(), ".chitchat", "db.sqlite"),
  };
}
