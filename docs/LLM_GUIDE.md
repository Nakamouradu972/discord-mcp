# LLM Guide — driving Discord through this MCP

This guide is written for the **AI assistant (LLM)** that calls this server's
tools. It explains how the tools behave, how to reach **any** Discord endpoint,
and what this server cannot do.

## 1. The guardrail workflow (read this first)

Every tool is classified `read`, `write`, or `destructive`. The behaviour:

| Category | First call | To actually run |
|---|---|---|
| `read` | runs immediately | — |
| `write` | returns a **dry-run preview**, no change | call again with `dryRun: false` |
| `destructive` | returns a **dry-run preview** | call again with `dryRun: false` **and** `confirm: true` |

So a typical mutation is **two calls**:

1. Call the tool normally → you get `🧪 DRY-RUN — Planned change: …`. Inspect it.
2. Repeat with `dryRun: false` (plus `confirm: true` for destructive tools).

You can skip the preview by passing `dryRun: false` on the first call. The
default can be flipped server-side with `DISCORD_MCP_DRY_RUN_DEFAULT=false`, but
do not assume that — always read the response.

Every call (preview, confirmation, success, error) is written to a local audit
log. Errors come back as `❌ <message>` with `isError: true`.

## 2. Common conventions

- **`guildId`** is optional on guild tools; it falls back to the server's
  configured default (`DISCORD_GUILD_ID`). Pass it explicitly to target another
  guild.
- **IDs** are Discord snowflakes (strings). Use the `list_*` / `get_*` read
  tools to discover them before mutating.
- **`reason`** (where present) is written to Discord's own audit log.

## 3. Sending rich content

`discord_send` accepts more than text:

```jsonc
{
  "channelId": "123",
  "message": "Optional text",
  "embeds": [{
    "title": "Release 2.2.0",
    "description": "Notes…",
    "color": "#5865F2",
    "fields": [{ "name": "Status", "value": "shipped", "inline": true }],
    "footer": { "text": "by the bot" }
  }],
  "files": ["https://example.com/image.png"],
  "buttons": [{ "label": "Changelog", "url": "https://example.com/changelog" }],
  "dryRun": false
}
```

- At least one of `message` / `embeds` / `files` is required.
- `discord_send_embed` is a flatter convenience for a single embed.
- **Buttons:** *Link* buttons (`url`) work standalone. Other styles need a
  `customId` **and an external interaction handler** — see §6.

## 4. Tool domains at a glance

`base`, `channels`, `roles`, `messages`, `reactions`, `forum`, `webhooks`,
`members`, `moderation`, `guild`, `invites`, `events`, `polls`, `emojis`
(+ stickers), `automod`, `audit`, `threads`, `commands` (slash commands),
`raw`. Full list with permissions/intents: [`EXTENSION_PLAN.md`](./EXTENSION_PLAN.md).

## 5. Reaching ANY endpoint — `discord_raw`

If no typed tool covers what you need, use **`discord_raw`** to call the Discord
REST API directly. It is guardrailed as `destructive` (so it requires
`dryRun: false` and `confirm: true`).

```jsonc
// Read a guild's onboarding config (no typed tool for it)
{ "method": "GET", "endpoint": "/guilds/{guild_id}/onboarding", "dryRun": false, "confirm": true }

// Bulk-set channel positions
{
  "method": "PATCH",
  "endpoint": "/guilds/{guild_id}/channels",
  "payload": [{ "id": "123", "position": 0 }],
  "dryRun": false, "confirm": true
}

// Pass query parameters
{ "method": "GET", "endpoint": "/guilds/{guild_id}/members", "query": { "limit": "5" }, "dryRun": false, "confirm": true }
```

Guidance:
- `endpoint` is the path after `https://discord.com/api/v10` (a leading `/` is
  added if missing). Substitute real snowflakes for `{...}` placeholders.
- `payload` is the JSON body (object **or** array, per the route).
- `query` is a flat string→string map of query parameters.
- Consult the official Discord API docs for the exact route and body shape.
- The response JSON is returned as text (truncated at ~4000 chars).

**Rule of thumb:** prefer a typed tool when one exists (better validation and
previews); fall back to `discord_raw` for everything else.

## 6. What this server CANNOT do (architectural limits)

This MCP is **request/response**. It does **not** consume the Discord gateway
event stream, so:

- It cannot **react in real time** to new messages, member joins, reactions, or
  button/command clicks. To observe activity, **poll** with `read_messages` /
  `get_channel_messages`.
- It cannot **respond to interactions** (slash commands, buttons, modals). You
  can *register* slash commands (`register_application_command`) and *send*
  buttons, but replying to a click/invocation requires a separate, always-on
  interaction handler that this server does not provide.
- It does not stream **voice audio**.

For one-shot administration (managing channels, roles, members, moderation,
events, content, etc.) the coverage is effectively complete: typed tools for the
common cases plus `discord_raw` for the long tail.
