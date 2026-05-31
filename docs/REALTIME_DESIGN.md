# Real-time Design — events & interactions (Option B)

> **Status (updated):** phases 1–3 **implemented** (security, gateway worker +
> SQLite event queue, `poll_events` / `respond_interaction` / `complete_event`
> tools), all **opt-in** via `DISCORD_MCP_EVENTS`. **Phase 4 (the autonomous
> runner) is descoped** — the project is used as an **admin MCP for Claude
> Desktop over HTTP**, not as a reactive bot, so no always-on runner is shipped.
> The real-time machinery stays in the codebase, dormant unless enabled. For the
> admin deployment, see [`DEPLOYMENT.md`](./DEPLOYMENT.md).

## 1. Problem recap

The MCP server is request/response: the LLM calls tools, the server cannot push.
Discord, however:
- pushes events over a **gateway** (WebSocket) connection, and
- requires a reply to **interactions** (slash commands, buttons, modals) within
  **~3 seconds**, with a follow-up window of up to **15 minutes** after an
  acknowledgement.

A model-driven loop cannot meet the 3 s deadline and is not "listening". The fix
is to **decouple real-time reception from LLM decision-making**.

## 2. The one hard constraint

**A bot token allows only ONE gateway (WebSocket) connection per shard.** Two
processes connecting to the gateway with the same token will disconnect each
other in a loop.

**The REST API has no such limit** — many processes may call REST concurrently
with the same token. Crucially, **almost every admin tool in this server is REST**
(create channel, manage roles, send message, ban…). **Only event listening needs
the gateway.**

→ Therefore: **exactly one process owns the gateway.** Everything else uses REST.

## 3. Two consumers, two roles

| | Claude Desktop (you) | Autonomous runner (the bot) |
|---|---|---|
| Trigger | you, on demand | Discord events |
| Lifecycle | ephemeral (when you open it) | always-on |
| Needs gateway | no (REST only) | yes (reads the event queue) |
| Actor tag | `claude-desktop` | `autobot` |

Claude Desktop is the **admin console**; it is *not* the always-on reactive
brain. The reactive behaviour needs its **own** always-on runner that calls the
Claude API in a loop over the event queue.

## 4. Target topology (Docker remote + Claude Desktop over HTTP)

```
  Remote host (Docker)
  ┌──────────────────────────────────────────────────────────────┐
  │ container: discord-mcp  (ONE bot token, ONE gateway)           │
  │                                                                │
  │   • Gateway worker  → receives events, defers interactions <3s │
  │   • Event queue (SQLite on a mounted volume)                   │
  │   • MCP server over HTTP  (listens on 127.0.0.1:3000)          │
  │   • Audit log (JSONL on the same volume)                       │
  └───────────────▲───────────────────────────▲───────────────────┘
                  │ HTTPS (reverse proxy + auth)│ loopback or same container
        ┌─────────┴──────────┐        ┌─────────┴───────────────────┐
        │ Claude Desktop      │        │ Autonomous runner            │
        │ (your laptop)       │        │ (Claude API loop:            │
        │ admin via REST      │        │  poll_events → decide →      │
        │                     │        │  respond_interaction)        │
        └─────────────────────┘        └──────────────────────────────┘
```

Key points:
- **One gateway**, inside the container → no token conflict.
- **Claude Desktop connects over HTTP** to the already-running server (it does
  **not** spawn its own stdio process). See §7 for the exact config.
- The autonomous runner reads the **same** queue and replies to interactions.
- You and the bot can act **simultaneously**: Discord handles concurrent REST
  fine. Conflicts are mitigated by the existing guardrails (§8).

### Where does the autonomous runner live?
Two acceptable placements; pick at implementation time:
- **(B1) Same container, separate process** (e.g. a second entrypoint
  `build/runner.js`). Simplest networking — talks to the queue directly or to
  `127.0.0.1:3000`. Recommended for v1.
- **(B2) Separate container/service** calling the MCP over the internal Docker
  network. More isolation; needs the queue on a shared volume or exposed via
  tools only.

The runner is **out of scope for the MCP package itself** — the MCP exposes
`poll_events` / `respond_interaction`; the runner is a thin Claude API client. We
will ship a reference runner but keep it optional.

## 5. New components

