import { z } from "zod";
import { GuildScheduledEventEntityType, GuildScheduledEventPrivacyLevel } from "discord.js";
import { defineTool, type AnyToolDefinition } from "../../core/types.js";
import { resolveGuild } from "../../core/resolve.js";

const ENTITY_TYPES = ["StageInstance", "Voice", "External"] as const;
const ENTITY_TYPE_MAP = {
  StageInstance: GuildScheduledEventEntityType.StageInstance,
  Voice: GuildScheduledEventEntityType.Voice,
  External: GuildScheduledEventEntityType.External,
} as const;

const createScheduledEvent = defineTool({
  name: "create_scheduled_event",
  description: "Create a scheduled event (voice/stage or external location).",
  category: "write",
  permissions: ["Manage Events"],
  intents: ["GuildScheduledEvents"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    name: z.string().min(1).max(100).describe("Event name."),
    description: z.string().max(1000).optional().describe("Event description."),
    startTime: z.string().describe("ISO-8601 start time."),
    endTime: z.string().optional().describe("ISO-8601 end time (required for External events)."),
    entityType: z.enum(ENTITY_TYPES).describe("Event type."),
    channelId: z.string().optional().describe("Voice/stage channel id (Voice/StageInstance types)."),
    location: z.string().optional().describe("Physical/online location (External type)."),
  },
  plan: (a) => `Create ${a.entityType} event "${a.name}" starting ${a.startTime}.`,
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    const type = ENTITY_TYPE_MAP[a.entityType];
    const event = await guild.scheduledEvents.create({
      name: a.name,
      description: a.description,
      scheduledStartTime: a.startTime,
      scheduledEndTime: a.endTime,
      privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
      entityType: type,
      channel: type === GuildScheduledEventEntityType.External ? undefined : a.channelId,
      entityMetadata: type === GuildScheduledEventEntityType.External ? { location: a.location ?? "" } : undefined,
    });
    return `Created scheduled event "${event.name}" (${event.id}).`;
  },
});

const editScheduledEvent = defineTool({
  name: "edit_scheduled_event",
  description: "Edit an existing scheduled event.",
  category: "write",
  permissions: ["Manage Events"],
  intents: ["GuildScheduledEvents"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    eventId: z.string().describe("Scheduled event id."),
    name: z.string().min(1).max(100).optional().describe("New name."),
    description: z.string().max(1000).optional().describe("New description."),
    startTime: z.string().optional().describe("New ISO-8601 start time."),
    endTime: z.string().optional().describe("New ISO-8601 end time."),
  },
  plan: (a) => `Edit scheduled event ${a.eventId}.`,
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    const event = await guild.scheduledEvents.fetch(a.eventId);
    await event.edit({
      name: a.name,
      description: a.description,
      scheduledStartTime: a.startTime,
      scheduledEndTime: a.endTime,
    });
    return `Edited scheduled event ${a.eventId}.`;
  },
});

const deleteScheduledEvent = defineTool({
  name: "delete_scheduled_event",
  description: "Delete a scheduled event.",
  category: "destructive",
  permissions: ["Manage Events"],
  intents: ["GuildScheduledEvents"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    eventId: z.string().describe("Scheduled event id."),
  },
  plan: (a) => `Delete scheduled event ${a.eventId}.`,
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    await guild.scheduledEvents.delete(a.eventId);
    return `Deleted scheduled event ${a.eventId}.`;
  },
});

const listScheduledEvents = defineTool({
  name: "list_scheduled_events",
  description: "List scheduled events for the server.",
  category: "read",
  permissions: ["View Channel"],
  intents: ["GuildScheduledEvents"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
  },
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    const events = await guild.scheduledEvents.fetch();
    if (events.size === 0) return `No scheduled events in ${guild.name}.`;
    return `${events.size} event(s):\n${events
      .map((e) => `- ${e.name} (${e.id}) starts ${e.scheduledStartAt?.toISOString() ?? "?"}`)
      .join("\n")}`;
  },
});

const getEventUsers = defineTool({
  name: "get_event_users",
  description: "List users subscribed (interested) in a scheduled event.",
  category: "read",
  permissions: ["View Channel"],
  intents: ["GuildScheduledEvents"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    eventId: z.string().describe("Scheduled event id."),
    limit: z.number().int().min(1).max(100).optional().describe("Max subscribers (default 100)."),
  },
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    const event = await guild.scheduledEvents.fetch(a.eventId);
    const subs = await event.fetchSubscribers({ limit: a.limit ?? 100 });
    if (subs.size === 0) return `No subscribers for event ${a.eventId}.`;
    return `${subs.size} subscriber(s):\n${subs.map((s) => `- ${s.user.tag} (${s.user.id})`).join("\n")}`;
  },
});

/** Scheduled-event tools. */
export const eventTools: AnyToolDefinition[] = [
  createScheduledEvent,
  editScheduledEvent,
  deleteScheduledEvent,
  listScheduledEvents,
  getEventUsers,
];
