/**
 * Server configuration resolved from environment variables.
 *
 * Kept in one place so the rest of the code never reads `process.env`
 * directly, which keeps units testable (config is just an object).
 */
export interface ServerConfig {
  /** Discord bot token. Empty string when not provided. */
  token: string;
  /** Default guild id used when a tool call omits `guildId`. */
  defaultGuildId?: string;
  /** Actor name recorded in audit entries. */
  actor: string;
  /** Absolute or relative path to the audit log file. */
  auditFile: string;
  /** Whether write tools default to dry-run when the caller omits `dryRun`. */
  dryRunDefault: boolean;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return !["false", "0", "no", "off"].includes(value.trim().toLowerCase());
}

/** Build a {@link ServerConfig} from a raw environment map (defaults to `process.env`). */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    token: env.DISCORD_TOKEN ?? "",
    defaultGuildId: env.DISCORD_GUILD_ID || undefined,
    actor: env.DISCORD_MCP_ACTOR || "mcp",
    auditFile: env.DISCORD_MCP_AUDIT_FILE || "./audit/audit-log.jsonl",
    dryRunDefault: parseBoolean(env.DISCORD_MCP_DRY_RUN_DEFAULT, true),
  };
}
