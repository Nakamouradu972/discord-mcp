import { describe, it, expect, vi } from "vitest";
import { messageTools } from "../src/tools/messages/index.js";
import { getTool, makeCtx, mockClientWithChannel, collection } from "./helpers.js";

function textChannel(overrides: Record<string, unknown>) {
  return { isTextBased: () => true, isDMBased: () => false, ...overrides };
}

describe("message tools", () => {
  it("fetches channel messages", async () => {
    const messages = collection([["1", { id: "1", author: { tag: "a#1" }, content: "hello" }]]);
    const channel = textChannel({ messages: { fetch: vi.fn(async () => messages) } });
    const ctx = makeCtx(mockClientWithChannel(channel));
    const result = await getTool(messageTools, "get_channel_messages").execute({ channelId: "c1" }, ctx);
    expect(result).toContain("hello");
  });

  it("filters messages by query", async () => {
    const messages = collection([
      ["1", { id: "1", author: { tag: "a#1" }, content: "hello world" }],
      ["2", { id: "2", author: { tag: "b#2" }, content: "goodbye" }],
    ]);
    const channel = textChannel({ messages: { fetch: vi.fn(async () => messages) } });
    const ctx = makeCtx(mockClientWithChannel(channel));
    const result = await getTool(messageTools, "search_messages").execute({ channelId: "c1", query: "WORLD" }, ctx);
    expect(result).toContain("hello world");
    expect(result).not.toContain("goodbye");
  });

  it("bulk deletes messages", async () => {
    const bulkDelete = vi.fn(async () => collection([["1", {}], ["2", {}]]));
    const channel = textChannel({ bulkDelete });
    const ctx = makeCtx(mockClientWithChannel(channel));
    const result = await getTool(messageTools, "bulk_delete_messages").execute({ channelId: "c1", count: 2 }, ctx);
    expect(bulkDelete).toHaveBeenCalledWith(2, true);
    expect(result).toContain("2 message(s)");
  });

  it("classifies destructive vs read", () => {
    expect(getTool(messageTools, "bulk_delete_messages").category).toBe("destructive");
    expect(getTool(messageTools, "delete_message").category).toBe("destructive");
    expect(getTool(messageTools, "get_message").category).toBe("read");
  });
});
