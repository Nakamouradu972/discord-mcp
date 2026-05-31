import { z } from "zod";
import { defineTool, type AnyToolDefinition } from "../../core/types.js";
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
  description: "Send a text message to a channel.",
  category: "write",
  permissions: ["Send Messages", "View Channel"],
  intents: ["Guilds"],
  inputSchema: {
    channelId: z.string().describe("Target channel id."),
    message: z.string().min(1).max(2000).describe("Message content (max 2000 chars)."),
  },
  plan: (a) => `Send to channel ${a.channelId}: "${a.message}"`,
  execute: async (a, ctx) => {
    const channel = await ctx.client.channels.fetch(a.channelId);
    if (!channel || !channel.isTextBased() || !("send" in channel)) {
      throw new Error(`Channel ${a.channelId} is not a text channel that can receive messages.`);
    }
    const sent = await channel.send(a.message);
    return `Sent message ${sent.id} to channel ${a.channelId}.`;
  },
});

/** Base/connection tools. */
export const baseTools: AnyToolDefinition[] = [login, listServers, getServerInfo, send];
