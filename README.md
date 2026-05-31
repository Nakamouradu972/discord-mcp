# Discord MCP — VekTrel Edition

A **[Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction)** server for driving a Discord server end-to-end from an AI assistant (Claude Code, Claude Desktop, Cursor…). Written in **TypeScript** with **[discord.js](https://discord.js.org/)**.

This edition rewrites and extends the project to target **full coverage of the public Discord API** (channels, roles, members, moderation, automod, scheduled events, polls, emojis, invites, audit log, threads, webhooks, and a raw REST passthrough) behind a generic **guardrails** layer (dry-run, confirmation, audit, rate-limit).

> **Derived from** [`SaseQ/discord-mcp`](https://github.com/SaseQ/discord-mcp) — **MIT** licensed. The original copyright and license are preserved in [`LICENSE`](./LICENSE). See [License & credits](#license--credits).
> Maintained by **VekTrel** (dev branch of SASU PixL-Art Studio).

---

## Contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [Use with Claude / Cursor](#use-with-claude--cursor)
- [Guardrails](#guardrails)
- [Available tools](#available-tools)
- [Development](#development)
- [Security](#security)
- [License & credits](#license--credits)

---

## Features

108 tools across 21 domains, every write operation routed through the shared guardrail pipeline.

| Domain | Capabilities |
|---|---|
| **Base** | Login status, list servers, server info, send message (text, embeds, files, buttons), bot presence |
| **Channels & categories** | Create/edit/delete/reposition text, voice, forum, categories; permission overwrites |
| **Roles** | List, create, edit, delete, assign, remove, reposition |
| **Messages & reactions** | Send, read, search, edit, delete, bulk delete, pin, reactions |
| **Forum** | Posts, replies, tags, post management |
| **Webhooks** | Create, send, edit, delete |
| **Members** | List, details, edit (nickname, mute, deafen, voice move, timeout), DM, prune |
| **Moderation** | Ban, unban, kick, timeout, list bans, timeout status |
| **Voice & stage** | Start/edit/stop stage instances, disconnect member from voice |
| **Guild** | Read / edit server settings |
| **Invites** | Create, list, delete |
| **Scheduled events** | CRUD + subscriber listing |
| **Polls** | Create, end, results |
| **Emojis & stickers** | Emoji + sticker create/delete/list |
| **AutoMod** | Rule CRUD (Keyword, Spam, KeywordPreset, MentionSpam; block/timeout/alert) |
| **Audit log** | Query with user / action-type filters |
| **Threads** | Create, edit, delete, list, membership |
| **Slash commands** | Register, list, delete application commands |
| **Real-time** | Gateway worker + event queue; poll events and reply to interactions (opt-in) |
| **Raw API** | `discord_raw`: REST passthrough for any uncovered route |

See [`docs/EXTENSION_PLAN.md`](docs/EXTENSION_PLAN.md) for per-domain status, tools, required permissions and intents, and [`docs/LLM_GUIDE.md`](docs/LLM_GUIDE.md) for how an assistant should drive the server (guardrail workflow, rich messages, and reaching any endpoint via `discord_raw`). For the planned real-time / interaction-handling architecture (gateway worker + event queue, Docker remote deployment, Claude Desktop over HTTP), see [`docs/REALTIME_DESIGN.md`](docs/REALTIME_DESIGN.md).

---

## Requirements

- **Node.js** ≥ 18, **npm** ≥ 7
- A **Discord bot** (created on the [Developer Portal](https://discord.com/developers/applications))
  - Bot **token**
  - **Privileged Intents** as needed: *Message Content*, *Server Members*
- The bot must be **invited to the target server** (a bot only sees servers it has been added to).

### Bot permissions

**Quick setup:** `Administrator`.

**Granular** (per domain used):

| Domain | Discord permissions |
|---|---|
| Channels / categories | Manage Channels, View Channel |
| Roles | Manage Roles |
| Messages | Send Messages, Manage Messages, Add Reactions, Read Message History |
| Threads / Forum | Create Public Threads, Send Messages in Threads, Manage Threads |
| Webhooks | Manage Webhooks |
| Moderation | Kick Members, Ban Members, Moderate Members |
| Guild / AutoMod / Events | Manage Server, Manage Events |
| Emojis / Stickers | Manage Emojis and Stickers |
| Audit Log | View Audit Log |
| Invites | Create Instant Invite |

Invite link (replace `CLIENT_ID`):

```
https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot&permissions=8
```

(`permissions=8` = Administrator. For granular access, compute the matching bitfield.)

---

## Installation

### npm

```bash
git clone https://github.com/Nakamouradu972/discord-mcp.git
cd discord-mcp
npm install
npm run build
```

### Docker

```bash
docker build -t vektrel-discord-mcp .
docker run -e DISCORD_TOKEN=... -p 3000:3000 vektrel-discord-mcp
```

---

## Configuration

A token is required. Two transports are available:

| Transport | Entrypoint | Use |
|---|---|---|
| **stdio** (default) | `build/index.js` | Local MCP clients (Claude Code, Cursor) |
| **HTTP streamable** | `build/app.js` | Self-host, remote scenarios |

Environment variables:

```env
DISCORD_TOKEN=your_bot_token
DISCORD_GUILD_ID=default_server_id          # optional
DISCORD_MCP_ACTOR=your_name                 # optional, recorded in the audit log
DISCORD_MCP_AUDIT_FILE=./audit/audit-log.jsonl   # optional
DISCORD_MCP_DRY_RUN_DEFAULT=true            # optional, default true
```

> ⚠️ Never commit `.env`. See [Security](#security).

The server **boots even without a token** so MCP clients can connect and list tools; tools that hit Discord then return a clear "not logged in" error until a token is configured.

---

## Use with Claude / Cursor

### stdio transport (recommended locally)

```json
{
  "mcpServers": {
    "discord": {
      "command": "node",
      "args": ["/path/to/discord-mcp/build/index.js"],
      "env": {
        "DISCORD_TOKEN": "your_bot_token",
        "DISCORD_GUILD_ID": "optional_default_server_id"
      }
    }
  }
}
```

### HTTP transport (self-host)

```bash
DISCORD_TOKEN=your_token \
DISCORD_MCP_AUTH_TOKEN=a_long_random_secret \
node build/app.js --transport http --port 3000
# Endpoint: http://localhost:3000/mcp  (send: Authorization: Bearer <secret>)
```

The HTTP endpoint binds to `127.0.0.1` by default. For remote exposure, set
`DISCORD_MCP_AUTH_TOKEN` (bearer auth, returns 401 without it), optionally
`DISCORD_MCP_ALLOWED_HOSTS` / `DISCORD_MCP_ALLOWED_ORIGINS`, and put a TLS reverse
proxy in front. Connect Claude Desktop over HTTP with the `mcp-remote` bridge —
see [`docs/REALTIME_DESIGN.md`](docs/REALTIME_DESIGN.md) §7–§8.

---

## Guardrails

Every write operation goes through one shared, reusable pipeline (`src/core/`):

- **Dry-run** — ON by default for writes; returns the planned change **without executing**. Re-run with `dryRun: false` to apply.
- **Explicit confirmation** — destructive actions (delete channel/role, ban, bulk delete, `discord_raw`, …) additionally require `confirm: true`.
- **Local audit log** — who / what / when / outcome, appended as JSONL (sensitive fields redacted).
- **Rate-limit** — Discord 429s are retried with exponential backoff honouring the suggested delay.
- **Validation** — zod schemas on every input.

A tool's classification (`read` / `write` / `destructive`) is declared once and the pipeline applies the right behaviour automatically — domains never re-implement any of it.

---

## Available tools

> Prefix `discord_`. See [`docs/EXTENSION_PLAN.md`](docs/EXTENSION_PLAN.md) for permissions/intents per tool.

- **Base:** `login`, `list_servers`, `get_server_info`, `send` (text/embeds/files/buttons), `send_embed`, `set_presence`
- **Channels:** `list_channels`, `get_channel_info`, `create_text_channel`, `create_voice_channel`, `create_forum_channel`, `create_category`, `edit_channel`, `edit_category`, `delete_channel`, `delete_category`, `set_channel_position`, `set_channel_permissions`, `remove_channel_permissions`
- **Roles:** `list_roles`, `create_role`, `edit_role`, `delete_role`, `assign_role`, `remove_role`, `set_role_position`
- **Messages / reactions:** `get_channel_messages`, `read_messages`, `get_message`, `search_messages`, `edit_message`, `reply_to_message`, `delete_message`, `bulk_delete_messages`, `pin_message`, `unpin_message`, `add_reaction`, `add_multiple_reactions`, `remove_reaction`, `get_reaction_users`, `clear_reactions`
- **Forum:** `get_forum_channels`, `create_forum_post`, `get_forum_post`, `list_forum_threads`, `reply_to_forum`, `get_forum_tags`, `set_forum_tags`, `update_forum_post`, `delete_forum_post`
- **Webhooks:** `create_webhook`, `send_webhook_message`, `edit_webhook`, `delete_webhook`
- **Members:** `list_members`, `get_member`, `edit_member`, `send_dm`, `prune_members`, `get_prune_count`
- **Moderation:** `ban`, `unban`, `kick`, `timeout`, `remove_timeout`, `list_bans`, `get_timeout_status`
- **Guild:** `get_guild_settings`, `edit_guild_settings`
- **Invites:** `create_invite`, `list_invites`, `delete_invite`
- **Events:** `create_scheduled_event`, `edit_scheduled_event`, `delete_scheduled_event`, `list_scheduled_events`, `get_event_users`
- **Polls:** `create_poll`, `end_poll`, `get_poll_results`
- **Emojis / stickers:** `create_emoji`, `delete_emoji`, `list_emojis`, `list_stickers`, `create_sticker`, `delete_sticker`
- **AutoMod:** `create_automod_rule`, `edit_automod_rule`, `delete_automod_rule`, `list_automod_rules`
- **Audit:** `get_audit_log`
- **Threads:** `create_thread`, `edit_thread`, `delete_thread`, `list_threads`, `add_thread_member`, `remove_thread_member`
- **Slash commands:** `list_application_commands`, `register_application_command`, `delete_application_command`
- **Voice & stage:** `start_stage_instance`, `edit_stage_instance`, `stop_stage_instance`, `disconnect_member`
- **Real-time** (opt-in, `DISCORD_MCP_EVENTS=true`): `poll_events`, `respond_interaction`, `complete_event`
- **Raw:** `discord_raw`

---

## Development

```bash
npm run dev        # watch mode (tsx)
npm run build      # TypeScript compilation → build/
npm test           # unit tests (Vitest, discord.js mocked)
npm run typecheck  # type-check without emitting
```

Modular structure:

```
src/
  core/        # guardrails: dry-run, confirmation, audit, rate-limit, validation, server wiring
  tools/
    base/       channels/   roles/      messages/   reactions/  forum/
    webhooks/   members/    moderation/ guild/      invites/    events/
    polls/      emojis/     automod/    audit/      threads/    commands/
    voice/      realtime/   raw/
  gateway/     # opt-in gateway worker (defers interactions, enqueues events)
  index.ts     # stdio entrypoint
  app.ts       # HTTP streamable entrypoint
```

Conventions: Conventional Commits, strict TypeScript, SOLID, small testable functions. Each domain ships unit tests; the guardrail pipeline is tested independently. All tests use a mocked discord.js — **no network calls to Discord**.

---

## Security

- Secrets **never** in clear text: `.env` (gitignored) + GitHub Secrets.
- This public repo contains **no** real token, id or proprietary logic.
- The bot should only receive the permissions it strictly needs.
- The local audit log redacts sensitive fields (token, password, secret, authorization).

---

## License & credits

Distributed under the **MIT** license.

This project is a derivative of [`SaseQ/discord-mcp`](https://github.com/SaseQ/discord-mcp) (MIT). The original copyright and license are preserved in [`LICENSE`](./LICENSE).

Extensions and maintenance: **VekTrel** / SASU PixL-Art Studio.