### 5.1 Gateway worker (always-on, owns the WebSocket)
- A discord.js client with the **interaction + message intents** needed.
- On `interactionCreate`: **immediately `deferReply()` / `deferUpdate()`** (this
  is what beats the 3 s deadline without any LLM), then enqueue the interaction
  with its **token** and metadata.
- On selected gateway events (`messageCreate`, `guildMemberAdd`,
  `messageReactionAdd`, …): enqueue **after server-side filtering** (see §9).
- The worker performs **no business logic** — it only acknowledges and enqueues.

### 5.2 Event queue (SQLite, on a mounted volume)
A single-file store, consistent with the existing JSONL audit log.

Proposed `events` table:

| column | type | notes |
|---|---|---|
| `id` | TEXT (uuid) PK | queue id |
| `kind` | TEXT | `interaction` \| `message` \| `member_join` \| `reaction` \| … |
| `created_at` | TEXT (ISO) | enqueue time |
| `guild_id` | TEXT | |
| `channel_id` | TEXT | |
| `user_id` | TEXT | actor on Discord side |
| `payload` | TEXT (JSON) | event-specific data (content, options, …) |
| `interaction_token` | TEXT | present only for interactions |
| `interaction_expires_at` | TEXT (ISO) | token deadline (~15 min) |
| `status` | TEXT | `pending` \| `claimed` \| `done` \| `expired` |
| `claimed_by` | TEXT | runner id (for at-least-once + visibility) |
| `claimed_at` | TEXT (ISO) | for claim timeout / redelivery |

Delivery semantics: **at-least-once** with a claim/visibility timeout. The runner
claims a batch (`pending → claimed`), processes, then marks `done`. A reaper marks
interactions whose token expired as `expired` so the runner doesn't try to reply
to a dead token.

### 5.3 Two new MCP tools
- **`poll_events`** (`read`): claim and return up to N pending events. Args:
  `kinds?`, `limit?`, `claimTtlSeconds?`. Returns the events (incl.
  `interaction_token` where relevant) and marks them `claimed`.
- **`respond_interaction`** (`write`, guardrailed): edit the deferred reply via
  the stored token. Args: `eventId` (or raw `interactionToken`), `content?`,
  `embeds?`, `components?`, `ephemeral?`. Marks the event `done`.
  - Reuses the existing `buildMessagePayload` helper.
  - Subject to dry-run by default like every write tool (the runner sets
    `dryRun:false`).

(Optionally a `complete_event` to ack non-interaction events, and `peek_events`
read-only without claiming.)

## 6. The end-to-end loop

```
member runs /ask "..."  ──▶ gateway worker: deferReply("⏳ thinking…")  (<3s)
                                   │ enqueue interaction (+token, +15min deadline)
autonomous runner: poll_events ◀──┘
        │ Claude decides, optionally calls other MCP tools (read history, …)
        └─▶ respond_interaction(eventId, content)  ──▶ edits the deferred reply
```

The defer breaks the 3 s constraint; the runner then has up to 15 min. Latency =
poll interval + model latency (seconds to tens of seconds), **not** instant.

## 7. Claude Desktop over HTTP (admin console)

Claude Desktop launches MCP servers as local stdio by default. To reach a
**remote HTTP** server it uses the `mcp-remote` bridge:

```jsonc
// claude_desktop_config.json
{
  "mcpServers": {
    "discord": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote",
        "https://discord-mcp.example.com/mcp",
        "--header", "Authorization: Bearer ${DISCORD_MCP_AUTH_TOKEN}"
      ],
      "env": { "DISCORD_MCP_AUTH_TOKEN": "..." }
    }
  }
}
```

- It connects to the **already-running** container; it does **not** open a gateway.
- All its actions are REST → safe to run concurrently with the bot.
- Recommend `DISCORD_MCP_ACTOR=claude-desktop` so the audit log distinguishes you
  from the bot. (Per-connection actor tagging is a small addition — see §10.)

## 8. Remote exposure & security (Docker)

The current `app.ts` HTTP server has **no authentication** and binds all
interfaces. For a public remote host this must change **before** exposing it:

- **Do not publish port 3000 directly.** Bind to `127.0.0.1` and put a **reverse
  proxy (Caddy/Traefik/nginx)** in front for **TLS** + **auth**.
