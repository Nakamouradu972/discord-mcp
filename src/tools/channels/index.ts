import { z } from "zod";
import { ChannelType, type PermissionOverwriteOptions } from "discord.js";
import { defineTool, type AnyToolDefinition } from "../../core/types.js";
import { resolveGuild, resolveGuildChannel } from "../../core/resolve.js";

function createChannel(name: string, type: ChannelType.GuildText | ChannelType.GuildVoice | ChannelType.GuildForum) {
  return defineTool({
    name,
    description: `Create a ${name.replace("create_", "").replace("_", " ")}.`,
    category: "write",
    permissions: ["Manage Channels"],
    intents: ["Guilds"],
    inputSchema: {
      guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
      name: z.string().min(1).max(100).describe("Channel name."),
      parentId: z.string().optional().describe("Category id to nest under."),
      topic: z.string().max(1024).optional().describe("Channel topic (text/forum only)."),
      reason: z.string().optional().describe("Audit-log reason."),
    },
    plan: (a) => `Create channel "${a.name}" (type ${ChannelType[type]}) in guild ${a.guildId ?? "(default)"}.`,
    execute: async (a, ctx) => {
      const guild = await resolveGuild(ctx, a.guildId);
      const channel = await guild.channels.create({
        name: a.name,
        type,
        parent: a.parentId,
        topic: a.topic,
        reason: a.reason,
      });
      return `Created channel "${channel.name}" (${channel.id}).`;
    },
  });
}

const createTextChannel = createChannel("create_text_channel", ChannelType.GuildText);
const createVoiceChannel = createChannel("create_voice_channel", ChannelType.GuildVoice);
const createForumChannel = createChannel("create_forum_channel", ChannelType.GuildForum);

const createCategory = defineTool({
  name: "create_category",
  description: "Create a category.",
  category: "write",
  permissions: ["Manage Channels"],
  intents: ["Guilds"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    name: z.string().min(1).max(100).describe("Category name."),
    reason: z.string().optional().describe("Audit-log reason."),
  },
  plan: (a) => `Create category "${a.name}".`,
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    const category = await guild.channels.create({ name: a.name, type: ChannelType.GuildCategory, reason: a.reason });
    return `Created category "${category.name}" (${category.id}).`;
  },
});

const editChannel = defineTool({
  name: "edit_channel",
  description: "Edit a channel: name, topic, NSFW flag, parent category or slowmode.",
  category: "write",
  permissions: ["Manage Channels"],
  intents: ["Guilds"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    channelId: z.string().describe("Channel id."),
    name: z.string().min(1).max(100).optional().describe("New name."),
    topic: z.string().max(1024).nullable().optional().describe("New topic."),
    nsfw: z.boolean().optional().describe("Mark NSFW."),
    parentId: z.string().nullable().optional().describe("Move under this category (null detaches)."),
    rateLimitPerUser: z.number().int().min(0).max(21600).optional().describe("Slowmode seconds."),
    reason: z.string().optional().describe("Audit-log reason."),
  },
  plan: (a) => `Edit channel ${a.channelId}.`,
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    const channel = await resolveGuildChannel(guild, a.channelId);
    await channel.edit({
      name: a.name,
      topic: a.topic ?? undefined,
      nsfw: a.nsfw,
      parent: a.parentId,
      rateLimitPerUser: a.rateLimitPerUser,
      reason: a.reason,
    } as Parameters<typeof channel.edit>[0]);
    return `Edited channel ${a.channelId}.`;
  },
});

const editCategory = defineTool({
  name: "edit_category",
  description: "Rename a category.",
  category: "write",
  permissions: ["Manage Channels"],
  intents: ["Guilds"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    categoryId: z.string().describe("Category id."),
    name: z.string().min(1).max(100).describe("New name."),
    reason: z.string().optional().describe("Audit-log reason."),
  },
  plan: (a) => `Rename category ${a.categoryId} → "${a.name}".`,
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    const category = await resolveGuildChannel(guild, a.categoryId);
    await category.edit({ name: a.name, reason: a.reason } as Parameters<typeof category.edit>[0]);
    return `Renamed category ${a.categoryId}.`;
  },
});

const deleteChannel = defineTool({
  name: "delete_channel",
  description: "Delete a channel permanently.",
  category: "destructive",
  permissions: ["Manage Channels"],
  intents: ["Guilds"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    channelId: z.string().describe("Channel id."),
    reason: z.string().optional().describe("Audit-log reason."),
  },
  plan: (a) => `Delete channel ${a.channelId}.`,
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    const channel = await resolveGuildChannel(guild, a.channelId);
    await channel.delete(a.reason);
    return `Deleted channel ${a.channelId}.`;
  },
});

const deleteCategory = defineTool({
  name: "delete_category",
  description: "Delete a category (its child channels are detached, not deleted).",
  category: "destructive",
  permissions: ["Manage Channels"],
  intents: ["Guilds"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    categoryId: z.string().describe("Category id."),
    reason: z.string().optional().describe("Audit-log reason."),
  },
  plan: (a) => `Delete category ${a.categoryId}.`,
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    const category = await resolveGuildChannel(guild, a.categoryId);
    await category.delete(a.reason);
    return `Deleted category ${a.categoryId}.`;
  },
});

