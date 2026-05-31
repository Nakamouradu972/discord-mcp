# Changelog

All notable changes to this project are documented here. The project follows
[Semantic Versioning](https://semver.org/): given a stack rewrite that is not
backward-compatible, this release is a **major** bump.

## [2.6.0] — 2026-05-31

### Removed — autonomous runner / real-time event stack
Reverted the v2.5.0 real-time work. This package is now purely an **administration**
MCP (REST on demand) for driving Discord from Claude Desktop over HTTP; it no longer
ships any building blocks for a reactive bot.

- Removed the **gateway worker** (`src/gateway/`) that deferred interactions and
  enqueued events.
- Removed the **SQLite event queue** (`src/core/eventQueue.ts`) and the
  `node:sqlite` ExperimentalWarning shim (`src/core/warnings.ts`).
- Removed the **`realtime` tools** (`poll_events`, `respond_interaction`,
  `complete_event`) and the `ToolContext.queue` plumbing.
- Removed the related env vars (`DISCORD_MCP_EVENTS`, `DISCORD_MCP_QUEUE_FILE`,
  `DISCORD_MCP_EVENTS_INTERACTIONS/MENTIONS/CHANNELS`) and `docs/REALTIME_DESIGN.md`.
- `engines.node` relaxed back to **≥ 18** (the `node:sqlite` requirement is gone).

The HTTP transport security from 2.4.0 (bearer auth, bind host, DNS-rebinding
protection, secure compose) is **kept** — that is the admin-over-HTTP path.
Tool count: **108 → 105** (31 read · 53 write · 21 destructive).

## [2.5.0] — 2026-05-31

### Added — real-time events & interactions (Option B, phases 2–3)
- **Gateway worker** (`src/gateway/`): opt-in via `DISCORD_MCP_EVENTS=true`. Keeps
  a gateway connection that **defers interactions within Discord's 3 s deadline**
  and **enqueues** events (interactions + bot mentions by default; configurable).
- **SQLite event queue** (`src/core/eventQueue.ts`) using the built-in
  `node:sqlite` (no external dependency) with at-least-once claim semantics and
  interaction-token expiry. Persisted to `DISCORD_MCP_QUEUE_FILE`.
- **`realtime` tools:** `poll_events` (claim pending events), `respond_interaction`
  (reply to a deferred slash command / button via its eventId, supports
  text/embeds/buttons/ephemeral) and `complete_event`. They error clearly when
  the worker is disabled.
- Both entrypoints wire the queue into the MCP tool context when events are on.
- `node:sqlite`'s ExperimentalWarning is suppressed cleanly; the module is loaded
  lazily so it never appears unless the queue is actually used.

Requires **Node ≥ 22** (for `node:sqlite`); `engines` updated accordingly.
Tool count: **105 → 108** (32 read · 55 write · 21 destructive).

> This delivers phases 2–3 of `docs/REALTIME_DESIGN.md`. The autonomous runner
> (phase 4, a separate service per the chosen B2 topology) is intentionally not
> part of the MCP package.

## [2.4.0] — 2026-05-31

### Added — HTTP transport security (real-time Option B, phase 1)
- **Bearer-token authentication** on the HTTP `/mcp` endpoint via
  `DISCORD_MCP_AUTH_TOKEN` (requests without a valid token get 401). Empty token
  keeps the endpoint open for localhost/dev.
- **DNS-rebinding protection**: optional `DISCORD_MCP_ALLOWED_HOSTS` /
  `DISCORD_MCP_ALLOWED_ORIGINS` allow-lists.
- **Configurable bind host** via `DISCORD_MCP_BIND` (defaults to `127.0.0.1`;
  the Docker image sets `0.0.0.0` for use behind a reverse proxy). A warning is
  logged when the endpoint runs unauthenticated.
- `docker-compose.yml` reworked for a secure remote deployment: internal-only
  `expose`, a mounted `mcp-data` volume for the audit log (and future event
  queue), and auth/actor env wiring. Documented in `docs/REALTIME_DESIGN.md` §8.

This is **phase 1** of the real-time design (security first); the gateway worker,
event queue and `poll_events` / `respond_interaction` tools follow.

## [2.3.0] — 2026-05-31

### Added (backward-compatible)
- **Members:** `send_dm` (direct message a user), `prune_members` (destructive)
  and `get_prune_count` (dry estimate).
- **Base:** `set_presence` — set the bot's online status and activity
  (Playing/Streaming/Listening/Watching/Competing).
- **Channels / roles:** `set_channel_position` and `set_role_position` for
  reordering the channel list and role hierarchy.
- **New `voice` domain:** `start_stage_instance`, `edit_stage_instance`,
  `stop_stage_instance` and `disconnect_member`.
- Docs (README, EXTENSION_PLAN, LLM_GUIDE) updated to cover the new tools.

Tool count: **95 → 105** (31 read · 53 write · 21 destructive).

## [2.2.0] — 2026-05-31

### Added (backward-compatible)
- **Rich messages:** `send` now accepts `embeds`, `files` (by URL) and `buttons`
  (link buttons work standalone) in addition to text; new `send_embed`
  convenience tool. Shared `buildMessagePayload` helper in `src/core/`.
- **Slash commands** domain: `list_application_commands`,
  `register_application_command`, `delete_application_command`.
- **Stickers:** `create_sticker` and `delete_sticker`.
- **AutoMod (complete):** `create_automod_rule` / `edit_automod_rule` now support
  all trigger types (Keyword, Spam, KeywordPreset, MentionSpam) and
  block / timeout / alert actions, plus role/channel exemptions.
- **Docs:** new `docs/LLM_GUIDE.md` explaining the guardrail workflow, rich
  messages, and how to reach any endpoint via `discord_raw`; documents the
  request/response limits (no interaction/event handling).

Tool count: **89 → 95** (31 read · 46 write · 18 destructive).

### Note
This MCP remains request/response: it cannot reply to slash-command invocations
or button clicks (no gateway interaction handler). Registration and sending work;
responding requires an external handler.

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
