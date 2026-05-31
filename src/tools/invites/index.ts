import { z } from "zod";
import { defineTool, type AnyToolDefinition } from "../../core/types.js";
import { resolveGuild, resolveGuildChannel } from "../../core/resolve.js";

const createInvite = defineTool({
  name: "create_invite",
  description: "Create an invite link for a channel.",
  category: "write",
  permissions: ["Create Instant Invite"],
  intents: ["Guilds"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    channelId: z.string().describe("Channel the invite points to."),
    maxAgeSeconds: z.number().int().min(0).max(604800).optional().describe("Expiry in seconds (0 = never)."),
    maxUses: z.number().int().min(0).max(100).optional().describe("Max uses (0 = unlimited)."),
    temporary: z.boolean().optional().describe("Grant temporary membership."),
    unique: z.boolean().optional().describe("Always create a new invite instead of reusing."),
    reason: z.string().optional().describe("Audit-log reason."),
  },
  plan: (a) => `Create invite for channel ${a.channelId} (maxAge=${a.maxAgeSeconds ?? "default"}, maxUses=${a.maxUses ?? 0}).`,
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    const channel = await resolveGuildChannel(guild, a.channelId);
    if (!("createInvite" in channel)) throw new Error("This channel type cannot have invites.");
    const invite = await channel.createInvite({
      maxAge: a.maxAgeSeconds,
      maxUses: a.maxUses,
      temporary: a.temporary,
      unique: a.unique,
      reason: a.reason,
    });
    return `Created invite https://discord.gg/${invite.code} for channel ${a.channelId}.`;
  },
});

const listInvites = defineTool({
  name: "list_invites",
  description: "List active invites for the server.",
  category: "read",
  permissions: ["Manage Server"],
  intents: ["Guilds"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
  },
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    const invites = await guild.invites.fetch();
    if (invites.size === 0) return `No active invites in ${guild.name}.`;
    return `${invites.size} invite(s):\n${invites
      .map((i) => `- ${i.code} → channel ${i.channelId ?? "?"} (uses ${i.uses ?? 0}/${i.maxUses || "∞"})`)
      .join("\n")}`;
  },
});

const deleteInvite = defineTool({
  name: "delete_invite",
  description: "Revoke (delete) an invite by its code.",
  category: "destructive",
  permissions: ["Manage Server"],
  intents: ["Guilds"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    code: z.string().describe("Invite code to revoke."),
    reason: z.string().optional().describe("Audit-log reason."),
  },
  plan: (a) => `Revoke invite ${a.code}.`,
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    const invites = await guild.invites.fetch();
    const invite = invites.get(a.code);
    if (!invite) throw new Error(`Invite ${a.code} not found in this server.`);
    await invite.delete(a.reason);
    return `Revoked invite ${a.code}.`;
  },
});

/** Invite tools. */
export const inviteTools: AnyToolDefinition[] = [createInvite, listInvites, deleteInvite];
