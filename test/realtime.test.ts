import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventQueue } from "../src/core/eventQueue.js";
import { realtimeTools } from "../src/tools/realtime/index.js";
import { getTool, makeCtx } from "./helpers.js";

let queue: EventQueue;

beforeEach(() => {
  queue = new EventQueue(":memory:");
});
afterEach(() => {
  queue.close();
});

function ctxWith(extra: Record<string, unknown> = {}) {
  const ctx = makeCtx({ ...extra } as any);
  (ctx as any).queue = queue;
  return ctx;
}

describe("realtime tools", () => {
  it("poll_events claims and reports pending events", async () => {
    queue.enqueue({ kind: "message", channelId: "c1", userId: "u1", payload: { content: "hi" } });
    const result = await getTool(realtimeTools, "poll_events").execute({}, ctxWith());
    expect(result).toContain("1 event(s) claimed");
    expect(result).toContain("eventId=");
    expect(queue.countByStatus("claimed")).toBe(1);
  });

  it("poll_events reports nothing when empty", async () => {
    expect(await getTool(realtimeTools, "poll_events").execute({}, ctxWith())).toBe("No pending events.");
  });

  it("errors clearly when the queue is not enabled", () => {
    const ctx = makeCtx({});
    expect(() => getTool(realtimeTools, "poll_events").execute({}, ctx)).toThrow(/queue is not enabled/);
  });

  it("respond_interaction edits the deferred reply via REST and completes the event", async () => {
    const patch = vi.fn(async () => ({}));
    const id = queue.enqueue({
      kind: "interaction",
      channelId: "c1",
      userId: "u1",
      interactionToken: "tok123",
      interactionExpiresAt: new Date(Date.now() + 60000).toISOString(),
      payload: { type: "command", command: "ask" },
    });
    const ctx = ctxWith({ application: { id: "app1" }, rest: { patch } });

    const result = await getTool(realtimeTools, "respond_interaction").execute(
      { eventId: id, content: "here is your answer" },
      ctx,
    );
    expect(patch).toHaveBeenCalledOnce();
    expect(patch.mock.calls[0][0]).toBe("/webhooks/app1/tok123/messages/@original");
    expect(patch.mock.calls[0][1].body.content).toBe("here is your answer");
    expect(result).toContain("Responded to interaction");
    expect(queue.get(id)!.status).toBe("done");
  });

  it("respond_interaction rejects a non-interaction event", async () => {
    const id = queue.enqueue({ kind: "message", payload: {} });
    const ctx = ctxWith({ application: { id: "app1" }, rest: { patch: vi.fn() } });
    await expect(
      getTool(realtimeTools, "respond_interaction").execute({ eventId: id, content: "x" }, ctx),
    ).rejects.toThrow(/not a respondable interaction/);
  });

  it("respond_interaction sets the ephemeral flag", async () => {
    const patch = vi.fn(async () => ({}));
    const id = queue.enqueue({
      kind: "interaction",
      interactionToken: "tok",
      interactionExpiresAt: new Date(Date.now() + 60000).toISOString(),
      payload: {},
    });
    const ctx = ctxWith({ application: { id: "app1" }, rest: { patch } });
    await getTool(realtimeTools, "respond_interaction").execute({ eventId: id, content: "secret", ephemeral: true }, ctx);
    expect(patch.mock.calls[0][1].body.flags).toBe(64);
  });

  it("complete_event marks a message event handled", async () => {
    const id = queue.enqueue({ kind: "message", payload: {} });
    await getTool(realtimeTools, "complete_event").execute({ eventId: id }, ctxWith());
    expect(queue.get(id)!.status).toBe("done");
  });
});
