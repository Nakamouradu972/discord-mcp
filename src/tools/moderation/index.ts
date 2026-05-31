import { z } from "zod";
import { defineTool, type AnyToolDefinition } from "../../core/types.js";
import { resolveGuild } from "../../core/resolve.js";

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000; // Discord hard limit: 28 days.

const ban = defineTool({
  name: "ban",
  description: "Ban a user from the server, optionally deleting their recent messages.",
  category: "destructive",
  permissions: ["Ban Members"],
  intents: ["GuildModeration"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    userId: z.string().describe("Id of the user to ban."),
    deleteMessageSeconds: z
      .number()
      .int()
      .min(0)
      .max(604800)
      .optional()
      .describe("Seconds of recent messages to delete (0–604800 = up to 7 days)."),
    reason: z.string().optional().describe("Audit-log reason."),
  },
  plan: (a) => `Ban user ${a.userId} from guild ${a.guildId ?? "(default)"}.`
    + (a.deleteMessageSeconds ? ` Delete ${a.deleteMessageSeconds}s of messages.` : "")
    + (a.reason ? ` Reason: ${a.reason}` : ""),
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    await guild.members.ban(a.userId, {
      deleteMessageSeconds: a.deleteMessageSeconds,
      reason: a.reason,
    });
    return `Banned user ${a.userId} from ${guild.name}.${a.reason ? ` Reason: ${a.reason}` : ""}`;
  },
});

const unban = defineTool({
  name: "unban",
  description: "Lift a ban so the user can rejoin the server with a new invite.",
  category: "write",
  permissions: ["Ban Members"],
  intents: ["GuildModeration"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    userId: z.string().describe("Id of the user to unban."),
    reason: z.string().optional().describe("Audit-log reason."),
  },
  plan: (a) => `Unban user ${a.userId} in guild ${a.guildId ?? "(default)"}.`,
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    await guild.bans.remove(a.userId, a.reason);
    return `Unbanned user ${a.userId} in ${guild.name}.`;
  },
});

const kick = defineTool({
  name: "kick",
  description: "Kick a member. They can rejoin with a new invite.",
  category: "destructive",
  permissions: ["Kick Members"],
  intents: ["GuildMembers"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    userId: z.string().describe("Id of the member to kick."),
    reason: z.string().optional().describe("Audit-log reason."),
  },
  plan: (a) => `Kick member ${a.userId} from guild ${a.guildId ?? "(default)"}.`,
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    await guild.members.kick(a.userId, a.reason);
    return `Kicked member ${a.userId} from ${guild.name}.`;
  },
});

const timeout = defineTool({
  name: "timeout",
  description: "Time a member out (mute) for a number of minutes (max 28 days).",
  category: "write",
  permissions: ["Moderate Members"],
  intents: ["GuildMembers"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    userId: z.string().describe("Id of the member to time out."),
    durationMinutes: z
      .number()
      .int()
      .positive()
      .max(40320)
      .describe("Timeout duration in minutes (max 40320 = 28 days)."),
    reason: z.string().optional().describe("Audit-log reason."),
  },
  plan: (a) => `Time out member ${a.userId} for ${a.durationMinutes} minute(s).`,
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    const member = await guild.members.fetch(a.userId);
    const ms = Math.min(a.durationMinutes * 60 * 1000, MAX_TIMEOUT_MS);
    await member.timeout(ms, a.reason);
    return `Timed out ${member.user.tag} for ${a.durationMinutes} minute(s).`;
  },
});

const removeTimeout = defineTool({
  name: "remove_timeout",
  description: "Clear an active timeout from a member.",
  category: "write",
  permissions: ["Moderate Members"],
  intents: ["GuildMembers"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    userId: z.string().describe("Id of the member whose timeout to clear."),
    reason: z.string().optional().describe("Audit-log reason."),
  },
  plan: (a) => `Remove timeout from member ${a.userId}.`,
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    const member = await guild.members.fetch(a.userId);
    await member.timeout(null, a.reason);
    return `Removed timeout from ${member.user.tag}.`;
  },
});

const listBans = defineTool({
  name: "list_bans",
  description: "List banned users for the server.",
  category: "read",
  permissions: ["Ban Members"],
  intents: ["GuildModeration"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
  },
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    const bans = await guild.bans.fetch();
    if (bans.size === 0) return `No bans in ${guild.name}.`;
    const lines = bans.map((b) => `- ${b.user.tag} (${b.user.id})${b.reason ? ` — ${b.reason}` : ""}`);
    return `${bans.size} ban(s) in ${guild.name}:\n${lines.join("\n")}`;
  },
});

const getTimeoutStatus = defineTool({
  name: "get_timeout_status",
  description: "Check whether a member is currently timed out and until when.",
  category: "read",
  permissions: ["View Channel"],
  intents: ["GuildMembers"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    userId: z.string().describe("Id of the member to inspect."),
  },
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    const member = await guild.members.fetch(a.userId);
    const until = member.communicationDisabledUntil;
    if (!until || until.getTime() <= Date.now()) {
      return `${member.user.tag} is not currently timed out.`;
    }
    return `${member.user.tag} is timed out until ${until.toISOString()}.`;
  },
});

/** All moderation tools. */
export const moderationTools: AnyToolDefinition[] = [
  ban,
  unban,
  kick,
  timeout,
  removeTimeout,
  listBans,
  getTimeoutStatus,
];
