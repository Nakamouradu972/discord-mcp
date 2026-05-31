import { z } from "zod";
import { defineTool, type AnyToolDefinition } from "../../core/types.js";
import { resolveMessageChannel } from "../../core/resolve.js";

function formatMessage(m: { author: { tag: string }; content: string; id: string }): string {
  const content = m.content.length > 0 ? m.content : "(no text content)";
  return `- [${m.id}] ${m.author.tag}: ${content}`;
}

const getChannelMessages = defineTool({
  name: "get_channel_messages",
  description: "Fetch recent messages from a channel (newest first).",
  category: "read",
  permissions: ["View Channel", "Read Message History"],
  intents: ["GuildMessages", "MessageContent"],
  inputSchema: {
    channelId: z.string().describe("Channel id."),
    limit: z.number().int().min(1).max(100).optional().describe("Max messages (default 50)."),
    before: z.string().optional().describe("Return messages before this message id (pagination)."),
  },
  execute: async (a, ctx) => {
    const channel = await resolveMessageChannel(ctx, a.channelId);
    const messages = await channel.messages.fetch({ limit: a.limit ?? 50, before: a.before });
    if (messages.size === 0) return `No messages in channel ${a.channelId}.`;
    return `${messages.size} message(s):\n${messages.map(formatMessage).join("\n")}`;
  },
});

const readMessages = defineTool({
  name: "read_messages",
  description: "Alias of get_channel_messages: read recent messages from a channel.",
  category: "read",
  permissions: ["View Channel", "Read Message History"],
  intents: ["GuildMessages", "MessageContent"],
  inputSchema: {
    channelId: z.string().describe("Channel id."),
    limit: z.number().int().min(1).max(100).optional().describe("Max messages (default 50)."),
  },
  execute: async (a, ctx) => {
    const channel = await resolveMessageChannel(ctx, a.channelId);
    const messages = await channel.messages.fetch({ limit: a.limit ?? 50 });
    if (messages.size === 0) return `No messages in channel ${a.channelId}.`;
    return `${messages.size} message(s):\n${messages.map(formatMessage).join("\n")}`;
  },
});

const getMessage = defineTool({
  name: "get_message",
  description: "Fetch a single message by id.",
  category: "read",
  permissions: ["View Channel", "Read Message History"],
  intents: ["GuildMessages", "MessageContent"],
  inputSchema: {
    channelId: z.string().describe("Channel id."),
    messageId: z.string().describe("Message id."),
  },
  execute: async (a, ctx) => {
    const channel = await resolveMessageChannel(ctx, a.channelId);
    const m = await channel.messages.fetch(a.messageId);
    return `Message ${m.id} by ${m.author.tag} (${m.createdAt.toISOString()}):\n${m.content || "(no text content)"}`;
  },
});

const searchMessages = defineTool({
  name: "search_messages",
  description: "Search recent messages of a channel for a text query (client-side filter).",
  category: "read",
  permissions: ["View Channel", "Read Message History"],
  intents: ["GuildMessages", "MessageContent"],
  inputSchema: {
    channelId: z.string().describe("Channel id."),
    query: z.string().min(1).describe("Substring to search for (case-insensitive)."),
    limit: z.number().int().min(1).max(100).optional().describe("How many recent messages to scan (default 100)."),
  },
  execute: async (a, ctx) => {
    const channel = await resolveMessageChannel(ctx, a.channelId);
    const messages = await channel.messages.fetch({ limit: a.limit ?? 100 });
    const needle = a.query.toLowerCase();
    const matches = messages.filter((m) => m.content.toLowerCase().includes(needle));
    if (matches.size === 0) return `No messages matching "${a.query}".`;
    return `${matches.size} match(es):\n${matches.map(formatMessage).join("\n")}`;
  },
});

const editMessage = defineTool({
  name: "edit_message",
  description: "Edit the content of a message previously sent by the bot.",
  category: "write",
  permissions: ["Send Messages"],
  intents: ["GuildMessages"],
  inputSchema: {
    channelId: z.string().describe("Channel id."),
    messageId: z.string().describe("Message id."),
    content: z.string().min(1).max(2000).describe("New message content."),
  },
  plan: (a) => `Edit message ${a.messageId} → "${a.content}"`,
  execute: async (a, ctx) => {
    const channel = await resolveMessageChannel(ctx, a.channelId);
    const message = await channel.messages.fetch(a.messageId);
    await message.edit(a.content);
    return `Edited message ${a.messageId}.`;
  },
});

const deleteMessage = defineTool({
  name: "delete_message",
  description: "Delete a single message.",
  category: "destructive",
  permissions: ["Manage Messages"],
  intents: ["GuildMessages"],
  inputSchema: {
    channelId: z.string().describe("Channel id."),
    messageId: z.string().describe("Message id."),
  },
  plan: (a) => `Delete message ${a.messageId} in channel ${a.channelId}.`,
  execute: async (a, ctx) => {
    const channel = await resolveMessageChannel(ctx, a.channelId);
    const message = await channel.messages.fetch(a.messageId);
    await message.delete();
    return `Deleted message ${a.messageId}.`;
  },
});

const bulkDeleteMessages = defineTool({
  name: "bulk_delete_messages",
  description: "Bulk-delete up to 100 recent messages (younger than 14 days).",
  category: "destructive",
  permissions: ["Manage Messages"],
  intents: ["GuildMessages"],
  inputSchema: {
    channelId: z.string().describe("Channel id."),
    count: z.number().int().min(1).max(100).describe("Number of recent messages to delete (1–100)."),
  },
  plan: (a) => `Bulk-delete ${a.count} recent message(s) in channel ${a.channelId}.`,
  execute: async (a, ctx) => {
    const channel = await resolveMessageChannel(ctx, a.channelId);
    if (!("bulkDelete" in channel)) throw new Error("This channel does not support bulk deletion.");
    const deleted = await channel.bulkDelete(a.count, true);
    return `Bulk-deleted ${deleted.size} message(s) in channel ${a.channelId}.`;
  },
});

const pinMessage = defineTool({
  name: "pin_message",
  description: "Pin a message in its channel.",
  category: "write",
  permissions: ["Manage Messages"],
  intents: ["GuildMessages"],
  inputSchema: {
    channelId: z.string().describe("Channel id."),
    messageId: z.string().describe("Message id."),
  },
  plan: (a) => `Pin message ${a.messageId}.`,
  execute: async (a, ctx) => {
    const channel = await resolveMessageChannel(ctx, a.channelId);
    const message = await channel.messages.fetch(a.messageId);
    await message.pin();
    return `Pinned message ${a.messageId}.`;
  },
});

const unpinMessage = defineTool({
  name: "unpin_message",
  description: "Unpin a message in its channel.",
  category: "write",
  permissions: ["Manage Messages"],
  intents: ["GuildMessages"],
  inputSchema: {
    channelId: z.string().describe("Channel id."),
    messageId: z.string().describe("Message id."),
  },
  plan: (a) => `Unpin message ${a.messageId}.`,
  execute: async (a, ctx) => {
    const channel = await resolveMessageChannel(ctx, a.channelId);
    const message = await channel.messages.fetch(a.messageId);
    await message.unpin();
    return `Unpinned message ${a.messageId}.`;
  },
});

/** Message tools (base + extension). */
export const messageTools: AnyToolDefinition[] = [
  getChannelMessages,
  readMessages,
  getMessage,
  searchMessages,
  editMessage,
  deleteMessage,
  bulkDeleteMessages,
  pinMessage,
  unpinMessage,
];
