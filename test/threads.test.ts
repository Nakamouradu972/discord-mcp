import { describe, it, expect, vi } from "vitest";
import { ThreadChannel } from "discord.js";
import { threadTools } from "../src/tools/threads/index.js";
import { getTool, makeCtx, mockClientWithChannel } from "./helpers.js";

/** Build an object that passes `instanceof ThreadChannel`. */
function thread(overrides: Record<string, unknown>): ThreadChannel {
  return Object.assign(Object.create(ThreadChannel.prototype), overrides);
}

describe("thread tools", () => {
  it("creates a thread on a thread-capable channel", async () => {
    const create = vi.fn(async () => ({ name: "discussion", id: "t1" }));
    const channel = { threads: { create } };
    const ctx = makeCtx(mockClientWithChannel(channel));
    await getTool(threadTools, "create_thread").execute({ channelId: "c1", name: "discussion" }, ctx);
    expect(create.mock.calls[0][0].name).toBe("discussion");
    expect(create.mock.calls[0][0].autoArchiveDuration).toBe(1440);
  });

  it("edits a thread", async () => {
    const edit = vi.fn(async () => ({}));
    const ctx = makeCtx(mockClientWithChannel(thread({ edit })));
    await getTool(threadTools, "edit_thread").execute({ threadId: "t1", archived: true }, ctx);
    expect(edit.mock.calls[0][0].archived).toBe(true);
  });

  it("adds a thread member", async () => {
    const add = vi.fn(async () => ({}));
    const ctx = makeCtx(mockClientWithChannel(thread({ members: { add } })));
    await getTool(threadTools, "add_thread_member").execute({ threadId: "t1", userId: "u1" }, ctx);
    expect(add).toHaveBeenCalledWith("u1");
  });

  it("rejects a non-thread channel", async () => {
    const ctx = makeCtx(mockClientWithChannel({ notAThread: true }));
    await expect(getTool(threadTools, "delete_thread").execute({ threadId: "t1" }, ctx)).rejects.toThrow(
      /not a thread/,
    );
  });

  it("delete_thread is destructive", () => {
    expect(getTool(threadTools, "delete_thread").category).toBe("destructive");
  });
});
