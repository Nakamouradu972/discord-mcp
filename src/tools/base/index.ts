import { z } from "zod";
import { defineTool, type AnyToolDefinition } from "../../core/types.js";
import { buildMessagePayload, embedSchema, buttonSchema } from "../../core/messagePayload.js";
import { resolveGuild } from "../../core/resolve.js";

const login = defineTool({
  name: "login",
  description: "Report the bot login status, logging in with the configured token if not already connected.",
  category: "read",
  permissions: [],
  intents: ["Guilds"],
  inputSchema: {
    token: z.string().optional().describe("Override token; defaults to DISCORD_TOKEN."),
  },
  execute: async (a, ctx) => {
    if (ctx.client.isReady()) return `Already logged in as ${ctx.client.user?.tag}.`;
    await ctx.client.login(a.token ?? ctx.config.token);
    return `Logged in as ${ctx.client.user?.tag ?? "unknown"}.`;
  },
});

const listServers = defineTool({
  name: "list_servers",
  description: "List the servers (guilds) the bot is a member of.",
  category: "read",
  permissions: [],
  intents: ["Guilds"],
  inputSchema: {},
  execute: async (_a, ctx) => {
    const guilds = ctx.client.guilds.cache;
    if (guilds.size === 0) return "The bot is not in any servers.";
    return `${guilds.size} server(s):\n${guilds.map((g) => `- ${g.name} (${g.id})`).join("\n")}`;
  },
});

const getServerInfo = defineTool({
  name: "get_server_info",
  description: "Get details about a server: member count, channels, roles and owner.",
  category: "read",
  permissions: ["View Channel"],
  intents: ["Guilds"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
  },
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    return [
      `**${guild.name}** (${guild.id})`,
      `Members: ${guild.memberCount}`,
      `Channels: ${guild.channels.cache.size}`,
      `Roles: ${guild.roles.cache.size}`,
      `Owner: ${guild.ownerId}`,
    ].join("\n");
  },
});

const send = defineTool({
  name: "send",
  description:
    "Send a message to a channel. Supports plain text, rich embeds, file attachments (by URL) and link buttons.",
  category: "write",
  permissions: ["Send Messages", "View Channel"],
  intents: ["Guilds"],
  inputSchema: {
    channelId: z.string().describe("Target channel id."),
    message: z.string().max(2000).optional().describe("Text content (max 2000 chars)."),
    embeds: z.array(embedSchema).max(10).optional().describe("Up to 10 rich embeds."),
    files: z.array(z.string().url()).max(10).optional().describe("Attachment URLs to upload."),
    buttons: z
      .array(buttonSchema)
      .max(25)
      .optional()
      .describe("Buttons (link buttons work standalone; others need an external interaction handler)."),
  },
  plan: (a) => {
    const parts = [
      a.message ? `text "${a.message}"` : null,
      a.embeds?.length ? `${a.embeds.length} embed(s)` : null,
      a.files?.length ? `${a.files.length} file(s)` : null,
      a.buttons?.length ? `${a.buttons.length} button(s)` : null,
    ].filter(Boolean);
    return `Send to channel ${a.channelId}: ${parts.join(", ") || "(empty)"}`;
  },
  execute: async (a, ctx) => {
    const channel = await ctx.client.channels.fetch(a.channelId);
    if (!channel || !channel.isTextBased() || !("send" in channel)) {
      throw new Error(`Channel ${a.channelId} is not a text channel that can receive messages.`);
    }
    const payload = buildMessagePayload({ content: a.message, embeds: a.embeds, files: a.files, buttons: a.buttons });
    const sent = await channel.send(payload);
    return `Sent message ${sent.id} to channel ${a.channelId}.`;
  },
});

const sendEmbed = defineTool({
  name: "send_embed",
  description: "Send a single rich embed to a channel (convenience wrapper over send).",
  category: "write",
  permissions: ["Send Messages", "View Channel"],
  intents: ["Guilds"],
  inputSchema: {
    channelId: z.string().describe("Target channel id."),
    content: z.string().max(2000).optional().describe("Optional text shown above the embed."),
    ...embedSchema.shape,
  },
  plan: (a) => `Send embed "${a.title ?? "(untitled)"}" to channel ${a.channelId}.`,
  execute: async (a, ctx) => {
    const channel = await ctx.client.channels.fetch(a.channelId);
    if (!channel || !channel.isTextBased() || !("send" in channel)) {
      throw new Error(`Channel ${a.channelId} is not a text channel that can receive messages.`);
    }
    const { channelId: _c, content, ...embed } = a;
    const payload = buildMessagePayload({ content, embeds: [embed] });
    const sent = await channel.send(payload);
    return `Sent embed in message ${sent.id} to channel ${a.channelId}.`;
  },
});

/** Base/connection tools. */
export const baseTools: AnyToolDefinition[] = [login, listServers, getServerInfo, send, sendEmbed];
