import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { EventQueue } from "../src/core/eventQueue.js";

let q: EventQueue;

beforeEach(() => {
  q = new EventQueue(":memory:");
});
afterEach(() => {
  q.close();
});

describe("EventQueue", () => {
  it("enqueues and reads back an event", () => {
    const id = q.enqueue({ kind: "message", channelId: "c1", userId: "u1", payload: { content: "hi" } });
    const event = q.get(id)!;
    expect(event.kind).toBe("message");
    expect(event.payload).toEqual({ content: "hi" });
    expect(event.status).toBe("pending");
  });

  it("claims pending events and marks them claimed", () => {
    q.enqueue({ kind: "message", payload: { n: 1 } });
    q.enqueue({ kind: "message", payload: { n: 2 } });
    const claimed = q.claim({ limit: 10 });
    expect(claimed).toHaveLength(2);
    expect(q.countByStatus("pending")).toBe(0);
    expect(q.countByStatus("claimed")).toBe(2);
    // A second claim returns nothing.
    expect(q.claim()).toHaveLength(0);
  });

  it("filters claims by kind", () => {
    q.enqueue({ kind: "message", payload: {} });
    q.enqueue({ kind: "interaction", payload: {}, interactionToken: "t" });
    const claimed = q.claim({ kinds: ["interaction"] });
    expect(claimed).toHaveLength(1);
    expect(claimed[0].kind).toBe("interaction");
    expect(q.countByStatus("pending")).toBe(1);
  });

  it("respects the claim limit and FIFO order", () => {
    for (let i = 0; i < 5; i += 1) q.enqueue({ kind: "message", payload: { i } });
    const first = q.claim({ limit: 2 });
    expect(first.map((e) => e.payload.i)).toEqual([0, 1]);
  });

  it("completes an event", () => {
    const id = q.enqueue({ kind: "message", payload: {} });
    expect(q.complete(id)).toBe(true);
    expect(q.get(id)!.status).toBe("done");
    expect(q.complete("missing")).toBe(false);
  });

  it("expires interactions past their token deadline and won't claim them", () => {
    q.enqueue({
      kind: "interaction",
      payload: {},
      interactionToken: "t",
      interactionExpiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    expect(q.claim()).toHaveLength(0);
    expect(q.countByStatus("expired")).toBe(1);
  });
});
