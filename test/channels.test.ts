import { describe, it, expect, vi } from "vitest";
import { ChannelType } from "discord.js";
import { channelTools } from "../src/tools/channels/index.js";
import { getTool, makeCtx, mockClientWithGuild, mockGuild } from "./helpers.js";

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
});
