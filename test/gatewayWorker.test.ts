import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { Events } from "discord.js";
import { EventQueue } from "../src/core/eventQueue.js";
import { attachGatewayWorker, loadWorkerConfig, type WorkerConfig } from "../src/gateway/worker.js";

let queue: EventQueue;

beforeEach(() => {
  queue = new EventQueue(":memory:");
});
afterEach(() => {
  queue.close();
});

/** Minimal client stub: an EventEmitter plus the bits the worker reads. */
function fakeClient() {
  const client = new EventEmitter() as any;
  client.user = { id: "bot1" };
  return client;
}

const fullConfig: WorkerConfig = { interactions: true, mentions: true, allowedChannels: [] };

describe("gateway worker", () => {
  it("defers a chat command and enqueues an interaction event", async () => {
    const client = fakeClient();
    attachGatewayWorker(client, queue, fullConfig);

    const deferReply = vi.fn(async () => {});
    const interaction = {
      isCommand: () => true,
      isMessageComponent: () => false,
      isChatInputCommand: () => true,
      deferReply,
      token: "tok",
      guildId: "g1",
      channelId: "c1",
      user: { id: "u1" },
      commandName: "ask",
      options: { data: [{ name: "q", value: "hi" }] },
    };
    client.emit(Events.InteractionCreate, interaction);
    await new Promise((r) => setImmediate(r));

    expect(deferReply).toHaveBeenCalledOnce();
    const claimed = queue.claim({ kinds: ["interaction"] });
    expect(claimed).toHaveLength(1);
    expect(claimed[0].interactionToken).toBe("tok");
    expect(claimed[0].payload).toMatchObject({ type: "command", command: "ask" });
  });

  it("defers a component (button) with deferUpdate", async () => {
    const client = fakeClient();
    attachGatewayWorker(client, queue, fullConfig);
    const deferUpdate = vi.fn(async () => {});
    client.emit(Events.InteractionCreate, {
      isCommand: () => false,
      isMessageComponent: () => true,
      isChatInputCommand: () => false,
      deferUpdate,
      token: "tok2",
      guildId: "g1",
      channelId: "c1",
      user: { id: "u1" },
      customId: "approve",
      componentType: 2,
    });
    await new Promise((r) => setImmediate(r));
    expect(deferUpdate).toHaveBeenCalledOnce();
    expect(queue.countByStatus("pending")).toBe(1);
  });

  it("enqueues a message only when the bot is mentioned", () => {
    const client = fakeClient();
    attachGatewayWorker(client, queue, fullConfig);

    const notMentioned = {
      author: { bot: false, id: "u1", tag: "u#1" },
      mentions: { has: () => false },
      channelId: "c1",
      guildId: "g1",
      id: "m1",
      content: "hello",
    };
    client.emit(Events.MessageCreate, notMentioned);
    expect(queue.countByStatus("pending")).toBe(0);

    client.emit(Events.MessageCreate, { ...notMentioned, mentions: { has: () => true } });
    expect(queue.countByStatus("pending")).toBe(1);
  });

  it("ignores bot authors and respects the channel allow-list", () => {
    const client = fakeClient();
    attachGatewayWorker(client, queue, { interactions: true, mentions: true, allowedChannels: ["c1"] });

    client.emit(Events.MessageCreate, {
      author: { bot: true, id: "x", tag: "x#1" },
      mentions: { has: () => true },
      channelId: "c1",
      id: "m1",
      content: "hi",
    });
    expect(queue.countByStatus("pending")).toBe(0);

    client.emit(Events.MessageCreate, {
      author: { bot: false, id: "u1", tag: "u#1" },
      mentions: { has: () => true },
      channelId: "c2", // not allow-listed
      id: "m2",
      content: "hi",
    });
    expect(queue.countByStatus("pending")).toBe(0);
  });

  it("detach removes the listeners", () => {
    const client = fakeClient();
    const detach = attachGatewayWorker(client, queue, fullConfig);
    detach();
    expect(client.listenerCount(Events.InteractionCreate)).toBe(0);
    expect(client.listenerCount(Events.MessageCreate)).toBe(0);
  });
});

describe("loadWorkerConfig", () => {
  it("defaults to interactions + mentions on", () => {
    const c = loadWorkerConfig({} as NodeJS.ProcessEnv);
    expect(c.interactions).toBe(true);
    expect(c.mentions).toBe(true);
    expect(c.allowedChannels).toEqual([]);
  });

  it("parses overrides", () => {
    const c = loadWorkerConfig({
      DISCORD_MCP_EVENTS_MENTIONS: "false",
      DISCORD_MCP_EVENTS_CHANNELS: "a, b",
    } as NodeJS.ProcessEnv);
    expect(c.mentions).toBe(false);
    expect(c.allowedChannels).toEqual(["a", "b"]);
  });
});
