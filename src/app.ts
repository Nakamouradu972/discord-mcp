#!/usr/bin/env node
import "./core/warnings.js";
import express, { type Express, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import type { Client } from "discord.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { loadConfig, type ServerConfig } from "./core/env.js";
import { loginClient, createClient } from "./core/discordClient.js";
import { buildServer } from "./server.js";
import { loadHttpSecurity, httpSecurityMiddleware, type HttpSecurityConfig } from "./core/httpSecurity.js";
import type { EventQueue } from "./core/eventQueue.js";
import { setupEvents } from "./gateway/setup.js";

/**
 * Build the Express app exposing the MCP server over the HTTP streamable
 * transport at `POST/GET/DELETE /mcp`. A fresh MCP server + transport is
 * created **only** for an `initialize` request and then tracked by the
 * `Mcp-Session-Id` header; every other request must carry a known session id.
 *
 * Exported (rather than inlined in {@link main}) so the routing/session logic
 * can be integration-tested without a real Discord connection.
 */
export function createHttpApp(
  client: Client,
  config: ServerConfig,
  security?: HttpSecurityConfig,
  queue?: EventQueue,
): Express {
  const app = express();
  app.use(express.json());

  // Security (DNS-rebinding + bearer auth) runs before any MCP handling.
  // Each check is a no-op until its env var is set, so local dev is unaffected.
  app.use("/mcp", httpSecurityMiddleware(security ?? loadHttpSecurity()));

  const transports = new Map<string, StreamableHTTPServerTransport>();

  app.post("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.header("mcp-session-id");
    const existing = sessionId ? transports.get(sessionId) : undefined;

    if (existing) {
      await existing.handleRequest(req, res, req.body);
      return;
    }

    // A session may only be opened by an initialize request.
    if (sessionId || !isInitializeRequest(req.body)) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: no valid session id for a non-initialize request." },
        id: null,
      });
      return;
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        transports.set(id, transport);
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) transports.delete(transport.sessionId);
    };
    const server = buildServer({ client, config, queue });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  const handleSession = async (req: Request, res: Response): Promise<void> => {
    const sessionId = req.header("mcp-session-id");
    const transport = sessionId ? transports.get(sessionId) : undefined;
    if (!transport) {
      res.status(400).send("Invalid or missing session id");
      return;
    }
    await transport.handleRequest(req, res);
  };
  app.get("/mcp", handleSession);
  app.delete("/mcp", handleSession);

  return app;
}

/** HTTP streamable entrypoint for self-hosted / remote scenarios. */
async function main(): Promise<void> {
  const config = loadConfig();
  const port = Number(getArg("--port") ?? process.env.PORT ?? 3000);

  const client = config.token
    ? await loginClient(config.token).catch((err) => {
        process.stderr.write(`[discord-mcp] Discord login failed: ${String(err)}\n`);
        return createClient();
      })
    : createClient();

  const security = loadHttpSecurity();
  const host = process.env.DISCORD_MCP_BIND || "127.0.0.1";

  if (!security.authToken) {
    process.stderr.write(
      "[discord-mcp] WARNING: no DISCORD_MCP_AUTH_TOKEN set — the /mcp endpoint is UNAUTHENTICATED. " +
        "Keep it bound to localhost behind a reverse proxy, or set a token before exposing it.\n",
    );
  }

  const queue = setupEvents(client);

  createHttpApp(client, config, security, queue).listen(port, host, () => {
    process.stderr.write(`[discord-mcp] HTTP server ready on http://${host}:${port}/mcp\n`);
  });
}

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

// Only start the server when run directly (not when imported by tests).
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`[discord-mcp] fatal: ${String(err)}\n`);
    process.exit(1);
  });
}
