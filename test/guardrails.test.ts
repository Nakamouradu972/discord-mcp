import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { createGuardedHandler } from "../src/core/registerTool.js";
import { withRateLimitRetry, getRetryDelayMs } from "../src/core/rateLimit.js";
import { defineTool } from "../src/core/types.js";
import { makeCtx } from "./helpers.js";

const writeTool = (execute = vi.fn(async () => "done")) =>
  defineTool({
    name: "demo_write",
    description: "demo",
    category: "write",
    inputSchema: { value: z.string() },
    plan: (a) => `would set ${a.value}`,
    execute,
  });

const destructiveTool = (execute = vi.fn(async () => "deleted")) =>
  defineTool({
    name: "demo_delete",
    description: "demo",
    category: "destructive",
    inputSchema: { id: z.string() },
    plan: (a) => `would delete ${a.id}`,
    execute,
  });

describe("guardrail pipeline", () => {
  it("returns the plan and does NOT execute in dry-run (default)", async () => {
    const execute = vi.fn(async () => "done");
    const ctx = makeCtx({});
    const handler = createGuardedHandler(writeTool(execute), ctx);

    const res = await handler({ value: "x" });
    expect(execute).not.toHaveBeenCalled();
    expect(res.content[0].text).toContain("DRY-RUN");
    expect(res.content[0].text).toContain("would set x");
    expect((ctx.audit as any).entries[0].outcome).toBe("dry-run");
  });

  it("executes a write tool when dryRun=false", async () => {
    const execute = vi.fn(async () => "done");
    const ctx = makeCtx({});
    const handler = createGuardedHandler(writeTool(execute), ctx);

    const res = await handler({ value: "x", dryRun: false });
    expect(execute).toHaveBeenCalledOnce();
    expect(res.content[0].text).toBe("done");
    expect((ctx.audit as any).entries[0].outcome).toBe("success");
  });

  it("requires confirm=true for destructive tools even when dryRun=false", async () => {
    const execute = vi.fn(async () => "deleted");
    const ctx = makeCtx({});
    const handler = createGuardedHandler(destructiveTool(execute), ctx);

    const res = await handler({ id: "1", dryRun: false });
    expect(execute).not.toHaveBeenCalled();
    expect(res.content[0].text).toContain("CONFIRMATION REQUIRED");
    expect((ctx.audit as any).entries[0].outcome).toBe("confirmation-required");
  });

  it("executes a destructive tool with dryRun=false and confirm=true", async () => {
    const execute = vi.fn(async () => "deleted");
    const ctx = makeCtx({});
    const handler = createGuardedHandler(destructiveTool(execute), ctx);

    const res = await handler({ id: "1", dryRun: false, confirm: true });
    expect(execute).toHaveBeenCalledOnce();
    expect(res.content[0].text).toBe("deleted");
  });

  it("reports errors and records them in the audit log", async () => {
    const ctx = makeCtx({});
    const execute = vi.fn(async () => {
      throw new Error("boom");
    });
    const handler = createGuardedHandler(writeTool(execute), ctx);

    const res = await handler({ value: "x", dryRun: false });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("boom");
    expect((ctx.audit as any).entries[0].outcome).toBe("error");
  });

  it("respects dryRunDefault=false from config", async () => {
    const execute = vi.fn(async () => "done");
    const ctx = makeCtx({}, { dryRunDefault: false });
    const handler = createGuardedHandler(writeTool(execute), ctx);

    await handler({ value: "x" });
    expect(execute).toHaveBeenCalledOnce();
  });
});

describe("rate-limit retry", () => {
  it("retries on a 429 and eventually succeeds", async () => {
    let calls = 0;
    const sleep = vi.fn(async () => {});
    const result = await withRateLimitRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw { status: 429, retry_after: 0.01 };
        return "ok";
      },
      { sleep, baseDelayMs: 1 },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-rate-limit errors", async () => {
    await expect(
      withRateLimitRetry(async () => {
        throw new Error("nope");
      }),
    ).rejects.toThrow("nope");
  });

  it("extracts retry delay from various shapes", () => {
    expect(getRetryDelayMs({ timeToReset: 500 })).toBe(500);
    expect(getRetryDelayMs({ status: 429, retry_after: 2 })).toBe(2000);
    expect(getRetryDelayMs(new Error("x"))).toBeNull();
  });
});