- **Bearer-token auth** on `/mcp` (an `Authorization` header check in `app.ts`),
  rejecting unauthenticated requests with 401. Token via env
  (`DISCORD_MCP_AUTH_TOKEN`).
- **Origin/DNS-rebinding protection**: the MCP SDK's
  `StreamableHTTPServerTransport` supports `allowedHosts`/`allowedOrigins` —
  enable them.
- **Secrets**: `DISCORD_TOKEN` and the auth token via Docker secrets / env file,
  never baked into the image.
- **CORS**: restrict to the expected origins (or none, if only `mcp-remote`).

Compose sketch (illustrative):

```yaml
services:
  discord-mcp:
    image: vektrel/discord-mcp:latest
    restart: unless-stopped
    expose: ["3000"]            # internal only; not "ports:"
    volumes:
      - mcp-data:/data          # SQLite queue + audit log persist here
    environment:
      DISCORD_TOKEN: ${DISCORD_TOKEN}
      DISCORD_MCP_AUTH_TOKEN: ${DISCORD_MCP_AUTH_TOKEN}
      DISCORD_MCP_AUDIT_FILE: /data/audit/audit-log.jsonl
      DISCORD_MCP_QUEUE_FILE: /data/events.sqlite
      DISCORD_MCP_BIND: 127.0.0.1
  proxy:
    image: caddy:2            # TLS + bearer auth in front of discord-mcp:3000
    ports: ["443:443"]
    # ...
volumes:
  mcp-data:
```

## 9. Cost & noise control (server-side filtering)

Token cost scales with event volume, so the worker **must not enqueue everything**.
Default filters (configurable):
- Always enqueue **interactions** (commands/buttons) — they're explicit.
- For `messageCreate`: only when the bot is **mentioned**, in an **allow-listed
  channel**, or matching a configured prefix. Ignore the bot's own messages and
  other bots.
- Coalesce burst events; cap queue size; drop/aging policy for `pending` events
  older than a TTL.

## 10. Coexistence: you + the bot at the same time

- **Audit `actor` tagging** already exists (`DISCORD_MCP_ACTOR`). Add
  **per-connection** actor derivation for HTTP (e.g. from the auth token / a
  header) so one running container can attribute actions to `claude-desktop` vs
  `autobot`. Until then, run two configs/tokens.
- **Maintenance/pause switch**: a flag (env or a `set_runner_paused` tool) that
  makes the autonomous runner stop claiming events while you do a big
  restructuring — so it won't react mid-change.
- **Guardrails stay on**: the bot runs `dryRun:false` only on narrow, intended
  actions; destructive actions still require `confirm:true`. You can keep
  `DISCORD_MCP_DRY_RUN_DEFAULT=true` for your own console to preview diffs.

## 11. What this does NOT solve
- **Not millisecond-instant.** The worker acks in <3 s ("⏳ thinking…"), but the
  real answer lands when the runner processes the queue.
- **The runner must keep running** for reactive behaviour; if it's down, the
  queue fills but nothing is answered (interactions eventually expire).
- **No voice audio** streaming (out of scope).
- Claude Desktop is **not** the reactive brain — it stays an admin console.

## 12. Proposed implementation phases
1. **Security first** (independently useful): bearer auth + host/origin allow-list
   + `127.0.0.1` bind in `app.ts`; documented compose with a reverse proxy.
2. **Queue + worker**: SQLite store, gateway worker with defer + filtered enqueue,
   `build/runner`-less (queue only).
3. **MCP tools**: `poll_events`, `respond_interaction` (+ optional `peek_events`,
   `complete_event`), full guardrails + unit tests (gateway mocked, no network).
4. **Reference autonomous runner** (optional, separate entrypoint) + docs.
5. **Per-connection actor tagging** + pause switch.

Each phase ships as its own reviewed PR with tests green before merge.

## 13. Open decisions (for you)
- Runner placement: **B1 (same container)** or **B2 (separate service)**?
- Auth: simple **bearer token** (recommended to start) or mTLS/OAuth later?
- Which events to enqueue by default (interactions only, or also mentions /
  member joins / reactions)?
- Persistence: confirm a **mounted volume** for the SQLite queue + audit log on
  the remote host.
