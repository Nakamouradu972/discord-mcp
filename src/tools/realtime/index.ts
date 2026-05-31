import { z } from "zod";
import { defineTool, type AnyToolDefinition, type ToolContext } from "../../core/types.js";
import { buildMessagePayload, embedSchema, buttonSchema } from "../../core/messagePayload.js";
import type { EventKind, EventQueue } from "../../core/eventQueue.js";

const EVENT_KINDS = ["interaction", "message", "member_join", "reaction"] as const;

function requireQueue(ctx: ToolContext): EventQueue {
  if (!ctx.queue) {
    throw new Error(
      "The event queue is not enabled. Start the server with the gateway worker (DISCORD_MCP_EVENTS=true) to use real-time tools.",
    );
  }
  return ctx.queue;
}

const pollEvents = defineTool({
  name: "poll_events",
  description:
    "Claim pending real-time events (interactions, mentions, …) from the queue. Each returned interaction includes an eventId to answer with respond_interaction.",
  category: "read",
  permissions: [],
  intents: ["Guilds"],
  inputSchema: {
    kinds: z.array(z.enum(EVENT_KINDS)).optional().describe("Restrict to these event kinds."),
    limit: z.number().int().min(1).max(50).optional().describe("Max events to claim (default 10)."),
    claimTtlSeconds: z
      .number()
      .int()
      .min(10)
      .max(900)
      .optional()
      .describe("Reserved: visibility window before a claimed event can be redelivered."),
  },
  execute: (a, ctx) => {
    const queue = requireQueue(ctx);
    const events = queue.claim({ limit: a.limit, kinds: a.kinds as EventKind[] | undefined, claimedBy: ctx.config.actor });
    if (events.length === 0) return "No pending events.";
    const lines = events.map((e) => {
      const base = `- [${e.kind}] eventId=${e.id} user=${e.userId ?? "?"} channel=${e.channelId ?? "?"}`;
      const detail = JSON.stringify(e.payload);
      const expiry = e.interactionExpiresAt ? ` (reply before ${e.interactionExpiresAt})` : "";
      return `${base}${expiry}\n    payload: ${detail}`;
    });
    return `${events.length} event(s) claimed:\n${lines.join("\n")}`;
  },
});

const respondInteraction = defineTool({
  name: "respond_interaction",
  description:
    "Reply to a deferred interaction (slash command or button) claimed via poll_events, using its eventId. Supports text, embeds and buttons.",
  category: "write",
  permissions: [],
  intents: ["Guilds"],
  inputSchema: {
    eventId: z.string().describe("The eventId returned by poll_events for an interaction event."),
    content: z.string().max(2000).optional().describe("Reply text."),
    embeds: z.array(embedSchema).max(10).optional().describe("Rich embeds."),
    buttons: z.array(buttonSchema).max(25).optional().describe("Buttons (link buttons work standalone)."),
    ephemeral: z.boolean().optional().describe("Show the reply only to the invoking user."),
  },
  plan: (a) => `Respond to interaction ${a.eventId}${a.content ? `: "${a.content}"` : " (embed/components)"}.`,
  execute: async (a, ctx) => {
    const queue = requireQueue(ctx);
    const event = queue.get(a.eventId);
    if (!event) throw new Error(`No event found with id ${a.eventId}.`);
    if (event.kind !== "interaction" || !event.interactionToken) {
      throw new Error(`Event ${a.eventId} is not a respondable interaction.`);
    }
    if (event.status === "expired") throw new Error(`Interaction ${a.eventId} has expired and can no longer be answered.`);

    const payload = buildMessagePayload({ content: a.content, embeds: a.embeds, buttons: a.buttons });
    const appId = ctx.client.application?.id;
    if (!appId) throw new Error("Application id unavailable (the bot must be logged in).");

    // Edit the deferred reply via the interaction webhook (token-based, no gateway needed).
    const body: Record<string, unknown> = {
      content: payload.content,
      embeds: payload.embeds,
      components: payload.components,
    };
    if (a.ephemeral) body.flags = 64; // EPHEMERAL
    await ctx.client.rest.patch(
      `/webhooks/${appId}/${event.interactionToken}/messages/@original` as `/${string}`,
      { body, auth: false },
    );
    queue.complete(a.eventId);
    return `Responded to interaction ${a.eventId}.`;
  },
});

const completeEvent = defineTool({
  name: "complete_event",
  description: "Mark a non-interaction event (message, member_join, reaction) as handled.",
  category: "write",
  permissions: [],
  intents: ["Guilds"],
  inputSchema: {
    eventId: z.string().describe("The eventId returned by poll_events."),
  },
  plan: (a) => `Mark event ${a.eventId} as handled.`,
  execute: (a, ctx) => {
    const queue = requireQueue(ctx);
    if (!queue.complete(a.eventId)) throw new Error(`No event found with id ${a.eventId}.`);
    return `Marked event ${a.eventId} as handled.`;
  },
});

/** Real-time event tools (require the gateway worker / event queue). */
export const realtimeTools: AnyToolDefinition[] = [pollEvents, respondInteraction, completeEvent];
