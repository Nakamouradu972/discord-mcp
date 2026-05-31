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
});
