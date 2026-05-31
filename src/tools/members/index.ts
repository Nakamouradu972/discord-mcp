import { z } from "zod";
import { defineTool, type AnyToolDefinition } from "../../core/types.js";
import { resolveGuild } from "../../core/resolve.js";

const listMembers = defineTool({
  name: "list_members",
  description: "List members of a server (up to a limit).",
  category: "read",
  permissions: ["View Channel"],
  intents: ["GuildMembers"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    limit: z.number().int().min(1).max(1000).optional().describe("Max members to return (default 100)."),
  },
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    const members = await guild.members.list({ limit: a.limit ?? 100 });
    return `${members.size} member(s):\n${members.map((m) => `- ${m.user.tag} (${m.id})`).join("\n")}`;
  },
});

const getMember = defineTool({
  name: "get_member",
  description: "Get details about a single member: roles, join date, nickname.",
  category: "read",
  permissions: ["View Channel"],
  intents: ["GuildMembers"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    userId: z.string().describe("Id of the member."),
  },
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    const m = await guild.members.fetch(a.userId);
    return [
      `**${m.user.tag}** (${m.id})`,
      `Nickname: ${m.nickname ?? "(none)"}`,
      `Joined: ${m.joinedAt?.toISOString() ?? "unknown"}`,
      `Roles: ${m.roles.cache.map((r) => r.name).join(", ")}`,
    ].join("\n");
  },
});

const editMember = defineTool({
  name: "edit_member",
  description: "Edit a member: nickname, server mute/deafen, move to a voice channel, or set a timeout.",
  category: "write",
  permissions: ["Manage Nicknames", "Mute Members", "Deafen Members", "Move Members", "Moderate Members"],
  intents: ["GuildMembers", "GuildVoiceStates"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    userId: z.string().describe("Id of the member to edit."),
    nickname: z.string().max(32).nullable().optional().describe("New nickname (null clears it)."),
    mute: z.boolean().optional().describe("Server mute in voice."),
    deafen: z.boolean().optional().describe("Server deafen in voice."),
    voiceChannelId: z.string().nullable().optional().describe("Move to this voice channel (null disconnects)."),
    timeoutMinutes: z.number().int().min(0).max(40320).optional().describe("Timeout minutes (0 clears)."),
    reason: z.string().optional().describe("Audit-log reason."),
  },
  plan: (a) => {
    const changes: string[] = [];
    if (a.nickname !== undefined) changes.push(`nickname=${a.nickname ?? "(cleared)"}`);
    if (a.mute !== undefined) changes.push(`mute=${a.mute}`);
    if (a.deafen !== undefined) changes.push(`deafen=${a.deafen}`);
    if (a.voiceChannelId !== undefined) changes.push(`voiceChannel=${a.voiceChannelId ?? "(disconnect)"}`);
    if (a.timeoutMinutes !== undefined) changes.push(`timeout=${a.timeoutMinutes}m`);
    return `Edit member ${a.userId}: ${changes.join(", ") || "(no changes)"}`;
  },
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    const member = await guild.members.fetch(a.userId);
    const edits: Record<string, unknown> = {};
    if (a.nickname !== undefined) edits.nick = a.nickname;
    if (a.mute !== undefined) edits.mute = a.mute;
    if (a.deafen !== undefined) edits.deaf = a.deafen;
    if (a.voiceChannelId !== undefined) edits.channel = a.voiceChannelId;
    if (a.timeoutMinutes !== undefined) {
      edits.communicationDisabledUntil =
        a.timeoutMinutes > 0 ? new Date(Date.now() + a.timeoutMinutes * 60_000) : null;
    }
    await member.edit({ ...edits, reason: a.reason });
    return `Edited member ${member.user.tag}.`;
  },
});

/** Member tools (extension). */
export const memberTools: AnyToolDefinition[] = [listMembers, getMember, editMember];
