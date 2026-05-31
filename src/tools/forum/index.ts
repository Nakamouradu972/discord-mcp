import { z } from "zod";
import { ChannelType, ForumChannel, ThreadChannel } from "discord.js";
import { defineTool, type AnyToolDefinition, type ToolContext } from "../../core/types.js";
import { resolveGuild, resolveGuildChannel } from "../../core/resolve.js";

async function fetchForum(ctx: ToolContext, guildId: string | undefined, channelId: string): Promise<ForumChannel> {
  const guild = await resolveGuild(ctx, guildId);
  const channel = await resolveGuildChannel(guild, channelId);
  if (!(channel instanceof ForumChannel)) throw new Error(`Channel ${channelId} is not a forum channel.`);
  return channel;
}

async function fetchForumThread(ctx: ToolContext, threadId: string): Promise<ThreadChannel> {
  const channel = await ctx.client.channels.fetch(threadId).catch(() => null);
  if (!channel || !(channel instanceof ThreadChannel)) throw new Error(`Channel ${threadId} is not a forum post.`);
  return channel;
}

const getForumChannels = defineTool({
  name: "get_forum_channels",
  description: "List the forum channels of a server.",
  category: "read",
  permissions: ["View Channel"],
  intents: ["Guilds"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
  },
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    const channels = await guild.channels.fetch();
    const forums = channels.filter((c): c is ForumChannel => c?.type === ChannelType.GuildForum);
    if (forums.size === 0) return `No forum channels in ${guild.name}.`;
    return `${forums.size} forum channel(s):\n${forums.map((c) => `- ${c.name} (${c.id})`).join("\n")}`;
  },
});

const createForumPost = defineTool({
  name: "create_forum_post",
  description: "Create a forum post (thread) with an initial message.",
  category: "write",
  permissions: ["Create Public Threads", "Send Messages in Threads"],
  intents: ["Guilds"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    channelId: z.string().describe("Forum channel id."),
    name: z.string().min(1).max(100).describe("Post title."),
    content: z.string().min(1).max(2000).describe("Initial message content."),
    tagIds: z.array(z.string()).optional().describe("Applied tag ids."),
  },
  plan: (a) => `Create forum post "${a.name}" in forum ${a.channelId}.`,
  execute: async (a, ctx) => {
    const forum = await fetchForum(ctx, a.guildId, a.channelId);
    const thread = await forum.threads.create({
      name: a.name,
      message: { content: a.content },
      appliedTags: a.tagIds,
    });
    return `Created forum post "${thread.name}" (${thread.id}).`;
  },
});

const getForumPost = defineTool({
  name: "get_forum_post",
  description: "Read a forum post: title and starter message.",
  category: "read",
  permissions: ["View Channel", "Read Message History"],
  intents: ["Guilds", "MessageContent"],
  inputSchema: {
    threadId: z.string().describe("Forum post (thread) id."),
  },
  execute: async (a, ctx) => {
    const thread = await fetchForumThread(ctx, a.threadId);
    const starter = await thread.fetchStarterMessage().catch(() => null);
    return `**${thread.name}** (${thread.id})\n${starter?.content ?? "(no starter message)"}`;
  },
});

const listForumThreads = defineTool({
  name: "list_forum_threads",
  description: "List active posts (threads) of a forum channel.",
  category: "read",
  permissions: ["View Channel"],
  intents: ["Guilds"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    channelId: z.string().describe("Forum channel id."),
  },
  execute: async (a, ctx) => {
    const forum = await fetchForum(ctx, a.guildId, a.channelId);
    const active = await forum.threads.fetchActive();
    if (active.threads.size === 0) return `No active posts in forum ${a.channelId}.`;
    return `${active.threads.size} post(s):\n${active.threads.map((t) => `- ${t.name} (${t.id})`).join("\n")}`;
  },
});

const replyToForum = defineTool({
  name: "reply_to_forum",
  description: "Reply to a forum post with a new message.",
  category: "write",
  permissions: ["Send Messages in Threads"],
  intents: ["Guilds"],
  inputSchema: {
    threadId: z.string().describe("Forum post (thread) id."),
    content: z.string().min(1).max(2000).describe("Reply content."),
  },
  plan: (a) => `Reply to forum post ${a.threadId}.`,
  execute: async (a, ctx) => {
    const thread = await fetchForumThread(ctx, a.threadId);
    const message = await thread.send(a.content);
    return `Replied to forum post ${a.threadId} (message ${message.id}).`;
  },
});

const getForumTags = defineTool({
  name: "get_forum_tags",
  description: "List the available tags of a forum channel.",
  category: "read",
  permissions: ["View Channel"],
  intents: ["Guilds"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    channelId: z.string().describe("Forum channel id."),
  },
  execute: async (a, ctx) => {
    const forum = await fetchForum(ctx, a.guildId, a.channelId);
    if (forum.availableTags.length === 0) return `No tags configured on forum ${a.channelId}.`;
    return `${forum.availableTags.length} tag(s):\n${forum.availableTags.map((t) => `- ${t.name} (${t.id})`).join("\n")}`;
  },
});

const setForumTags = defineTool({
  name: "set_forum_tags",
  description: "Replace the set of available tags on a forum channel.",
  category: "write",
  permissions: ["Manage Channels"],
  intents: ["Guilds"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    channelId: z.string().describe("Forum channel id."),
    tagNames: z.array(z.string().min(1).max(20)).min(1).max(20).describe("Tag names to set."),
  },
  plan: (a) => `Set ${a.tagNames.length} tag(s) on forum ${a.channelId}.`,
  execute: async (a, ctx) => {
    const forum = await fetchForum(ctx, a.guildId, a.channelId);
    await forum.setAvailableTags(a.tagNames.map((name) => ({ name })));
    return `Updated tags on forum ${a.channelId}.`;
  },
});

const updateForumPost = defineTool({
  name: "update_forum_post",
  description: "Update a forum post: title, archived state, or applied tags.",
  category: "write",
  permissions: ["Manage Threads"],
  intents: ["Guilds"],
  inputSchema: {
    threadId: z.string().describe("Forum post (thread) id."),
    name: z.string().min(1).max(100).optional().describe("New title."),
    archived: z.boolean().optional().describe("Archive/unarchive the post."),
    tagIds: z.array(z.string()).optional().describe("Replacement applied tag ids."),
    reason: z.string().optional().describe("Audit-log reason."),
  },
  plan: (a) => `Update forum post ${a.threadId}.`,
  execute: async (a, ctx) => {
    const thread = await fetchForumThread(ctx, a.threadId);
    await thread.edit({ name: a.name, archived: a.archived, appliedTags: a.tagIds, reason: a.reason });
    return `Updated forum post ${a.threadId}.`;
  },
});

const deleteForumPost = defineTool({
  name: "delete_forum_post",
  description: "Delete a forum post permanently.",
  category: "destructive",
  permissions: ["Manage Threads"],
  intents: ["Guilds"],
  inputSchema: {
    threadId: z.string().describe("Forum post (thread) id."),
    reason: z.string().optional().describe("Audit-log reason."),
  },
  plan: (a) => `Delete forum post ${a.threadId}.`,
  execute: async (a, ctx) => {
    const thread = await fetchForumThread(ctx, a.threadId);
    await thread.delete(a.reason);
    return `Deleted forum post ${a.threadId}.`;
  },
});

/** Forum tools. */
export const forumTools: AnyToolDefinition[] = [
  getForumChannels,
  createForumPost,
  getForumPost,
  listForumThreads,
  replyToForum,
  getForumTags,
  setForumTags,
  updateForumPost,
  deleteForumPost,
];
