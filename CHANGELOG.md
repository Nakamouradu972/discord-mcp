# Changelog

All notable changes to this project are documented here. The project follows
[Semantic Versioning](https://semver.org/): given a stack rewrite that is not
backward-compatible, this release is a **major** bump.

## [2.1.1] — 2026-05-31

### Fixed
- **HTTP transport:** a session is now opened **only** for an `initialize`
  request. Session-less non-initialize POSTs (and GET/DELETE without a known
  session) are rejected with `400` instead of silently spinning up an orphan
  MCP server per request.

### Internal
- `app.ts` refactored to export a testable `createHttpApp(client, config)`
  factory; added integration tests for the HTTP session routing (the entrypoint
  was previously untested).

## [2.1.0] — 2026-05-31

### Added (backward-compatible)
- **channels:** `list_channels` and `get_channel_info` read tools — the domain
  could create/edit/delete channels but not list or inspect them.
- **messages:** `reply_to_message` — send a message as a reply to an existing one.
- Unit tests for the core `loadConfig` (env parsing) and `AuditLogger` (JSONL
  output, secret redaction, failure-safety) modules.

Tool count: **86 → 89** (29 read · 43 write · 17 destructive).

## [2.0.0] — 2026-05-31

### ⚠️ Breaking change — full rewrite (Java → TypeScript)

The server was reimplemented from scratch in **TypeScript / discord.js** on top
of the official **`@modelcontextprotocol/sdk`**, replacing the previous
**Java / Spring Boot / Spring AI / JDA** implementation.

There is **no backward compatibility** with the 1.x Java tool set: tool names,
parameters and transports changed. Update any client configuration accordingly.

#### Migration notes
- **Run command** — replace the Java jar / Spring profile with Node:
  - stdio (default): `node build/index.js`
  - HTTP streamable: `node build/app.js --transport http --port 3000`
- **Build** — `npm install && npm run build` (was `mvn package`).
- **Env** — `DISCORD_TOKEN` and optional `DISCORD_GUILD_ID` are unchanged. New
  optional vars: `DISCORD_MCP_ACTOR`, `DISCORD_MCP_AUDIT_FILE`,
  `DISCORD_MCP_DRY_RUN_DEFAULT`.
- **Writes are dry-run by default** — mutating tools return a preview and only
  execute with `dryRun: false`; destructive tools also require `confirm: true`.
- **Docker** — image is now Node 22 and defaults to the HTTP transport on port
  3000 (was Spring Boot on 8085).

### Added
- Generic guardrails layer shared by every tool: dry-run, explicit confirmation
  on destructive actions, local JSONL audit log, rate-limit retry with backoff,
  and zod input validation.
- 86 tools across 18 domains (base, channels, roles, messages, reactions, forum,
  webhooks, members, moderation, guild, invites, events, polls, emojis, automod,
  audit, threads, raw).
- `discord_raw` generic REST passthrough as a safety net for uncovered routes.
- Unit test suite (Vitest, discord.js mocked, no network) and
  `docs/EXTENSION_PLAN.md`.

### Preserved
- MIT license and original copyright from the upstream `SaseQ/discord-mcp`.
