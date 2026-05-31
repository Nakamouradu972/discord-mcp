import { Client, GatewayIntentBits, Partials } from "discord.js";

/**
 * Intents requested by the server. Privileged intents (GuildMembers,
 * MessageContent) must also be enabled in the Discord Developer Portal.
 */
export const REQUIRED_INTENTS = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildVoiceStates,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.GuildMessageReactions,
  GatewayIntentBits.MessageContent,
  GatewayIntentBits.GuildScheduledEvents,
  GatewayIntentBits.GuildModeration,
] as const;

let client: Client | null = null;

/** Create the shared discord.js client (without logging in). */
export function createClient(): Client {
  return new Client({
    intents: [...REQUIRED_INTENTS],
    partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.GuildScheduledEvent],
  });
}

/**
 * Log the shared client in once and cache it. Subsequent calls return the
 * already-connected client. Resolves only after the gateway is ready.
 */
export async function loginClient(token: string): Promise<Client> {
  if (client?.isReady()) return client;
  if (!token) throw new Error("DISCORD_TOKEN is not set; cannot log in to Discord.");

  const c = client ?? createClient();
  client = c;
  await new Promise<void>((resolve, reject) => {
    c.once("clientReady", () => resolve());
    c.once("error", reject);
    c.login(token).catch(reject);
  });
  return c;
}

/** Return the shared client, or `null` when login has not happened yet. */
export function getClient(): Client | null {
  return client;
}

/** Reset the cached client. Intended for tests. */
export function resetClient(): void {
  client = null;
}
