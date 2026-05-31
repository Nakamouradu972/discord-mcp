import { Events, type Client, type Interaction, type Message } from "discord.js";
import type { EventQueue } from "../core/eventQueue.js";

/** Configuration for what the gateway worker enqueues. */
export interface WorkerConfig {
  /** Enqueue slash-command / button interactions (default true). */
  interactions: boolean;
  /** Enqueue messages that mention the bot (default true). */
  mentions: boolean;
  /** Only enqueue mentions from these channel ids (empty = any channel). */
  allowedChannels: string[];
}

/** Discord's follow-up window after acknowledging an interaction (~15 min). */
const INTERACTION_TTL_MS = 15 * 60 * 1000;

/** Build a {@link WorkerConfig} from an environment map. */
export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const parseBool = (v: string | undefined, d: boolean) =>
    v === undefined || v === "" ? d : !["false", "0", "no", "off"].includes(v.toLowerCase());
  return {
    interactions: parseBool(env.DISCORD_MCP_EVENTS_INTERACTIONS, true),
    mentions: parseBool(env.DISCORD_MCP_EVENTS_MENTIONS, true),
    allowedChannels: (env.DISCORD_MCP_EVENTS_CHANNELS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  };
}

/**
 * Attach gateway listeners that **acknowledge** interactions within Discord's
 * 3-second deadline and **enqueue** filtered events for the autonomous runner
 * to process later. The worker performs no business logic — it only defers and
 * records, which is what decouples real-time reception from LLM decisions.
 *
 * Returns a detach function that removes the listeners.
 */
export function attachGatewayWorker(client: Client, queue: EventQueue, config: WorkerConfig): () => void {
  const onInteraction = async (interaction: Interaction): Promise<void> => {
    if (!config.interactions) return;
    // Only repliable interactions (commands, buttons, selects) carry a token we can answer.
    if (!interaction.isCommand() && !interaction.isMessageComponent()) return;
    try {
      // Acknowledge immediately so the 3s deadline is met without any LLM.
      if (interaction.isMessageComponent()) await interaction.deferUpdate();
      else await interaction.deferReply();
    } catch (err) {
      process.stderr.write(`[worker] failed to defer interaction: ${String(err)}\n`);
      return;
    }
    queue.enqueue({
      kind: "interaction",
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId: interaction.user.id,
      interactionToken: interaction.token,
      interactionExpiresAt: new Date(Date.now() + INTERACTION_TTL_MS).toISOString(),
      payload: describeInteraction(interaction),
    });
  };

  const onMessage = (message: Message): void => {
    if (!config.mentions) return;
    if (message.author.bot) return;
    if (!client.user || !message.mentions.has(client.user)) return;
    if (config.allowedChannels.length > 0 && !config.allowedChannels.includes(message.channelId)) return;
    queue.enqueue({
      kind: "message",
      guildId: message.guildId,
      channelId: message.channelId,
      userId: message.author.id,
      payload: { messageId: message.id, content: message.content, authorTag: message.author.tag },
    });
  };

  client.on(Events.InteractionCreate, onInteraction);
  client.on(Events.MessageCreate, onMessage);

  return () => {
    client.off(Events.InteractionCreate, onInteraction);
    client.off(Events.MessageCreate, onMessage);
  };
}

/** Summarise an interaction into a JSON-serialisable payload for the queue. */
function describeInteraction(interaction: Interaction): Record<string, unknown> {
  if (interaction.isChatInputCommand()) {
    return {
      type: "command",
      command: interaction.commandName,
      options: interaction.options.data.map((o) => ({ name: o.name, value: o.value })),
    };
  }
  if (interaction.isMessageComponent()) {
    return { type: "component", customId: interaction.customId, componentType: interaction.componentType };
  }
  return { type: "unknown" };
}
