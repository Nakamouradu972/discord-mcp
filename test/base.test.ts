import { describe, it, expect, vi } from "vitest";
import { baseTools } from "../src/tools/base/index.js";
import { getTool, makeCtx, collection, mockClientWithChannel } from "./helpers.js";

describe("base tools", () => {
  it("lists servers from the cache", async () => {
    const guilds = collection([
      ["1", { name: "Alpha", id: "1" }],
      ["2", { name: "Beta", id: "2" }],
    ]);
    const ctx = makeCtx({ guilds: { cache: guilds } } as any);
    const result = await getTool(baseTools, "list_servers").execute({}, ctx);
    expect(result).toContain("2 server(s)");
    expect(result).toContain("Alpha");
  });

  it("sends a message to a text channel", async () => {
    const send = vi.fn(async () => ({ id: "msg1" }));
    const channel = { isTextBased: () => true, send };
    const ctx = makeCtx(mockClientWithChannel(channel));
    const result = await getTool(baseTools, "send").execute({ channelId: "c1", message: "hi" }, ctx);
    // send now always builds a rich payload object; plain text rides in `content`.
    expect(send.mock.calls[0][0]).toMatchObject({ content: "hi" });
    expect(result).toContain("msg1");
  });

  it("rejects sending to a non-text channel", async () => {
    const channel = { isTextBased: () => false };
    const ctx = makeCtx(mockClientWithChannel(channel));
    await expect(getTool(baseTools, "send").execute({ channelId: "c1", message: "hi" }, ctx)).rejects.toThrow(
      /not a text channel/,
    );
  });

  it("send is a write tool, list_servers is read", () => {
    expect(getTool(baseTools, "send").category).toBe("write");
    expect(getTool(baseTools, "list_servers").category).toBe("read");
  });

  it("sends a rich message with an embed and a link button", async () => {
    const send = vi.fn(async () => ({ id: "m1" }));
    const channel = { isTextBased: () => true, send };
    const ctx = makeCtx(mockClientWithChannel(channel));
    await getTool(baseTools, "send").execute(
      { channelId: "c1", embeds: [{ title: "Hi" }], buttons: [{ label: "Go", url: "https://x" }] },
      ctx,
    );
    const payload = send.mock.calls[0][0];
    expect(payload.embeds[0].title).toBe("Hi");
    expect(payload.components[0].components[0].url).toBe("https://x");
  });

  it("rejects an empty send (no content/embeds/files)", async () => {
    const channel = { isTextBased: () => true, send: vi.fn() };
    const ctx = makeCtx(mockClientWithChannel(channel));
    await expect(getTool(baseTools, "send").execute({ channelId: "c1" }, ctx)).rejects.toThrow(/at least one/);
  });

  it("send_embed wraps a single embed with optional content", async () => {
    const send = vi.fn(async () => ({ id: "m2" }));
    const channel = { isTextBased: () => true, send };
    const ctx = makeCtx(mockClientWithChannel(channel));
    await getTool(baseTools, "send_embed").execute({ channelId: "c1", content: "see:", title: "Report", description: "d" }, ctx);
    const payload = send.mock.calls[0][0];
    expect(payload.content).toBe("see:");
    expect(payload.embeds[0].title).toBe("Report");
    expect(payload.embeds[0].description).toBe("d");
  });
});
