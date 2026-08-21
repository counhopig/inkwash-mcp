// Protocol smoke test: spawns the MCP server over stdio, lists tools, and
// calls `notify` against the real local Inkwash server.
//
// Usage:
//   INKWASH_CHANNEL_ID=<id> INKWASH_WEBHOOK_TOKEN=<token> bun run test.ts
//   (server URL defaults to http://127.0.0.1:8080; the local server must be running)

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const serverUrl = process.env.INKWASH_SERVER_URL ?? "http://127.0.0.1:8080";
const channelId = process.env.INKWASH_CHANNEL_ID ?? "";
const token = process.env.INKWASH_WEBHOOK_TOKEN ?? "";

if (!channelId || !token) {
  console.error("INKWASH_CHANNEL_ID and INKWASH_WEBHOOK_TOKEN are required");
  process.exit(1);
}

const transport = new StdioClientTransport({
  command: "bun",
  args: ["run", "src/index.ts"],
  env: {
    ...process.env,
    INKWASH_SERVER_URL: serverUrl,
    INKWASH_CHANNEL_ID: channelId,
    INKWASH_WEBHOOK_TOKEN: token,
  },
  stderr: "pipe",
});

const client = new Client({ name: "inkwash-mcp-test", version: "0.1.0" });
await client.connect(transport);

const tools = await client.listTools();
console.log("TOOLS:", tools.tools.map((t) => t.name).join(", "));

const normal = await client.callTool({
  name: "notify",
  arguments: {
    title: "MCP 冒烟测试",
    body: "normal priority from inkwash-mcp test",
    priority: "normal",
    kind: "info",
  },
});
console.log("NORMAL:", JSON.stringify(normal));

const high = await client.callTool({
  name: "notify",
  arguments: {
    title: "MCP URGENT",
    body: "high priority - device should ring",
    priority: "high",
    kind: "alert",
  },
});
console.log("HIGH:", JSON.stringify(high));

await client.close();
console.log("PASS");