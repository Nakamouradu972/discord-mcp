#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./core/env.js";
import { loginClient, createClient } from "./core/discordClient.js";
import { buildServer } from "./server.js";

/**
 * stdio entrypoint (default transport for local MCP clients such as Claude
 * Code and Cursor).
 *
 * The server boots even without a token so MCP clients can connect and list
 * tools; Discord login is attempted only when a token is present. All
 * diagnostics go to stderr to keep stdout reserved for the MCP protocol.
 */
async function main(): Promise<void> {
  const config = loadConfig();

  // Boot without a token so `list_tools` works; tools that hit Discord will
  // surface a clear "not logged in" error until a token is configured.
  const client = config.token ? await loginClient(config.token).catch((err) => {
    process.stderr.write(`[discord-mcp] Discord login failed: ${String(err)}\n`);
    return createClient();
  }) : createClient();

  const server = buildServer({ client, config });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("[discord-mcp] stdio server ready.\n");
}

main().catch((err) => {
  process.stderr.write(`[discord-mcp] fatal: ${String(err)}\n`);
  process.exit(1);
});
