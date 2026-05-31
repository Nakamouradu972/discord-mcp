import { describe, it, expect, vi } from "vitest";
import { inviteTools } from "../src/tools/invites/index.js";
import { getTool, makeCtx, mockClientWithGuild, mockGuild, collection } from "./helpers.js";

describe("invite tools", () => {
  it("creates an invite", async () => {
    const createInvite = vi.fn(async () => ({ code: "abc123" }));
    const channel = { createInvite };
    const guild = mockGuild({ channels: { fetch: vi.fn(async () => channel) } });
    const ctx = makeCtx(mockClientWithGuild(guild));

    const result = await getTool(inviteTools, "create_invite").execute({ channelId: "c1", maxUses: 5 }, ctx);
    expect(createInvite).toHaveBeenCalled();
    expect(result).toContain("abc123");
  });

  it("lists invites", async () => {
    const invites = collection([["abc", { code: "abc", channelId: "c1", uses: 2, maxUses: 10 }]]);
    const guild = mockGuild({ invites: { fetch: vi.fn(async () => invites) } });
    const ctx = makeCtx(mockClientWithGuild(guild));
    const result = await getTool(inviteTools, "list_invites").execute({}, ctx);
    expect(result).toContain("abc");
  });

  it("deletes an invite by code", async () => {
    const del = vi.fn(async () => ({}));
    const invites = collection([["abc", { code: "abc", delete: del }]]);
    const guild = mockGuild({ invites: { fetch: vi.fn(async () => invites) } });
    const ctx = makeCtx(mockClientWithGuild(guild));

    await getTool(inviteTools, "delete_invite").execute({ code: "abc" }, ctx);
    expect(del).toHaveBeenCalled();
  });

  it("delete_invite is destructive", () => {
    expect(getTool(inviteTools, "delete_invite").category).toBe("destructive");
  });
});
