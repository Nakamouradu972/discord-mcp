import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Client } from "discord.js";
import { AuditLogger } from "./core/audit.js";
import { loadConfig, type ServerConfig } from "./core/env.js";
import { registerTool } from "./core/registerTool.js";
import type { AnyToolDefinition, ToolContext } from "./core/types.js";
import { allTools } from "./tools/index.js";

/** Package metadata reported in the MCP handshake. */
export const SERVER_INFO = { name: "discord-mcp", version: "2.3.0" } as const;

/**
 * Build a fully wired {@link McpServer} with every tool registered behind the
 * guardrail pipeline. The discord.js client and (optional) config/tool list
 * are injected, which keeps the builder unit-testable with mocks.
 */
export function buildServer(options: {
  client: Client;
  config?: ServerConfig;
  tools?: AnyToolDefinition[];
}): McpServer {
  const config = options.config ?? loadConfig();
  const ctx: ToolContext = {
    client: options.client,
    audit: new AuditLogger(config.auditFile, config.actor),
    config,
  };

  const server = new McpServer(SERVER_INFO);
  const tools = options.tools ?? allTools;
  for (const tool of tools) {
    registerTool(server, tool, ctx);
  }
  return server;
}
