import { describe, it, expect, vi } from "vitest";
import { StageChannel } from "discord.js";
import { voiceTools } from "../src/tools/voice/index.js";
import { getTool, makeCtx, mockClientWithGuild, mockGuild } from "./helpers.js";

function stage(overrides: Record<string, unknown>): StageChannel {
  const obj = Object.create(StageChannel.prototype);
  // stageInstance is a prototype getter, so define own properties explicitly.
  for (const [key, value] of Object.entries({ name: "Stage", ...overrides })) {
    Object.defineProperty(obj, key, { value, writable: true, configurable: true, enumerable: true });
  }
  return obj;
}

describe("voice & stage tools", () => {
  it("starts a stage instance with a topic", async () => {
    const createStageInstance = vi.fn(async () => ({ topic: "AMA" }));
    const channel = stage({ createStageInstance });
    const guild = mockGuild({ channels: { fetch: vi.fn(async () => channel) } });
    const ctx = makeCtx(mockClientWithGuild(guild));
    const result = await getTool(voiceTools, "start_stage_instance").execute(
      { channelId: "s1", topic: "AMA" },
      ctx,
    );
    expect(createStageInstance.mock.calls[0][0].topic).toBe("AMA");
    expect(result).toContain("AMA");
  });

  it("rejects starting a stage on a non-stage channel", async () => {
    const guild = mockGuild({ channels: { fetch: vi.fn(async () => ({ notStage: true })) } });
    const ctx = makeCtx(mockClientWithGuild(guild));
    await expect(
      getTool(voiceTools, "start_stage_instance").execute({ channelId: "s1", topic: "x" }, ctx),
    ).rejects.toThrow(/not a stage channel/);
  });

  it("stops a stage instance (destructive)", async () => {
    const del = vi.fn(async () => ({}));
    const channel = stage({ stageInstance: { delete: del } });
    const guild = mockGuild({ channels: { fetch: vi.fn(async () => channel) } });
    const ctx = makeCtx(mockClientWithGuild(guild));
    await getTool(voiceTools, "stop_stage_instance").execute({ channelId: "s1" }, ctx);
    expect(del).toHaveBeenCalled();
    expect(getTool(voiceTools, "stop_stage_instance").category).toBe("destructive");
  });

  it("disconnects a member from voice", async () => {
    const disconnect = vi.fn(async () => ({}));
    const member = { user: { tag: "a#1" }, voice: { channelId: "v1", disconnect } };
    const guild = mockGuild({ members: { fetch: vi.fn(async () => member) } });
    const ctx = makeCtx(mockClientWithGuild(guild));
    await getTool(voiceTools, "disconnect_member").execute({ userId: "1" }, ctx);
    expect(disconnect).toHaveBeenCalled();
  });

  it("errors disconnecting a member not in voice", async () => {
    const member = { user: { tag: "a#1" }, voice: { channelId: null } };
    const guild = mockGuild({ members: { fetch: vi.fn(async () => member) } });
    const ctx = makeCtx(mockClientWithGuild(guild));
    await expect(getTool(voiceTools, "disconnect_member").execute({ userId: "1" }, ctx)).rejects.toThrow(
      /not connected/,
    );
  });
});
