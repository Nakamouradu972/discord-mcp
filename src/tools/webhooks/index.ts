import { z } from "zod";
import { WebhookClient } from "discord.js";
import { defineTool, type AnyToolDefinition } from "../../core/types.js";
import { resolveGuild, resolveGuildChannel } from "../../core/resolve.js";

const createWebhook = defineTool({
  name: "create_webhook",
  description: "Create a webhook on a text channel. The returned URL embeds a secret token.",
  category: "write",
  permissions: ["Manage Webhooks"],
  intents: ["Guilds"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    channelId: z.string().describe("Channel id to attach the webhook to."),
    name: z.string().min(1).max(80).describe("Webhook name."),
    reason: z.string().optional().describe("Audit-log reason."),
  },
  plan: (a) => `Create webhook "${a.name}" on channel ${a.channelId}.`,
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    const channel = await resolveGuildChannel(guild, a.channelId);
    if (!("createWebhook" in channel)) throw new Error("This channel type cannot host webhooks.");
    const webhook = await channel.createWebhook({ name: a.name, reason: a.reason });
    return `Created webhook "${webhook.name}" (id ${webhook.id}). URL: ${webhook.url}`;
  },
});

const sendWebhookMessage = defineTool({
  name: "send_webhook_message",
  description: "Send a message through a webhook (by id+token or full URL).",
  category: "write",
  permissions: [],
  intents: [],
  inputSchema: {
    webhookId: z.string().optional().describe("Webhook id (with token)."),
    token: z.string().optional().describe("Webhook token."),
    url: z.string().url().optional().describe("Full webhook URL (alternative to id+token)."),
    content: z.string().min(1).max(2000).describe("Message content."),
    username: z.string().optional().describe("Override the webhook display name."),
    avatarURL: z.string().url().optional().describe("Override the webhook avatar."),
  },
  plan: (a) => `Send webhook message via ${a.url ?? a.webhookId}.`,
  execute: async (a) => {
    const client = a.url
      ? new WebhookClient({ url: a.url })
      : a.webhookId && a.token
        ? new WebhookClient({ id: a.webhookId, token: a.token })
        : null;
    if (!client) throw new Error("Provide either url, or both webhookId and token.");
    const message = await client.send({ content: a.content, username: a.username, avatarURL: a.avatarURL });
    return `Sent webhook message ${message.id}.`;
  },
});

const editWebhook = defineTool({
  name: "edit_webhook",
  description: "Edit a webhook's name or move it to another channel.",
  category: "write",
  permissions: ["Manage Webhooks"],
  intents: ["Guilds"],
  inputSchema: {
    webhookId: z.string().describe("Webhook id."),
    name: z.string().min(1).max(80).optional().describe("New name."),
    channelId: z.string().optional().describe("Move the webhook to this channel."),
    reason: z.string().optional().describe("Audit-log reason."),
  },
  plan: (a) => `Edit webhook ${a.webhookId}.`,
  execute: async (a, ctx) => {
    const webhook = await ctx.client.fetchWebhook(a.webhookId);
    await webhook.edit({ name: a.name, channel: a.channelId, reason: a.reason });
    return `Edited webhook ${a.webhookId}.`;
  },
});

const deleteWebhook = defineTool({
  name: "delete_webhook",
  description: "Delete a webhook permanently.",
  category: "destructive",
  permissions: ["Manage Webhooks"],
  intents: ["Guilds"],
  inputSchema: {
    webhookId: z.string().describe("Webhook id."),
    reason: z.string().optional().describe("Audit-log reason."),
  },
  plan: (a) => `Delete webhook ${a.webhookId}.`,
  execute: async (a, ctx) => {
    const webhook = await ctx.client.fetchWebhook(a.webhookId);
    await webhook.delete(a.reason);
    return `Deleted webhook ${a.webhookId}.`;
  },
});

/** Webhook tools. */
export const webhookTools: AnyToolDefinition[] = [
  createWebhook,
  sendWebhookMessage,
  editWebhook,
  deleteWebhook,
];
