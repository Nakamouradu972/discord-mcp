import { z } from "zod";
import { defineTool, type AnyToolDefinition } from "../../core/types.js";
import { resolveMessageChannel } from "../../core/resolve.js";

const addReaction = defineTool({
  name: "add_reaction",
  description: "Add an emoji reaction to a message.",
  category: "write",
  permissions: ["Add Reactions", "Read Message History"],
  intents: ["GuildMessageReactions"],
  inputSchema: {
    channelId: z.string().describe("Channel id."),
    messageId: z.string().describe("Message id."),
    emoji: z.string().describe("Unicode emoji or custom emoji in name:id form."),
  },
  plan: (a) => `React to message ${a.messageId} with ${a.emoji}.`,
  execute: async (a, ctx) => {
    const channel = await resolveMessageChannel(ctx, a.channelId);
    const message = await channel.messages.fetch(a.messageId);
    await message.react(a.emoji);
    return `Reacted to message ${a.messageId} with ${a.emoji}.`;
  },
});

const addMultipleReactions = defineTool({
  name: "add_multiple_reactions",
  description: "Add several emoji reactions to a message in order.",
  category: "write",
  permissions: ["Add Reactions", "Read Message History"],
  intents: ["GuildMessageReactions"],
  inputSchema: {
    channelId: z.string().describe("Channel id."),
    messageId: z.string().describe("Message id."),
    emojis: z.array(z.string()).min(1).max(20).describe("Emojis to add (in order)."),
  },
  plan: (a) => `Add ${a.emojis.length} reaction(s) to message ${a.messageId}.`,
  execute: async (a, ctx) => {
    const channel = await resolveMessageChannel(ctx, a.channelId);
    const message = await channel.messages.fetch(a.messageId);
    for (const emoji of a.emojis) await message.react(emoji);
    return `Added ${a.emojis.length} reaction(s) to message ${a.messageId}.`;
  },
});

const removeReaction = defineTool({
  name: "remove_reaction",
  description: "Remove the bot's own reaction (or all of one emoji) from a message.",
  category: "write",
  permissions: ["Manage Messages"],
  intents: ["GuildMessageReactions"],
  inputSchema: {
    channelId: z.string().describe("Channel id."),
    messageId: z.string().describe("Message id."),
    emoji: z.string().describe("Emoji whose reaction to remove."),
  },
  plan: (a) => `Remove ${a.emoji} reaction from message ${a.messageId}.`,
  execute: async (a, ctx) => {
    const channel = await resolveMessageChannel(ctx, a.channelId);
    const message = await channel.messages.fetch(a.messageId);
    const reaction = message.reactions.resolve(a.emoji);
    if (!reaction) throw new Error(`No ${a.emoji} reaction on message ${a.messageId}.`);
    await reaction.remove();
    return `Removed ${a.emoji} reaction from message ${a.messageId}.`;
  },
});

const getReactionUsers = defineTool({
  name: "get_reaction_users",
  description: "List users who reacted to a message with a given emoji.",
  category: "read",
  permissions: ["Read Message History"],
  intents: ["GuildMessageReactions"],
  inputSchema: {
    channelId: z.string().describe("Channel id."),
    messageId: z.string().describe("Message id."),
    emoji: z.string().describe("Emoji to inspect."),
    limit: z.number().int().min(1).max(100).optional().describe("Max users (default 100)."),
  },
  execute: async (a, ctx) => {
    const channel = await resolveMessageChannel(ctx, a.channelId);
    const message = await channel.messages.fetch(a.messageId);
    const reaction = message.reactions.resolve(a.emoji);
    if (!reaction) return `No ${a.emoji} reaction on message ${a.messageId}.`;
    const users = await reaction.users.fetch({ limit: a.limit ?? 100 });
    return `${users.size} user(s) reacted with ${a.emoji}:\n${users.map((u) => `- ${u.tag} (${u.id})`).join("\n")}`;
  },
});

const clearReactions = defineTool({
  name: "clear_reactions",
  description: "Remove all reactions from a message.",
  category: "destructive",
  permissions: ["Manage Messages"],
  intents: ["GuildMessageReactions"],
  inputSchema: {
    channelId: z.string().describe("Channel id."),
    messageId: z.string().describe("Message id."),
  },
  plan: (a) => `Clear all reactions from message ${a.messageId}.`,
  execute: async (a, ctx) => {
    const channel = await resolveMessageChannel(ctx, a.channelId);
    const message = await channel.messages.fetch(a.messageId);
    await message.reactions.removeAll();
    return `Cleared all reactions from message ${a.messageId}.`;
  },
});

/** Reaction tools (extension). */
export const reactionTools: AnyToolDefinition[] = [
  addReaction,
  addMultipleReactions,
  removeReaction,
  getReactionUsers,
  clearReactions,
];
