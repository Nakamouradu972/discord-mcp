import { z } from "zod";
import { ThreadChannel, type AnyThreadChannel } from "discord.js";
import { defineTool, type AnyToolDefinition } from "../../core/types.js";
import type { ToolContext } from "../../core/types.js";

const AUTO_ARCHIVE = [60, 1440, 4320, 10080] as const;

async function fetchThread(ctx: ToolContext, threadId: string): Promise<AnyThreadChannel> {
  const channel = await ctx.client.channels.fetch(threadId).catch(() => null);
  if (!channel || !(channel instanceof ThreadChannel)) {
    throw new Error(`Channel ${threadId} is not a thread.`);
  }
  return channel;
}

const createThread = defineTool({
  name: "create_thread",
  description: "Create a thread in a text/forum channel, optionally from an existing message.",
  category: "write",
  permissions: ["Create Public Threads", "Send Messages in Threads"],
  intents: ["Guilds"],
  inputSchema: {
    channelId: z.string().describe("Parent channel id."),
    name: z.string().min(1).max(100).describe("Thread name."),
    messageId: z.string().optional().describe("Start the thread from this message id."),
    autoArchiveMinutes: z
      .union([z.literal(60), z.literal(1440), z.literal(4320), z.literal(10080)])
      .optional()
      .describe("Auto-archive duration (60, 1440, 4320, 10080)."),
    reason: z.string().optional().describe("Audit-log reason."),
  },
  plan: (a) => `Create thread "${a.name}" in channel ${a.channelId}${a.messageId ? ` from message ${a.messageId}` : ""}.`,
  execute: async (a, ctx) => {
    const channel = await ctx.client.channels.fetch(a.channelId).catch(() => null);
    if (!channel || !("threads" in channel)) throw new Error(`Channel ${a.channelId} cannot host threads.`);
    const autoArchiveDuration = a.autoArchiveMinutes ?? AUTO_ARCHIVE[1];
    if (a.messageId) {
      const message = await (channel as any).messages.fetch(a.messageId);
      const thread = await message.startThread({ name: a.name, autoArchiveDuration, reason: a.reason });
      return `Created thread "${thread.name}" (${thread.id}).`;
    }
    const thread = await (channel as any).threads.create({ name: a.name, autoArchiveDuration, reason: a.reason });
    return `Created thread "${thread.name}" (${thread.id}).`;
  },
});

const editThread = defineTool({
  name: "edit_thread",
  description: "Edit a thread: name, archived/locked state, auto-archive duration, slowmode.",
  category: "write",
  permissions: ["Manage Threads"],
  intents: ["Guilds"],
  inputSchema: {
    threadId: z.string().describe("Thread id."),
    name: z.string().min(1).max(100).optional().describe("New name."),
    archived: z.boolean().optional().describe("Archive/unarchive."),
    locked: z.boolean().optional().describe("Lock/unlock."),
    autoArchiveMinutes: z
      .union([z.literal(60), z.literal(1440), z.literal(4320), z.literal(10080)])
      .optional()
      .describe("Auto-archive duration."),
    rateLimitPerUser: z.number().int().min(0).max(21600).optional().describe("Slowmode seconds."),
    reason: z.string().optional().describe("Audit-log reason."),
  },
  plan: (a) => `Edit thread ${a.threadId}.`,
  execute: async (a, ctx) => {
    const thread = await fetchThread(ctx, a.threadId);
    await thread.edit({
      name: a.name,
      archived: a.archived,
      locked: a.locked,
      autoArchiveDuration: a.autoArchiveMinutes,
      rateLimitPerUser: a.rateLimitPerUser,
      reason: a.reason,
    });
    return `Edited thread ${a.threadId}.`;
  },
});

const deleteThread = defineTool({
  name: "delete_thread",
  description: "Delete a thread permanently.",
  category: "destructive",
  permissions: ["Manage Threads"],
  intents: ["Guilds"],
  inputSchema: {
    threadId: z.string().describe("Thread id."),
    reason: z.string().optional().describe("Audit-log reason."),
  },
  plan: (a) => `Delete thread ${a.threadId}.`,
  execute: async (a, ctx) => {
    const thread = await fetchThread(ctx, a.threadId);
    await thread.delete(a.reason);
    return `Deleted thread ${a.threadId}.`;
  },
});

const listThreads = defineTool({
  name: "list_threads",
  description: "List active threads in a parent channel.",
  category: "read",
  permissions: ["View Channel"],
  intents: ["Guilds"],
  inputSchema: {
    channelId: z.string().describe("Parent channel id."),
  },
  execute: async (a, ctx) => {
    const channel = await ctx.client.channels.fetch(a.channelId).catch(() => null);
    if (!channel || !("threads" in channel)) throw new Error(`Channel ${a.channelId} cannot host threads.`);
    const active = await (channel as any).threads.fetchActive();
    const threads = active.threads as Map<string, AnyThreadChannel>;
    if (threads.size === 0) return `No active threads in channel ${a.channelId}.`;
    return `${threads.size} active thread(s):\n${[...threads.values()]
      .map((t) => `- ${t.name} (${t.id})`)
      .join("\n")}`;
  },
});

const addThreadMember = defineTool({
  name: "add_thread_member",
  description: "Add a member to a thread.",
  category: "write",
  permissions: ["Send Messages in Threads"],
  intents: ["Guilds"],
  inputSchema: {
    threadId: z.string().describe("Thread id."),
    userId: z.string().describe("Id of the user to add."),
  },
  plan: (a) => `Add user ${a.userId} to thread ${a.threadId}.`,
  execute: async (a, ctx) => {
    const thread = await fetchThread(ctx, a.threadId);
    await thread.members.add(a.userId);
    return `Added user ${a.userId} to thread ${a.threadId}.`;
  },
});

const removeThreadMember = defineTool({
  name: "remove_thread_member",
  description: "Remove a member from a thread.",
  category: "write",
  permissions: ["Manage Threads"],
  intents: ["Guilds"],
  inputSchema: {
    threadId: z.string().describe("Thread id."),
    userId: z.string().describe("Id of the user to remove."),
  },
  plan: (a) => `Remove user ${a.userId} from thread ${a.threadId}.`,
  execute: async (a, ctx) => {
    const thread = await fetchThread(ctx, a.threadId);
    await thread.members.remove(a.userId);
    return `Removed user ${a.userId} from thread ${a.threadId}.`;
  },
});

/** Thread tools. */
export const threadTools: AnyToolDefinition[] = [
  createThread,
  editThread,
  deleteThread,
  listThreads,
  addThreadMember,
  removeThreadMember,
];
