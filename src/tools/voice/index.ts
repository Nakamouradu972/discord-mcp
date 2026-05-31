import { z } from "zod";
import { StageChannel, StageInstancePrivacyLevel } from "discord.js";
import { defineTool, type AnyToolDefinition, type ToolContext } from "../../core/types.js";
import { resolveGuild, resolveGuildChannel } from "../../core/resolve.js";

async function fetchStageChannel(ctx: ToolContext, guildId: string | undefined, channelId: string): Promise<StageChannel> {
  const guild = await resolveGuild(ctx, guildId);
  const channel = await resolveGuildChannel(guild, channelId);
  if (!(channel instanceof StageChannel)) throw new Error(`Channel ${channelId} is not a stage channel.`);
  return channel;
}

const startStageInstance = defineTool({
  name: "start_stage_instance",
  description: "Start a live stage instance (open the stage) on a stage channel, with a topic.",
  category: "write",
  permissions: ["Manage Channels", "Mute Members", "Move Members"],
  intents: ["Guilds"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    channelId: z.string().describe("Stage channel id."),
    topic: z.string().min(1).max(120).describe("Stage topic."),
    public: z.boolean().optional().describe("Make the stage public (default false = guild only)."),
  },
  plan: (a) => `Start stage instance on channel ${a.channelId}: "${a.topic}".`,
  execute: async (a, ctx) => {
    const channel = await fetchStageChannel(ctx, a.guildId, a.channelId);
    const instance = await channel.createStageInstance({
      topic: a.topic,
      privacyLevel: a.public ? StageInstancePrivacyLevel.Public : StageInstancePrivacyLevel.GuildOnly,
    });
    return `Started stage instance on ${channel.name}: "${instance.topic}".`;
  },
});

const editStageInstance = defineTool({
  name: "edit_stage_instance",
  description: "Edit the topic of a live stage instance.",
  category: "write",
  permissions: ["Manage Channels", "Mute Members", "Move Members"],
  intents: ["Guilds"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    channelId: z.string().describe("Stage channel id."),
    topic: z.string().min(1).max(120).describe("New stage topic."),
  },
  plan: (a) => `Edit stage instance on channel ${a.channelId}: "${a.topic}".`,
  execute: async (a, ctx) => {
    const channel = await fetchStageChannel(ctx, a.guildId, a.channelId);
    await channel.stageInstance?.edit({ topic: a.topic });
    return `Updated stage instance topic on ${channel.name}.`;
  },
});

const stopStageInstance = defineTool({
  name: "stop_stage_instance",
  description: "Stop (close) the live stage instance on a stage channel.",
  category: "destructive",
  permissions: ["Manage Channels", "Mute Members", "Move Members"],
  intents: ["Guilds"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    channelId: z.string().describe("Stage channel id."),
  },
  plan: (a) => `Stop stage instance on channel ${a.channelId}.`,
  execute: async (a, ctx) => {
    const channel = await fetchStageChannel(ctx, a.guildId, a.channelId);
    if (!channel.stageInstance) throw new Error(`No active stage instance on channel ${a.channelId}.`);
    await channel.stageInstance.delete();
    return `Stopped stage instance on ${channel.name}.`;
  },
});

const disconnectMember = defineTool({
  name: "disconnect_member",
  description: "Disconnect a member from their current voice channel.",
  category: "write",
  permissions: ["Move Members"],
  intents: ["GuildVoiceStates", "GuildMembers"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    userId: z.string().describe("Id of the member to disconnect."),
    reason: z.string().optional().describe("Audit-log reason."),
  },
  plan: (a) => `Disconnect member ${a.userId} from voice.`,
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    const member = await guild.members.fetch(a.userId);
    if (!member.voice.channelId) throw new Error(`${member.user.tag} is not connected to a voice channel.`);
    await member.voice.disconnect(a.reason);
    return `Disconnected ${member.user.tag} from voice.`;
  },
});

/** Voice & stage tools. */
export const voiceTools: AnyToolDefinition[] = [
  startStageInstance,
  editStageInstance,
  stopStageInstance,
  disconnectMember,
];
