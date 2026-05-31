import { z } from "zod";
import { defineTool, type AnyToolDefinition } from "../../core/types.js";

async function fetchTextChannel(ctx: { client: { channels: { fetch: (id: string) => Promise<unknown> } } }, channelId: string) {
  const channel = await ctx.client.channels.fetch(channelId);
  if (!channel || typeof channel !== "object" || !("messages" in channel)) {
    throw new Error(`Channel ${channelId} is not a message channel.`);
  }
  return channel as { messages: { fetch: (id: string) => Promise<any> }; send: (opts: any) => Promise<any> };
}

const createPoll = defineTool({
  name: "create_poll",
  description: "Create a native Discord poll in a channel.",
  category: "write",
  permissions: ["Send Messages", "View Channel"],
  intents: ["Guilds"],
  inputSchema: {
    channelId: z.string().describe("Channel to post the poll in."),
    question: z.string().min(1).max(300).describe("Poll question."),
    answers: z.array(z.string().min(1).max(55)).min(1).max(10).describe("Answer options (1–10)."),
    durationHours: z.number().int().min(1).max(768).optional().describe("Open duration in hours (default 24)."),
    allowMultiselect: z.boolean().optional().describe("Allow voting for multiple answers."),
  },
  plan: (a) => `Create poll in channel ${a.channelId}: "${a.question}" with ${a.answers.length} answer(s).`,
  execute: async (a, ctx) => {
    const channel = await fetchTextChannel(ctx, a.channelId);
    const message = await channel.send({
      poll: {
        question: { text: a.question },
        answers: a.answers.map((text) => ({ text })),
        duration: a.durationHours ?? 24,
        allowMultiselect: a.allowMultiselect ?? false,
      },
    });
    return `Created poll in message ${message.id}.`;
  },
});

const endPoll = defineTool({
  name: "end_poll",
  description: "End an active poll immediately, finalizing the results.",
  category: "write",
  permissions: ["Manage Messages"],
  intents: ["Guilds"],
  inputSchema: {
    channelId: z.string().describe("Channel containing the poll message."),
    messageId: z.string().describe("Id of the poll message."),
  },
  plan: (a) => `End poll in message ${a.messageId}.`,
  execute: async (a, ctx) => {
    const channel = await fetchTextChannel(ctx, a.channelId);
    const message = await channel.messages.fetch(a.messageId);
    if (!message.poll) throw new Error(`Message ${a.messageId} does not contain a poll.`);
    await message.poll.end();
    return `Ended poll in message ${a.messageId}.`;
  },
});

const getPollResults = defineTool({
  name: "get_poll_results",
  description: "Read the current vote counts of a poll.",
  category: "read",
  permissions: ["View Channel", "Read Message History"],
  intents: ["Guilds"],
  inputSchema: {
    channelId: z.string().describe("Channel containing the poll message."),
    messageId: z.string().describe("Id of the poll message."),
  },
  execute: async (a, ctx) => {
    const channel = await fetchTextChannel(ctx, a.channelId);
    const message = await channel.messages.fetch(a.messageId);
    if (!message.poll) throw new Error(`Message ${a.messageId} does not contain a poll.`);
    const lines = message.poll.answers.map((ans: any) => `- ${ans.text}: ${ans.voteCount} vote(s)`);
    const status = message.poll.resultsFinalized ? "finalized" : "open";
    return `Poll "${message.poll.question.text}" (${status}):\n${lines.join("\n")}`;
  },
});

/** Poll tools. */
export const pollTools: AnyToolDefinition[] = [createPoll, endPoll, getPollResults];
