# Deployment — Claude Desktop ↔ remote MCP over HTTP

This is the concrete setup for the intended use case: run this MCP **in Docker on
a remote host** and drive it from **Claude Desktop over HTTP** to create,
organise and manage your Discord server. The real-time gateway worker is **off**
in this scenario (you don't need the reactive bot); only the REST admin tools are
used.

## 0. Prerequisites

- A remote host with Docker + Docker Compose.
- A domain name pointing at the host (for TLS), e.g. `discord-mcp.example.com`.
- A Discord bot token, with the bot invited to your server (see the main README).
- Claude Desktop on your machine.

## 1. Secrets on the host

Create a `.env` next to `docker-compose.yml` on the host (never commit it):

```env
DISCORD_TOKEN=your_bot_token
DISCORD_GUILD_ID=your_default_server_id        # optional but handy
DISCORD_MCP_AUTH_TOKEN=$(openssl rand -hex 32)  # generate a long random secret
DISCORD_MCP_ACTOR=claude-desktop
# Real-time worker stays OFF for admin-only use:
# DISCORD_MCP_EVENTS is intentionally left unset.
```

Generate the auth token once and keep it; Claude Desktop will send it as a
Bearer token.

## 2. Reverse proxy for TLS + the container

The container binds to `0.0.0.0:3000` **inside** the Docker network and is *not*
published directly. A reverse proxy terminates TLS and forwards to it. Example
with Caddy (automatic HTTPS):

`Caddyfile`:

```
discord-mcp.example.com {
    reverse_proxy discord-mcp:3000
}
```

`docker-compose.override.yml` (adds the proxy alongside the shipped compose):

```yaml
services:
  caddy:
    image: caddy:2
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy-data:/data
    depends_on:
      - discord-mcp

volumes:
  caddy-data:
```

The bundled `docker-compose.yml` already:
- builds/runs `discord-mcp` with `expose: 3000` (internal only),
- mounts a `mcp-data` volume for the audit log,
- wires `DISCORD_TOKEN`, `DISCORD_MCP_AUTH_TOKEN`, `DISCORD_MCP_ALLOWED_HOSTS`, etc.

Optionally set `DISCORD_MCP_ALLOWED_HOSTS=discord-mcp.example.com` in `.env` to
add DNS-rebinding protection.

## 3. Bring it up

```bash
docker compose up -d --build
docker compose logs -f discord-mcp   # expect: "HTTP server ready on http://0.0.0.0:3000/mcp"
```

A startup line **without** the "no DISCORD_MCP_AUTH_TOKEN" warning confirms auth
is active.

## 4. Connect Claude Desktop (HTTP)

Claude Desktop launches MCP servers locally, so a remote HTTP server is reached
through the `mcp-remote` bridge. Edit `claude_desktop_config.json`:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```jsonc
{
  "mcpServers": {
    "discord": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote",
        "https://discord-mcp.example.com/mcp",
        "--header", "Authorization: Bearer ${DISCORD_MCP_AUTH_TOKEN}"
      ],
      "env": {
        "DISCORD_MCP_AUTH_TOKEN": "the_same_secret_as_on_the_host"
      }
    }
  }
}
```

Restart Claude Desktop. The `discord_*` tools should appear. A quick test:
ask it to run `discord_list_servers` (read-only), then try creating a channel —
you'll get a **dry-run preview first** (see below).

## 5. Day-to-day: the guardrail workflow

Every write is **dry-run by default**: the first call returns a preview, and you
re-run with `dryRun: false` to apply. Destructive actions (delete, ban, bulk
delete, `discord_raw`) also need `confirm: true`. So a typical "create a channel"
is two steps, and you always see the planned change first.

To skip previews for a trusting session you may set
`DISCORD_MCP_DRY_RUN_DEFAULT=false` on the host — but keeping it on is the safe
default for interactive admin.

Full tool reference: [`LLM_GUIDE.md`](./LLM_GUIDE.md) and
[`EXTENSION_PLAN.md`](./EXTENSION_PLAN.md). Anything not covered by a typed tool
is reachable via `discord_raw`.

## 6. Security checklist

- [ ] `DISCORD_MCP_AUTH_TOKEN` set to a long random value (host + Claude Desktop).
- [ ] Container **not** published directly; only the reverse proxy exposes 443.
- [ ] TLS enabled at the proxy (Caddy does this automatically).
- [ ] `.env` is gitignored and contains the only copy of the secrets.
- [ ] Bot has only the Discord permissions you actually need.
- [ ] (Optional) `DISCORD_MCP_ALLOWED_HOSTS` set to your domain.

## 7. Notes

- The real-time worker (`DISCORD_MCP_EVENTS`) is **left off** for admin-only use;
  nothing about it runs or connects to the gateway in this setup.
- The audit log (`/data/audit/audit-log.jsonl` in the `mcp-data` volume) records
  every action with the `claude-desktop` actor — useful to review what was done.
- Updating: `docker compose pull || docker compose build` then
  `docker compose up -d`.
