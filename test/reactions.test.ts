import { describe, it, expect, vi } from "vitest";
import { reactionTools } from "../src/tools/reactions/index.js";
import { getTool, makeCtx, mockClientWithChannel } from "./helpers.js";

function textChannel(message: unknown) {
  return {
    isTextBased: () => true,
    isDMBased: () => false,
    messages: { fetch: vi.fn(async () => message) },
  };
}

describe("reaction tools", () => {
  it("adds a reaction", async () => {
    const react = vi.fn(async () => ({}));
    const ctx = makeCtx(mockClientWithChannel(textChannel({ react })));
    await getTool(reactionTools, "add_reaction").execute({ channelId: "c1", messageId: "m1", emoji: "👍" }, ctx);
    expect(react).toHaveBeenCalledWith("👍");
  });

  it("adds multiple reactions in order", async () => {
    const react = vi.fn(async () => ({}));
    const ctx = makeCtx(mockClientWithChannel(textChannel({ react })));
    await getTool(reactionTools, "add_multiple_reactions").execute(
      { channelId: "c1", messageId: "m1", emojis: ["👍", "🎉"] },
      ctx,
    );
    expect(react).toHaveBeenNthCalledWith(1, "👍");
    expect(react).toHaveBeenNthCalledWith(2, "🎉");
  });

  it("clears all reactions", async () => {
    const removeAll = vi.fn(async () => ({}));
    const message = { reactions: { removeAll } };
    const ctx = makeCtx(mockClientWithChannel(textChannel(message)));
    await getTool(reactionTools, "clear_reactions").execute({ channelId: "c1", messageId: "m1" }, ctx);
    expect(removeAll).toHaveBeenCalled();
  });

  it("gets reaction users", async () => {
    const users = new Map([["u1", { tag: "a#1", id: "u1" }]]);
    (users as any).map = (fn: any) => Array.from(users.values()).map(fn);
    const reaction = { users: { fetch: vi.fn(async () => users) } };
    const message = { reactions: { resolve: () => reaction } };
    const ctx = makeCtx(mockClientWithChannel(textChannel(message)));
    const result = await getTool(reactionTools, "get_reaction_users").execute(
      { channelId: "c1", messageId: "m1", emoji: "👍" },
      ctx,
    );
    expect(result).toContain("a#1");
  });

  it("clear_reactions is destructive", () => {
    expect(getTool(reactionTools, "clear_reactions").category).toBe("destructive");
  });
});
