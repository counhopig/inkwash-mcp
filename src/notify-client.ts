// Inkwash notify client: delivers a notification by spawning the local
// Inkwash MCP server over stdio and calling its `notify` tool. This is the
// path every agent adapter (opencode plugin, Claude Code / Codex hooks via
// notify.sh) uses, so all delivery goes through the MCP server instead of
// posting to the webhook directly.
//
// Usage: bun run src/notify-client.ts [--high] "title" "body"
//
// The shared config file (~/.config/inkwash/config, or $INKWASH_CONFIG) is
// loaded into the spawned server's environment - it remains the single
// source of truth for server URL / channel / token.

import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const CONFIG_PATH = process.env.INKWASH_CONFIG ?? `${process.env.HOME ?? "~"}/.config/inkwash/config`;

/// Parses `KEY="value"` lines from the shared config into env vars the
/// MCP server understands. Unknown keys are ignored.
function loadConfigEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  try {
    const text = readFileSync(CONFIG_PATH, "utf8");
    for (const line of text.split("\n")) {
      const match = line.match(/^([A-Z_]+)=("?)(.*?)\2$/);
      if (!match) continue;
      const [, key, , raw] = match;
      if (
        key === "INKWASH_SERVER_URL" ||
        key === "INKWASH_CHANNEL_ID" ||
        key === "INKWASH_WEBHOOK_TOKEN"
      ) {
        env[key] = raw.replace(/\\"/g, '"');
      }
    }
  } catch {
    // Config file missing - fall through to the inherited environment.
  }
  return env;
}

const args = process.argv.slice(2);
const priority = args[0] === "--high" ? (args.shift(), "high") : "normal";
const title = args[0] ?? "";
const body = args[1] ?? "";

if (!title) {
  console.error("inkwash-notify-client: title required");
  process.exit(1);
}

const transport = new StdioClientTransport({
  command: "bun",
  args: ["run", `${import.meta.dir}/index.ts`],
  env: { ...process.env, ...loadConfigEnv() },
});
const client = new Client({ name: "inkwash-notify-client", version: "0.1.0" });

try {
  await client.connect(transport);
  const result = await client.callTool({
    name: "notify",
    arguments: { kind: "alert", title, body, priority },
  });
  const text = result.content
    .map((c) => ("text" in c ? c.text : ""))
    .join("\n");
  if (result.isError) {
    console.error(text);
    process.exit(1);
  }
  console.log(text);
} finally {
  await client.close();
}