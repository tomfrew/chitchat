export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  debug(msg: string, meta?: Record<string, unknown>): void;
}

export function consoleLogger(): Logger {
  const emit = (level: string) => (msg: string, meta?: Record<string, unknown>) => {
    const line = { level, msg, ...(meta ?? {}) };
    process.stderr.write(JSON.stringify(line) + "\n");
  };
  return { info: emit("info"), warn: emit("warn"), error: emit("error"), debug: emit("debug") };
}

export function silentLogger(): Logger {
  return { info() {}, warn() {}, error() {}, debug() {} };
}
