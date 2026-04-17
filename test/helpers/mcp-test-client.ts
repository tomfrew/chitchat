import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export async function connectMcp(baseUrl: string, sessionId?: string) {
  const path = sessionId ? `/mcp/${sessionId}` : "/mcp";
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}${path}`));
  const client = new Client({ name: "test-client", version: "0.1.0" });
  await client.connect(transport);
  return { client, close: () => client.close() };
}
