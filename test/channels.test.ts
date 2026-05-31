import { describe, it, expect, vi } from "vitest";
import { ChannelType } from "discord.js";
import { channelTools } from "../src/tools/channels/index.js";
import { getTool, makeCtx, mockClientWithGuild, mockGuild, collection } from "./helpers.js";

describe("channel tools", () => {
  it("creates a text channel with the right type", async () => {
    const create = vi.fn(async () => ({ name: "general", id: "c1" }));
    const guild = mockGuild({ channels: { create } });
    const ctx = makeCtx(mockClientWithGuild(guild));
    await getTool(channelTools, "create_text_channel").execute({ name: "general" }, ctx);
    expect(create.mock.calls[0][0].type).toBe(ChannelType.GuildText);
  });

  it("deletes a channel", async () => {
    const del = vi.fn(async () => ({}));
    const channel = { delete: del };
    const guild = mockGuild({ channels: { fetch: vi.fn(async () => channel) } });
    const ctx = makeCtx(mockClientWithGuild(guild));
    await getTool(channelTools, "delete_channel").execute({ channelId: "c1" }, ctx);
    expect(del).toHaveBeenCalled();
  });

  it("builds allow/deny overwrite options", async () => {
    const edit = vi.fn(async () => ({}));
    const channel = { permissionOverwrites: { edit } };
    const guild = mockGuild({ channels: { fetch: vi.fn(async () => channel) } });
    const ctx = makeCtx(mockClientWithGuild(guild));
    await getTool(channelTools, "set_channel_permissions").execute(
      { channelId: "c1", targetId: "role1", allow: ["ViewChannel"], deny: ["SendMessages"] },
      ctx,
    );
    expect(edit).toHaveBeenCalledWith("role1", { ViewChannel: true, SendMessages: false }, { reason: undefined });
  });

  it("delete_channel is destructive, create is write", () => {
    expect(getTool(channelTools, "delete_channel").category).toBe("destructive");
    expect(getTool(channelTools, "create_text_channel").category).toBe("write");
  });

  it("lists channels sorted by position", async () => {
    const channels = collection([
      ["2", { name: "second", id: "2", type: ChannelType.GuildText, rawPosition: 2 }],
      ["1", { name: "first", id: "1", type: ChannelType.GuildText, rawPosition: 1 }],
    ]);
    const guild = mockGuild({ name: "G", channels: { fetch: vi.fn(async () => channels) } });
    const ctx = makeCtx(mockClientWithGuild(guild));
    const result = await getTool(channelTools, "list_channels").execute({}, ctx);
    expect(result.indexOf("first")).toBeLessThan(result.indexOf("second"));
  });

  it("gets channel info, tolerating missing fields", async () => {
    const channel = { name: "general", id: "c1", type: ChannelType.GuildText, parentId: "cat1", rawPosition: 3, topic: "hi", rateLimitPerUser: 5 };
    const guild = mockGuild({ channels: { fetch: vi.fn(async () => channel) } });
    const ctx = makeCtx(mockClientWithGuild(guild));
    const result = await getTool(channelTools, "get_channel_info").execute({ channelId: "c1" }, ctx);
    expect(result).toContain("general");
    expect(result).toContain("Slowmode: 5s");
    expect(result).toContain("Topic: hi");
  });
});
