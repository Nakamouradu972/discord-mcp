import { describe, it, expect, vi } from "vitest";
import { ForumChannel, ThreadChannel } from "discord.js";
import { forumTools } from "../src/tools/forum/index.js";
import { getTool, makeCtx, mockClientWithGuild, mockClientWithChannel, mockGuild } from "./helpers.js";

function forum(overrides: Record<string, unknown>): ForumChannel {
  return Object.assign(Object.create(ForumChannel.prototype), overrides);
}
function forumThread(overrides: Record<string, unknown>): ThreadChannel {
  return Object.assign(Object.create(ThreadChannel.prototype), overrides);
}

describe("forum tools", () => {
  it("creates a forum post", async () => {
    const create = vi.fn(async () => ({ name: "Help", id: "t1" }));
    const forumChannel = forum({ threads: { create } });
    const guild = mockGuild({ channels: { fetch: vi.fn(async () => forumChannel) } });
    const ctx = makeCtx(mockClientWithGuild(guild));
    await getTool(forumTools, "create_forum_post").execute(
      { channelId: "f1", name: "Help", content: "please" },
      ctx,
    );
    expect(create.mock.calls[0][0]).toMatchObject({ name: "Help", message: { content: "please" } });
  });

  it("rejects a non-forum channel", async () => {
    const guild = mockGuild({ channels: { fetch: vi.fn(async () => ({ notForum: true })) } });
    const ctx = makeCtx(mockClientWithGuild(guild));
    await expect(
      getTool(forumTools, "create_forum_post").execute({ channelId: "f1", name: "x", content: "y" }, ctx),
    ).rejects.toThrow(/not a forum/);
  });

  it("replies to a forum post", async () => {
    const send = vi.fn(async () => ({ id: "m1" }));
    const ctx = makeCtx(mockClientWithChannel(forumThread({ send })));
    await getTool(forumTools, "reply_to_forum").execute({ threadId: "t1", content: "hi" }, ctx);
    expect(send).toHaveBeenCalledWith("hi");
  });

  it("delete_forum_post is destructive", () => {
    expect(getTool(forumTools, "delete_forum_post").category).toBe("destructive");
  });
});
