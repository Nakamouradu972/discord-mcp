#!/usr/bin/env node
import express, { type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfig } from "./core/env.js";
import { loginClient, createClient } from "./core/discordClient.js";
import { buildServer } from "./server.js";

/**
 * HTTP streamable entrypoint for self-hosted / remote scenarios.
 * Endpoint: POST/GET/DELETE /mcp. A fresh MCP server + transport is created
 * per session and tracked by the `Mcp-Session-Id` header.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const port = Number(getArg("--port") ?? process.env.PORT ?? 3000);

  const client = config.token
    ? await loginClient(config.token).catch((err) => {
        process.stderr.write(`[discord-mcp] Discord login failed: ${String(err)}\n`);
        return createClient();
      })
    : createClient();

  const app = express();
  app.use(express.json());

  const transports = new Map<string, StreamableHTTPServerTransport>();

  app.post("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.header("mcp-session-id");
    let transport = sessionId ? transports.get(sessionId) : undefined;

    if (!transport) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          transports.set(id, transport!);
        },
      });
      transport.onclose = () => {
        if (transport!.sessionId) transports.delete(transport!.sessionId);
      };
      const server = buildServer({ client, config });
      await server.connect(transport);
    }
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

  app.listen(port, () => {
    process.stderr.write(`[discord-mcp] HTTP server ready on http://localhost:${port}/mcp\n`);
  });
}

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

main().catch((err) => {
  process.stderr.write(`[discord-mcp] fatal: ${String(err)}\n`);
  process.exit(1);
});
