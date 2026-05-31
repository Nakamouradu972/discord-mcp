import { z } from "zod";
import { AuditLogEvent } from "discord.js";
import { defineTool, type AnyToolDefinition } from "../../core/types.js";
import { resolveGuild } from "../../core/resolve.js";

// Names of the AuditLogEvent enum (string keys only) for the actionType filter.
const ACTION_NAMES = Object.keys(AuditLogEvent).filter((k) => Number.isNaN(Number(k))) as [string, ...string[]];

const getAuditLog = defineTool({
  name: "get_audit_log",
  description: "Query the server audit log, optionally filtered by user and action type.",
  category: "read",
  permissions: ["View Audit Log"],
  intents: ["Guilds"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    userId: z.string().optional().describe("Only entries performed by this user id."),
    actionType: z.enum(ACTION_NAMES).optional().describe("AuditLogEvent name, e.g. MemberKick, ChannelDelete."),
    limit: z.number().int().min(1).max(100).optional().describe("Max entries (default 50)."),
  },
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    const type = a.actionType
      ? (AuditLogEvent[a.actionType as keyof typeof AuditLogEvent] as AuditLogEvent)
      : undefined;
    const logs = await guild.fetchAuditLogs({ user: a.userId, type, limit: a.limit ?? 50 });
    if (logs.entries.size === 0) return `No matching audit-log entries in ${guild.name}.`;
    const lines = logs.entries.map((e) => {
      const action = AuditLogEvent[e.action] ?? e.action;
      return `- [${action}] by ${e.executorId ?? "?"} on ${e.targetId ?? "?"}${e.reason ? ` — ${e.reason}` : ""}`;
    });
    return `${logs.entries.size} entr(ies):\n${lines.join("\n")}`;
  },
});

/** Audit-log tools. */
export const auditTools: AnyToolDefinition[] = [getAuditLog];
