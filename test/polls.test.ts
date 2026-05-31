import { describe, it, expect, vi } from "vitest";
import { pollTools } from "../src/tools/polls/index.js";
import { getTool, makeCtx, mockClientWithChannel } from "./helpers.js";

describe("poll tools", () => {
  it("creates a poll with mapped answers", async () => {
    const send = vi.fn(async () => ({ id: "m1" }));
    const channel = { messages: {}, send };
    const ctx = makeCtx(mockClientWithChannel(channel));
    await getTool(pollTools, "create_poll").execute(
      { channelId: "c1", question: "Best?", answers: ["A", "B"], durationHours: 12 },
      ctx,
    );
    const arg = send.mock.calls[0][0];
    expect(arg.poll.question).toEqual({ text: "Best?" });
    expect(arg.poll.answers).toEqual([{ text: "A" }, { text: "B" }]);
    expect(arg.poll.duration).toBe(12);
  });

  it("reports poll results", async () => {
    const answers = [
      { text: "A", voteCount: 3 },
      { text: "B", voteCount: 1 },
    ];
    (answers as any).map = Array.prototype.map.bind(answers);
    const message = { poll: { question: { text: "Best?" }, answers, resultsFinalized: false } };
    const channel = { messages: { fetch: vi.fn(async () => message) } };
    const ctx = makeCtx(mockClientWithChannel(channel));
    const result = await getTool(pollTools, "get_poll_results").execute({ channelId: "c1", messageId: "m1" }, ctx);
    expect(result).toContain("A: 3 vote(s)");
    expect(result).toContain("open");
  });

  it("ends a poll", async () => {
    const end = vi.fn(async () => ({}));
    const message = { poll: { end } };
    const channel = { messages: { fetch: vi.fn(async () => message) } };
    const ctx = makeCtx(mockClientWithChannel(channel));
    await getTool(pollTools, "end_poll").execute({ channelId: "c1", messageId: "m1" }, ctx);
    expect(end).toHaveBeenCalled();
  });
});
