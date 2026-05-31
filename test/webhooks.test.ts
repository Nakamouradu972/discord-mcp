import { describe, it, expect, vi } from "vitest";
import { webhookTools } from "../src/tools/webhooks/index.js";
import { getTool, makeCtx, mockClientWithGuild, mockGuild } from "./helpers.js";

describe("webhook tools", () => {
  it("creates a webhook on a channel", async () => {
    const createWebhook = vi.fn(async () => ({ name: "logger", id: "w1", url: "https://discord.com/api/webhooks/w1/token" }));
    const channel = { createWebhook };
    const guild = mockGuild({ channels: { fetch: vi.fn(async () => channel) } });
    const ctx = makeCtx(mockClientWithGuild(guild));
    const result = await getTool(webhookTools, "create_webhook").execute({ channelId: "c1", name: "logger" }, ctx);
    expect(createWebhook).toHaveBeenCalledWith({ name: "logger", reason: undefined });
    expect(result).toContain("w1");
  });

  it("deletes a webhook", async () => {
    const del = vi.fn(async () => ({}));
    const ctx = makeCtx({ fetchWebhook: vi.fn(async () => ({ delete: del })) } as any);
    await getTool(webhookTools, "delete_webhook").execute({ webhookId: "w1" }, ctx);
    expect(del).toHaveBeenCalled();
  });

  it("send_webhook_message requires url or id+token", async () => {
    const ctx = makeCtx({});
    await expect(
      getTool(webhookTools, "send_webhook_message").execute({ content: "hi" }, ctx),
    ).rejects.toThrow(/Provide either url/);
  });

  it("delete_webhook is destructive", () => {
    expect(getTool(webhookTools, "delete_webhook").category).toBe("destructive");
  });
});
