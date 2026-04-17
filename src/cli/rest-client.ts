export class RestClient {
  constructor(public baseUrl: string) {}

  async get<T>(path: string): Promise<T> {
    const r = await fetch(this.baseUrl + path);
    await this.ensureOk(r);
    return r.json() as Promise<T>;
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    const r = await fetch(this.baseUrl + path, {
      method: "POST",
      headers: body ? { "content-type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    await this.ensureOk(r);
    return r.status === 204 ? (undefined as T) : ((await r.json()) as T);
  }

  async delete(path: string): Promise<void> {
    const r = await fetch(this.baseUrl + path, { method: "DELETE" });
    await this.ensureOk(r);
  }

  async stream(path: string): Promise<Response> {
    const r = await fetch(this.baseUrl + path);
    await this.ensureOk(r);
    return r;
  }

  private async ensureOk(r: Response) {
    if (r.ok) return;
    let body: { error?: string } = {};
    try {
      body = (await r.json()) as { error?: string };
    } catch {
      // ignore
    }
    throw new Error(`${r.status} ${r.statusText}: ${body.error ?? "request failed"}`);
  }
}

export function defaultBaseUrl(): string {
  return (
    process.env.CHITCHAT_URL ??
    `http://127.0.0.1:${process.env.CHITCHAT_PORT ?? 7777}`
  );
}

export async function ensureDaemonOrExit(client: RestClient): Promise<void> {
  try {
    await client.get("/status");
  } catch {
    process.stderr.write(
      `No chitchat daemon at ${client.baseUrl}. ` +
        `Run \`chitchat serve\` in another terminal.\n`,
    );
    process.exit(2);
  }
}
