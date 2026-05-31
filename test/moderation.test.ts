import { describe, it, expect, vi } from "vitest";
import { moderationTools } from "../src/tools/moderation/index.js";
import { getTool, makeCtx, mockClientWithGuild, mockGuild } from "./helpers.js";

describe("moderation tools", () => {
  it("bans a user with message deletion and reason", async () => {
    const ban = vi.fn(async () => ({}));
    const guild = mockGuild({ members: { ban } });
    const ctx = makeCtx(mockClientWithGuild(guild));

    const tool = getTool(moderationTools, "ban");
    const result = await tool.execute(
      { userId: "42", deleteMessageSeconds: 3600, reason: "spam" },
      ctx,
    );

    expect(ban).toHaveBeenCalledWith("42", { deleteMessageSeconds: 3600, reason: "spam" });
    expect(result).toContain("Banned user 42");
    expect(result).toContain("spam");
  });

  it("ban is classified as destructive", () => {
    expect(getTool(moderationTools, "ban").category).toBe("destructive");
  });

  it("unbans a user", async () => {
    const remove = vi.fn(async () => ({}));
    const guild = mockGuild({ bans: { remove } });
    const ctx = makeCtx(mockClientWithGuild(guild));

    const result = await getTool(moderationTools, "unban").execute({ userId: "7", reason: "appeal" }, ctx);
    expect(remove).toHaveBeenCalledWith("7", "appeal");
    expect(result).toContain("Unbanned user 7");
  });

  it("times out a member converting minutes to milliseconds", async () => {
    const timeout = vi.fn(async () => ({}));
    const member = { user: { tag: "user#1" }, timeout };
    const guild = mockGuild({ members: { fetch: vi.fn(async () => member) } });
    const ctx = makeCtx(mockClientWithGuild(guild));

    await getTool(moderationTools, "timeout").execute({ userId: "9", durationMinutes: 5 }, ctx);
    expect(timeout).toHaveBeenCalledWith(5 * 60 * 1000, undefined);
  });

  it("remove_timeout clears the timeout (null)", async () => {
    const timeout = vi.fn(async () => ({}));
    const member = { user: { tag: "user#1" }, timeout };
    const guild = mockGuild({ members: { fetch: vi.fn(async () => member) } });
    const ctx = makeCtx(mockClientWithGuild(guild));

    await getTool(moderationTools, "remove_timeout").execute({ userId: "9" }, ctx);
    expect(timeout).toHaveBeenCalledWith(null, undefined);
  });

  it("lists bans", async () => {
    const bans = new Map([
      ["1", { user: { tag: "a#1", id: "1" }, reason: "x" }],
      ["2", { user: { tag: "b#2", id: "2" }, reason: null }],
    ]);
    // emulate discord.js Collection.map
    (bans as any).map = (fn: (v: any) => string) => Array.from(bans.values()).map(fn);
    const guild = mockGuild({ bans: { fetch: vi.fn(async () => bans) } });
    const ctx = makeCtx(mockClientWithGuild(guild));

    const result = await getTool(moderationTools, "list_bans").execute({}, ctx);
    expect(result).toContain("2 ban(s)");
    expect(result).toContain("a#1");
  });

  it("reports timeout status when active", async () => {
    const future = new Date(Date.now() + 60_000);
    const member = { user: { tag: "user#1" }, communicationDisabledUntil: future };
    const guild = mockGuild({ members: { fetch: vi.fn(async () => member) } });
    const ctx = makeCtx(mockClientWithGuild(guild));

    const result = await getTool(moderationTools, "get_timeout_status").execute({ userId: "9" }, ctx);
    expect(result).toContain("timed out until");
  });
});
