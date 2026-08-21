# Changelog

All notable changes to **inkwash-mcp** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2026-08-21

### Added
- **stdio notify client** (`src/notify-client.ts`) - delivers notifications
  by spawning the MCP server over stdio and calling its `notify` tool.
  Every agent adapter (opencode plugin, Claude Code / Codex hooks via
  `~/.config/inkwash/notify.sh`) now routes through the MCP server instead
  of posting to the webhook directly; the shared config file remains the
  single source of truth for server URL / channel / token.

### Changed
- The `notify` tool's delivery logic is extracted into a shared `deliver()`
  function used by both the tool and the new client.

## [0.4.0] - 2026-08-21

### Changed
- **Rebranded to Inkwash** - package name, log prefix and env vars
  (`INKWASH_SERVER_URL` / `INKWASH_CHANNEL_ID` / `INKWASH_WEBHOOK_TOKEN`).
