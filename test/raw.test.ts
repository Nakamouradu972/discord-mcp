import { describe, it, expect, vi } from "vitest";
import { rawTools } from "../src/tools/raw/index.js";
import { getTool, makeCtx } from "./helpers.js";

describe("raw passthrough tool", () => {
  it("performs a GET request against the REST client", async () => {
    const get = vi.fn(async () => ({ id: "1", name: "guild" }));
    const ctx = makeCtx({ rest: { get } } as any);
    const result = await getTool(rawTools, "raw").execute({ method: "GET", endpoint: "/guilds/1" }, ctx);
    expect(get).toHaveBeenCalled();
    expect(result).toContain('"name":"guild"');
  });

  it("normalizes an endpoint without leading slash", async () => {
    const post = vi.fn(async () => ({ ok: true }));
    const ctx = makeCtx({ rest: { post } } as any);
    await getTool(rawTools, "raw").execute({ method: "POST", endpoint: "channels/1/messages", payload: { content: "x" } }, ctx);
    expect(post.mock.calls[0][0]).toBe("/channels/1/messages");
    expect(post.mock.calls[0][1].body).toEqual({ content: "x" });
  });

  it("is destructive (always guardrailed)", () => {
    expect(getTool(rawTools, "raw").category).toBe("destructive");
  });
});
