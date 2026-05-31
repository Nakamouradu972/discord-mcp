# Extension Plan — Discord MCP (VekTrel Edition)

Status of the effort to cover the full public Discord API behind a generic
guardrails layer (dry-run, confirmation, audit, rate-limit, zod validation).

**Legend:** ✅ done · 🚧 in progress · ⛔ not started

| Domain | Status | Tools | Bot permissions | Gateway intents |
|---|---|---|---|---|
| Core guardrails | ✅ | dry-run, confirmation, audit log, rate-limit retry, zod validation | — | — |
| base | ✅ | `login`, `list_servers`, `get_server_info`, `send` (text/embeds/files/buttons), `send_embed`, `set_presence` | Send Messages, View Channel | Guilds |
| channels | ✅ | `list_channels`, `get_channel_info`, `create_text_channel`, `create_voice_channel`, `create_forum_channel`, `create_category`, `edit_channel`, `edit_category`, `delete_channel`, `delete_category`, `set_channel_position`, `set_channel_permissions`, `remove_channel_permissions` | Manage Channels, Manage Roles, View Channel | Guilds |
| roles | ✅ | `list_roles`, `create_role`, `edit_role`, `delete_role`, `assign_role`, `remove_role`, `set_role_position` | Manage Roles | Guilds, GuildMembers |
| messages | ✅ | `get_channel_messages`, `read_messages`, `get_message`, `search_messages`, `edit_message`, `reply_to_message`, `delete_message`, `bulk_delete_messages`, `pin_message`, `unpin_message` | Send/Manage Messages, Read Message History | GuildMessages, MessageContent |
| reactions | ✅ | `add_reaction`, `add_multiple_reactions`, `remove_reaction`, `get_reaction_users`, `clear_reactions` | Add Reactions, Manage Messages | GuildMessageReactions |
| forum | ✅ | `get_forum_channels`, `create_forum_post`, `get_forum_post`, `list_forum_threads`, `reply_to_forum`, `get_forum_tags`, `set_forum_tags`, `update_forum_post`, `delete_forum_post` | Create Public Threads, Send Messages in Threads, Manage Threads/Channels | Guilds |
| webhooks | ✅ | `create_webhook`, `send_webhook_message`, `edit_webhook`, `delete_webhook` | Manage Webhooks | Guilds |
| members | ✅ | `list_members`, `get_member`, `edit_member`, `send_dm`, `prune_members`, `get_prune_count` | Manage Nicknames, Mute/Deafen/Move/Kick Members, Moderate Members | GuildMembers, GuildVoiceStates |
| moderation | ✅ | `ban`, `unban`, `kick`, `timeout`, `remove_timeout`, `list_bans`, `get_timeout_status` | Ban/Kick/Moderate Members | GuildModeration, GuildMembers |
| guild | ✅ | `get_guild_settings`, `edit_guild_settings` | Manage Server | Guilds |
| invites | ✅ | `create_invite`, `list_invites`, `delete_invite` | Create Instant Invite, Manage Server | Guilds |
| events | ✅ | `create_scheduled_event`, `edit_scheduled_event`, `delete_scheduled_event`, `list_scheduled_events`, `get_event_users` | Manage Events | GuildScheduledEvents |
| polls | ✅ | `create_poll`, `end_poll`, `get_poll_results` | Send/Manage Messages | Guilds |
| emojis | ✅ | `create_emoji`, `delete_emoji`, `list_emojis`, `list_stickers`, `create_sticker`, `delete_sticker` | Manage Emojis and Stickers | Guilds |
| automod | ✅ | `create_automod_rule`, `edit_automod_rule`, `delete_automod_rule`, `list_automod_rules` (Keyword/Spam/KeywordPreset/MentionSpam triggers; block/timeout/alert actions) | Manage Server | Guilds |
| audit | ✅ | `get_audit_log` | View Audit Log | Guilds |
| threads | ✅ | `create_thread`, `edit_thread`, `delete_thread`, `list_threads`, `add_thread_member`, `remove_thread_member` | Create Public Threads, Manage Threads | Guilds |
| commands | ✅ | `list_application_commands`, `register_application_command`, `delete_application_command` | — (bot owner / application scope) | Guilds |
| voice | ✅ | `start_stage_instance`, `edit_stage_instance`, `stop_stage_instance`, `disconnect_member` | Manage Channels, Mute/Move Members | Guilds, GuildVoiceStates |
| realtime | ✅ | `poll_events`, `respond_interaction`, `complete_event` (require the gateway worker, `DISCORD_MCP_EVENTS=true`) | — (interaction webhook) | Guilds, GuildMessages, MessageContent |
| raw | ✅ | `discord_raw` (generic REST passthrough) | depends on the endpoint called | — |

## Guardrail classification

Each tool declares a guardrail **category** that drives the write-path behaviour:

- **read** — no side effects; never gated.
- **write** — mutates state; **dry-run by default**, executes only with `dryRun: false`.
- **destructive** — irreversible / high impact; dry-run by default **and** requires `confirm: true`.

Current distribution: **32 read · 55 write · 21 destructive** (108 tools total).

Destructive tools include: every `delete_*`, `ban`, `kick`, `bulk_delete_messages`,
`clear_reactions`, `remove_channel_permissions`, `delete_forum_post`,
`delete_thread`, and `discord_raw`.

## Notes & limitations

- `search_messages` filters recently-fetched messages client-side (the Discord
  guild search endpoint is not available to bots).
- `edit_guild_settings` sets the vanity URL through the raw REST route; the
  server must be at boost level 3 for it to succeed.
- `send_webhook_message` works without a logged-in client (it uses the webhook
  id+token or URL directly).
- Privileged intents (`MessageContent`, `GuildMembers`) must be enabled in the
  Discord Developer Portal in addition to being requested by the client.
- **Interactions are not handled.** Slash commands can be registered and buttons
  can be sent, but the server does not consume gateway events, so it cannot
  reply to a command invocation or a button click. Link buttons work standalone.
  See [`LLM_GUIDE.md`](./LLM_GUIDE.md) §6.
- Anything without a typed tool is reachable via `discord_raw`. See
  [`LLM_GUIDE.md`](./LLM_GUIDE.md) §5.
