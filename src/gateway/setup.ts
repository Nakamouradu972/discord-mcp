import type { Client } from "discord.js";
import { EventQueue } from "../core/eventQueue.js";
import { attachGatewayWorker, loadWorkerConfig } from "./worker.js";

/** Whether the real-time gateway worker / event queue is enabled. */
export function eventsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.DISCORD_MCP_EVENTS;
  return v !== undefined && !["", "false", "0", "no", "off"].includes(v.toLowerCase());
}

/** Path of the SQLite event-queue file. */
export function queueFile(env: NodeJS.ProcessEnv = process.env): string {
  return env.DISCORD_MCP_QUEUE_FILE || "./audit/events.sqlite";
}

/**
 * If real-time events are enabled, create the event queue and attach the
 * gateway worker to the (logged-in) client. Returns the queue so it can be
 * injected into the MCP tool context, or `undefined` when disabled.
 */
export function setupEvents(client: Client, env: NodeJS.ProcessEnv = process.env): EventQueue | undefined {
  if (!eventsEnabled(env)) return undefined;
  const queue = new EventQueue(queueFile(env));
  attachGatewayWorker(client, queue, loadWorkerConfig(env));
  process.stderr.write("[discord-mcp] gateway worker enabled (events → queue).\n");
  return queue;
}