const setChannelPermissions = defineTool({
  name: "set_channel_permissions",
  description: "Set permission overwrites for a role/member on a channel (allow/deny lists).",
  category: "write",
  permissions: ["Manage Roles", "Manage Channels"],
  intents: ["Guilds"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    channelId: z.string().describe("Channel id."),
    targetId: z.string().describe("Role or member id the overwrite applies to."),
    allow: z.array(z.string()).optional().describe("Permission names to allow, e.g. ViewChannel, SendMessages."),
    deny: z.array(z.string()).optional().describe("Permission names to deny."),
    reason: z.string().optional().describe("Audit-log reason."),
  },
  plan: (a) => `Set overwrites on channel ${a.channelId} for ${a.targetId} (allow=${a.allow?.join(",") ?? "-"}, deny=${a.deny?.join(",") ?? "-"}).`,
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    const channel = await resolveGuildChannel(guild, a.channelId);
    if (!("permissionOverwrites" in channel)) throw new Error("This channel type has no permission overwrites.");
    const options: PermissionOverwriteOptions = {};
    for (const p of a.allow ?? []) (options as Record<string, boolean>)[p] = true;
    for (const p of a.deny ?? []) (options as Record<string, boolean>)[p] = false;
    await channel.permissionOverwrites.edit(a.targetId, options, { reason: a.reason });
    return `Updated permission overwrites for ${a.targetId} on channel ${a.channelId}.`;
  },
});

const removeChannelPermissions = defineTool({
  name: "remove_channel_permissions",
  description: "Remove a role/member permission overwrite from a channel.",
  category: "destructive",
  permissions: ["Manage Roles", "Manage Channels"],
  intents: ["Guilds"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    channelId: z.string().describe("Channel id."),
    targetId: z.string().describe("Role or member id whose overwrite to remove."),
    reason: z.string().optional().describe("Audit-log reason."),
  },
  plan: (a) => `Remove overwrite for ${a.targetId} on channel ${a.channelId}.`,
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    const channel = await resolveGuildChannel(guild, a.channelId);
    if (!("permissionOverwrites" in channel)) throw new Error("This channel type has no permission overwrites.");
    await channel.permissionOverwrites.delete(a.targetId, a.reason);
    return `Removed overwrite for ${a.targetId} on channel ${a.channelId}.`;
  },
});

const listChannels = defineTool({
  name: "list_channels",
  description: "List all channels of a server with their type and id.",
  category: "read",
  permissions: ["View Channel"],
  intents: ["Guilds"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
  },
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    const channels = await guild.channels.fetch();
    if (channels.size === 0) return `No channels in ${guild.name}.`;
    const lines = channels
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .sort((x, y) => x.rawPosition - y.rawPosition)
      .map((c) => `- [${ChannelType[c.type]}] ${c.name} (${c.id})`);
    return `${lines.length} channel(s) in ${guild.name}:\n${lines.join("\n")}`;
  },
});

const getChannelInfo = defineTool({
  name: "get_channel_info",
  description: "Get details about a channel: type, topic, parent category, position and slowmode.",
  category: "read",
  permissions: ["View Channel"],
  intents: ["Guilds"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    channelId: z.string().describe("Channel id."),
  },
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    const channel = await resolveGuildChannel(guild, a.channelId);
    const topic = "topic" in channel ? (channel.topic ?? "(none)") : "(n/a)";
    const slowmode = "rateLimitPerUser" in channel ? `${channel.rateLimitPerUser ?? 0}s` : "(n/a)";
    const position = "rawPosition" in channel ? String(channel.rawPosition) : "(n/a)";
    return [
      `**${channel.name}** (${channel.id})`,
      `Type: ${ChannelType[channel.type]}`,
      `Parent: ${channel.parentId ?? "(none)"}`,
      `Position: ${position}`,
      `Topic: ${topic}`,
      `Slowmode: ${slowmode}`,
    ].join("\n");
  },
});

const setChannelPosition = defineTool({
  name: "set_channel_position",
  description: "Move a channel to a new position in the channel list.",
  category: "write",
  permissions: ["Manage Channels"],
  intents: ["Guilds"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    channelId: z.string().describe("Channel id."),
    position: z.number().int().min(0).describe("New zero-based position."),
  },
  plan: (a) => `Move channel ${a.channelId} to position ${a.position}.`,
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    const channel = await resolveGuildChannel(guild, a.channelId);
    if (!("setPosition" in channel)) throw new Error("This channel type cannot be repositioned.");
    await channel.setPosition(a.position);
    return `Moved channel ${a.channelId} to position ${a.position}.`;
  },
});

/** Channel & category tools. */
export const channelTools: AnyToolDefinition[] = [
  listChannels,
  getChannelInfo,
  createTextChannel,
  createVoiceChannel,
  createForumChannel,
  createCategory,
  editChannel,
  editCategory,
  deleteChannel,
  deleteCategory,
  setChannelPosition,
  setChannelPermissions,
  removeChannelPermissions,
];
