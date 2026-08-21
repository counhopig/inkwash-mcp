// Inkpaper MCP server: pushes notifications to an Inkpaper channel webhook
// so any MCP client (opencode, Claude Code, Cursor, scripts) can surface
// messages on the Inkpaper e-ink device - `priority: "high"` makes the
// device show the URGENT screen and ring immediately.
//
// Configuration (env vars, registered by the MCP client):
//   INKPAPER_SERVER_URL    default http://127.0.0.1:8080
//   INKPAPER_CHANNEL_ID    required, the channel's webhook delivery id
//   INKPAPER_WEBHOOK_TOKEN required, the channel's `ipwh_` webhook token
//
// Wire contract mirrors inkpaper-server's `InboxCreateRequest`:
//   POST /api/channels/:id/messages
//   Authorization: Bearer ipwh_...
//   {"kind":"alert"|"event"|"info","title","body"?,"priority"?,"when"?}
//   -> {"accepted":true,"id":N} | HTTP 400/401 with an error body

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const SERVER_URL = process.env.INKPAPER_SERVER_URL ?? "http://127.0.0.1:8080";
const CHANNEL_ID = process.env.INKPAPER_CHANNEL_ID ?? "";
const WEBHOOK_TOKEN = process.env.INKPAPER_WEBHOOK_TOKEN ?? "";

if (!CHANNEL_ID || !WEBHOOK_TOKEN) {
  console.error(
    "inkpaper-mcp: INKPAPER_CHANNEL_ID and INKPAPER_WEBHOOK_TOKEN are required",
  );
  process.exit(1);
}

const server = new McpServer(
  {
    name: "inkpaper",
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
      "Push a notification to the Inkpaper e-ink device via its channel webhook. " +
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
        .describe("Message kind as classified by the Inkpaper server"),
      when: z
        .number()
        .int()
        .optional()
        .describe("Optional Unix epoch seconds for the message timestamp"),
    },
  },
  async (args) => {
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
        content: [
          {
            type: "text",
            text: `Inkpaper server unreachable at ${SERVER_URL}: ${(err as Error).message}`,
          },
        ],
        isError: true,
      };
    }
    const elapsed = Date.now() - started;
    const text = await response.text();
    if (!response.ok) {
      const detail = text.slice(0, 300);
      return {
        content: [
          {
            type: "text",
            text: `Inkpaper delivery failed (HTTP ${response.status}): ${detail}`,
          },
        ],
        isError: true,
      };
    }
    return {
      content: [
        {
          type: "text",
          text: `Delivered to Inkpaper (HTTP ${response.status}, ${elapsed}ms): ${text}`,
        },
      ],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);