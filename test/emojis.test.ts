import { describe, it, expect, vi } from "vitest";
import { emojiTools } from "../src/tools/emojis/index.js";
import { getTool, makeCtx, mockClientWithGuild, mockGuild, collection } from "./helpers.js";

describe("emoji tools", () => {
  it("creates an emoji", async () => {
    const create = vi.fn(async () => ({ name: "party", id: "e1" }));
    const guild = mockGuild({ emojis: { create } });
    const ctx = makeCtx(mockClientWithGuild(guild));
    const result = await getTool(emojiTools, "create_emoji").execute(
      { name: "party", imageUrl: "https://x/y.png" },
      ctx,
    );
    expect(create).toHaveBeenCalledWith({ attachment: "https://x/y.png", name: "party", reason: undefined });
    expect(result).toContain("party");
  });

  it("lists emojis", async () => {
    const emojis = collection([["e1", { name: "party", id: "e1" }]]);
    const guild = mockGuild({ emojis: { fetch: vi.fn(async () => emojis) } });
    const ctx = makeCtx(mockClientWithGuild(guild));
    expect(await getTool(emojiTools, "list_emojis").execute({}, ctx)).toContain("party");
  });

  it("deletes an emoji", async () => {
    const del = vi.fn(async () => ({}));
    const guild = mockGuild({ emojis: { fetch: vi.fn(async () => ({ delete: del })) } });
    const ctx = makeCtx(mockClientWithGuild(guild));
    await getTool(emojiTools, "delete_emoji").execute({ emojiId: "e1" }, ctx);
    expect(del).toHaveBeenCalled();
  });
});
