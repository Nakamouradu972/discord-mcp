import { describe, it, expect, vi } from "vitest";
import { memberTools } from "../src/tools/members/index.js";
import { getTool, makeCtx, mockClientWithGuild, mockGuild, collection } from "./helpers.js";

describe("member tools", () => {
  it("lists members", async () => {
    const members = collection([["1", { user: { tag: "a#1" }, id: "1" }]]);
    const guild = mockGuild({ members: { list: vi.fn(async () => members) } });
    const ctx = makeCtx(mockClientWithGuild(guild));
    const result = await getTool(memberTools, "list_members").execute({}, ctx);
    expect(result).toContain("a#1");
  });

  it("edits a member mapping fields to discord.js options", async () => {
    const edit = vi.fn(async () => ({}));
    const member = { user: { tag: "a#1" }, edit };
    const guild = mockGuild({ members: { fetch: vi.fn(async () => member) } });
    const ctx = makeCtx(mockClientWithGuild(guild));

    await getTool(memberTools, "edit_member").execute(
      { userId: "1", nickname: "Bob", mute: true, voiceChannelId: "v1" },
      ctx,
    );
    const arg = edit.mock.calls[0][0];
    expect(arg.nick).toBe("Bob");
    expect(arg.mute).toBe(true);
    expect(arg.channel).toBe("v1");
  });

  it("converts timeoutMinutes into communicationDisabledUntil", async () => {
    const edit = vi.fn(async () => ({}));
    const member = { user: { tag: "a#1" }, edit };
    const guild = mockGuild({ members: { fetch: vi.fn(async () => member) } });
    const ctx = makeCtx(mockClientWithGuild(guild));

    await getTool(memberTools, "edit_member").execute({ userId: "1", timeoutMinutes: 0 }, ctx);
    expect(edit.mock.calls[0][0].communicationDisabledUntil).toBeNull();
  });

  it("sends a direct message via the user's DM channel", async () => {
    const send = vi.fn(async () => ({ id: "dm1" }));
    const createDM = vi.fn(async () => ({ send }));
    const user = { tag: "a#1", createDM };
    const ctx = makeCtx({ users: { fetch: vi.fn(async () => user) } } as any);
    const result = await getTool(memberTools, "send_dm").execute({ userId: "1", message: "hi" }, ctx);
    expect(send).toHaveBeenCalledWith("hi");
    expect(result).toContain("dm1");
  });

  it("prunes members (destructive) and reports the count", async () => {
    const prune = vi.fn(async () => 7);
    const guild = mockGuild({ members: { prune } });
    const ctx = makeCtx(mockClientWithGuild(guild));
    const result = await getTool(memberTools, "prune_members").execute({ days: 30 }, ctx);
    expect(prune).toHaveBeenCalledWith({ days: 30, reason: undefined });
    expect(result).toContain("7 member(s)");
    expect(getTool(memberTools, "prune_members").category).toBe("destructive");
  });

  it("estimates prune count with a dry run", async () => {
    const prune = vi.fn(async () => 4);
    const guild = mockGuild({ members: { prune } });
    const ctx = makeCtx(mockClientWithGuild(guild));
    const result = await getTool(memberTools, "get_prune_count").execute({ days: 14 }, ctx);
    expect(prune).toHaveBeenCalledWith({ days: 14, dry: true });
    expect(result).toContain("4 member(s)");
    expect(getTool(memberTools, "get_prune_count").category).toBe("read");
  });
});
