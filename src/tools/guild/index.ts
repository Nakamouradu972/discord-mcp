import { z } from "zod";
import { GuildVerificationLevel } from "discord.js";
import { defineTool, type AnyToolDefinition } from "../../core/types.js";
import { resolveGuild } from "../../core/resolve.js";

const VERIFICATION_LEVELS = ["None", "Low", "Medium", "High", "VeryHigh"] as const;

const getGuildSettings = defineTool({
  name: "get_guild_settings",
  description: "Read server settings: name, description, AFK config, system channel, verification level, vanity URL.",
  category: "read",
  permissions: ["Manage Server"],
  intents: ["Guilds"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
  },
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    return [
      `**${guild.name}** (${guild.id})`,
      `Description: ${guild.description ?? "(none)"}`,
      `Verification level: ${GuildVerificationLevel[guild.verificationLevel]}`,
      `AFK channel: ${guild.afkChannelId ?? "(none)"} (timeout ${guild.afkTimeout}s)`,
      `System channel: ${guild.systemChannelId ?? "(none)"}`,
      `Vanity URL code: ${guild.vanityURLCode ?? "(none)"}`,
    ].join("\n");
  },
});

const editGuildSettings = defineTool({
  name: "edit_guild_settings",
  description: "Edit server settings (name, description, AFK, system channel, verification level, icon, vanity URL).",
  category: "write",
  permissions: ["Manage Server"],
  intents: ["Guilds"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    name: z.string().min(2).max(100).optional().describe("New server name."),
    description: z.string().max(300).nullable().optional().describe("New description (community servers)."),
    afkChannelId: z.string().nullable().optional().describe("AFK voice channel id (null clears)."),
    afkTimeout: z
      .number()
      .int()
      .optional()
      .describe("AFK timeout in seconds (60, 300, 900, 1800, 3600)."),
    systemChannelId: z.string().nullable().optional().describe("System messages channel id (null clears)."),
    verificationLevel: z.enum(VERIFICATION_LEVELS).optional().describe("Member verification level."),
    iconUrl: z.string().url().nullable().optional().describe("Server icon as a URL or data URI (null clears)."),
    vanityCode: z.string().optional().describe("Vanity URL code (requires boost level 3)."),
    reason: z.string().optional().describe("Audit-log reason."),
  },
  plan: (a) => {
    const fields = Object.entries(a).filter(
      ([k, v]) => !["guildId", "reason"].includes(k) && v !== undefined,
    );
    return `Edit guild ${a.guildId ?? "(default)"}: ${fields.map(([k, v]) => `${k}=${String(v)}`).join(", ") || "(no changes)"}`;
  },
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    const edits: Record<string, unknown> = {};
    if (a.name !== undefined) edits.name = a.name;
    if (a.description !== undefined) edits.description = a.description;
    if (a.afkChannelId !== undefined) edits.afkChannel = a.afkChannelId;
    if (a.afkTimeout !== undefined) edits.afkTimeout = a.afkTimeout;
    if (a.systemChannelId !== undefined) edits.systemChannel = a.systemChannelId;
    if (a.verificationLevel !== undefined) {
      edits.verificationLevel = GuildVerificationLevel[a.verificationLevel];
    }
    if (a.iconUrl !== undefined) edits.icon = a.iconUrl;
    if (Object.keys(edits).length > 0) await guild.edit({ ...edits, reason: a.reason });
    if (a.vanityCode !== undefined) {
      // No typed helper exists for setting the vanity code; use the raw REST
      // route. Requires the server to be at boost level 3.
      await ctx.client.rest.patch(`/guilds/${guild.id}/vanity-url` as `/${string}`, {
        body: { code: a.vanityCode },
        reason: a.reason,
      });
    }
    return `Updated settings for ${guild.name}.`;
  },
});

/** Guild settings tools. */
export const guildTools: AnyToolDefinition[] = [getGuildSettings, editGuildSettings];
