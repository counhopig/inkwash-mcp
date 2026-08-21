// Inkwash MCP server: pushes notifications to an Inkwash channel webhook
// so any MCP client (opencode, Claude Code, Cursor, scripts) can surface
// messages on the Inkwash e-ink device - `priority: "high"` makes the
// device show the URGENT screen and ring immediately.
//
// Configuration (env vars, registered by the MCP client):
//   INKWASH_SERVER_URL    default http://127.0.0.1:8080
//   INKWASH_CHANNEL_ID    required, the channel's webhook delivery id
//   INKWASH_WEBHOOK_TOKEN required, the channel's `ipwh_` webhook token
//
// Wire contract mirrors inkwash-server's `InboxCreateRequest`:
//   POST /api/channels/:id/messages
//   Authorization: Bearer ipwh_...
//   {"kind":"alert"|"event"|"info","title","body"?,"priority"?,"when"?}
//   -> {"accepted":true,"id":N} | HTTP 400/401 with an error body

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

export const SERVER_URL = process.env.INKWASH_SERVER_URL ?? "http://127.0.0.1:8080";
export const CHANNEL_ID = process.env.INKWASH_CHANNEL_ID ?? "";
export const WEBHOOK_TOKEN = process.env.INKWASH_WEBHOOK_TOKEN ?? "";

if (!CHANNEL_ID || !WEBHOOK_TOKEN) {
  console.error(
    "inkwash-mcp: INKWASH_CHANNEL_ID and INKWASH_WEBHOOK_TOKEN are required",
  );
  process.exit(1);
}

export interface NotifyArgs {
  kind: "alert" | "event" | "info";
  title: string;
  body: string;
  priority?: "normal" | "high";
  when?: number;
}

export interface DeliverResult {
  ok: boolean;
  text: string;
  isError?: boolean;
}

/// Shared delivery path used by both the MCP `notify` tool and the
/// stdio notify-client (notify.sh), so every caller speaks one code path.
export async function deliver(args: NotifyArgs): Promise<DeliverResult> {
  const url = `${SERVER_URL}/api/channels/${CHANNEL_ID}/messages`;
  const started = Date.now();
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${WEBHOOK_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        kind: args.kind,
        title: args.title,
        body: args.body ?? "",
        ...(args.priority ? { priority: args.priority } : {}),
        ...(args.when !== undefined ? { when: args.when } : {}),
      }),
    });
  } catch (err) {
    return {
      ok: false,
      isError: true,
      text: `Inkwash server unreachable at ${SERVER_URL}: ${(err as Error).message}`,
    };
  }
  const elapsed = Date.now() - started;
  const text = await response.text();
  if (!response.ok) {
    return {
      ok: false,
      isError: true,
      text: `Inkwash delivery failed (HTTP ${response.status}): ${text.slice(0, 300)}`,
    };
  }
  return {
    ok: true,
    text: `Delivered to Inkwash (HTTP ${response.status}, ${elapsed}ms): ${text}`,
  };
}

const server = new McpServer(
  {
    name: "inkwash",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.registerTool(
  "notify",
  {
    title: "notify",
    description:
      "Push a notification to the Inkwash e-ink device via its channel webhook. " +
      "Use priority high for time-critical alerts - the device shows a full-screen " +
      "URGENT reminder and rings immediately. Normal messages land in the device inbox.",
    inputSchema: {
      title: z
        .string()
        .min(1)
        .max(120)
        .describe("Short notification title shown on the device (max 120 chars)"),
      body: z.string().max(1000).optional().describe("Optional detail text (max 1000 chars)"),
      priority: z
        .enum(["normal", "high"])
        .default("normal")
        .describe("high = device shows the URGENT full-screen reminder and rings immediately"),
      kind: z
        .enum(["alert", "event", "info"])
        .default("alert")
        .describe("Message kind as classified by the Inkwash server"),
      when: z
        .number()
        .int()
        .optional()
        .describe("Optional Unix epoch seconds for the message timestamp"),
    },
  },
  async (args) => {
    const result = await deliver(args);
    return {
      content: [{ type: "text", text: result.text }],
      isError: result.isError,
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);