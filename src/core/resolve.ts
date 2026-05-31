import type { Guild, GuildBasedChannel } from "discord.js";
import type { ToolContext } from "./types.js";

/**
 * Resolve the target guild for a tool call, falling back to the configured
 * default guild when `guildId` is omitted. Throws a friendly error when no
 * guild can be determined or found.
 */
export async function resolveGuild(ctx: ToolContext, guildId?: string): Promise<Guild> {
  const id = guildId && guildId.length > 0 ? guildId : ctx.config.defaultGuildId;
  if (!id) {
    throw new Error("No guildId provided and no DISCORD_GUILD_ID default is configured.");
  }
  try {
    return await ctx.client.guilds.fetch(id);
  } catch {
    throw new Error(`Discord server not found by guildId "${id}".`);
  }
}

/** Resolve a channel by id within a guild, throwing a friendly error otherwise. */
export async function resolveGuildChannel(guild: Guild, channelId: string): Promise<GuildBasedChannel> {
  if (!channelId) throw new Error("channelId cannot be empty.");
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) throw new Error(`Channel not found by channelId "${channelId}".`);
  return channel;
}
