import { z } from "zod";
import { defineTool, type AnyToolDefinition } from "../../core/types.js";
import { resolveGuild } from "../../core/resolve.js";

const createEmoji = defineTool({
  name: "create_emoji",
  description: "Create a custom emoji from an image URL or data URI.",
  category: "write",
  permissions: ["Manage Emojis and Stickers"],
  intents: ["Guilds"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    name: z.string().min(2).max(32).describe("Emoji name (letters, digits, underscores)."),
    imageUrl: z.string().url().describe("Image URL or data URI (PNG/JPG/GIF, <256KB)."),
    reason: z.string().optional().describe("Audit-log reason."),
  },
  plan: (a) => `Create emoji :${a.name}: from ${a.imageUrl}.`,
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    const emoji = await guild.emojis.create({ attachment: a.imageUrl, name: a.name, reason: a.reason });
    return `Created emoji :${emoji.name}: (${emoji.id}).`;
  },
});

const deleteEmoji = defineTool({
  name: "delete_emoji",
  description: "Delete a custom emoji by id.",
  category: "destructive",
  permissions: ["Manage Emojis and Stickers"],
  intents: ["Guilds"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    emojiId: z.string().describe("Id of the emoji to delete."),
    reason: z.string().optional().describe("Audit-log reason."),
  },
  plan: (a) => `Delete emoji ${a.emojiId}.`,
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    const emoji = await guild.emojis.fetch(a.emojiId);
    await emoji.delete(a.reason);
    return `Deleted emoji ${a.emojiId}.`;
  },
});

const listEmojis = defineTool({
  name: "list_emojis",
  description: "List the custom emojis of a server.",
  category: "read",
  permissions: ["View Channel"],
  intents: ["Guilds"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
  },
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    const emojis = await guild.emojis.fetch();
    if (emojis.size === 0) return `No custom emojis in ${guild.name}.`;
    return `${emojis.size} emoji(s):\n${emojis.map((e) => `- :${e.name}: (${e.id})`).join("\n")}`;
  },
});

const listStickers = defineTool({
  name: "list_stickers",
  description: "List the custom stickers of a server.",
  category: "read",
  permissions: ["View Channel"],
  intents: ["Guilds"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
  },
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    const stickers = await guild.stickers.fetch();
    if (stickers.size === 0) return `No custom stickers in ${guild.name}.`;
    return `${stickers.size} sticker(s):\n${stickers.map((s) => `- ${s.name} (${s.id})`).join("\n")}`;
  },
});

/** Emoji & sticker tools. */
export const emojiTools: AnyToolDefinition[] = [createEmoji, deleteEmoji, listEmojis, listStickers];
