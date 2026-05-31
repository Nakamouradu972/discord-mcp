import { describe, it, expect, afterEach } from "vitest";
import { readFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditLogger } from "../src/core/audit.js";

let dir: string | null = null;

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = null;
});

describe("AuditLogger", () => {
  it("appends JSONL entries with timestamp and actor, redacting secrets", async () => {
    dir = await mkdtemp(join(tmpdir(), "audit-"));
    const file = join(dir, "nested", "audit.jsonl"); // nested dir must be created
    const logger = new AuditLogger(file, "alice");

    await logger.record({
      tool: "ban",
      category: "destructive",
      args: { userId: "1", token: "super-secret" },
      outcome: "success",
      detail: "ok",
    });
    await logger.record({
      tool: "login",
      category: "read",
      args: {},
      outcome: "error",
      detail: "boom",
    });

    const lines = (await readFile(file, "utf8")).trim().split("\n");
    expect(lines).toHaveLength(2);

    const first = JSON.parse(lines[0]);
    expect(first.actor).toBe("alice");
    expect(first.tool).toBe("ban");
    expect(first.outcome).toBe("success");
    expect(first.args.token).toBe("[redacted]");
    expect(first.args.userId).toBe("1");
    expect(typeof first.timestamp).toBe("string");

    const second = JSON.parse(lines[1]);
    expect(second.outcome).toBe("error");
  });

  it("never throws when the path is unwritable", async () => {
    // A path under a file (not a directory) cannot be created.
    const logger = new AuditLogger("/dev/null/cannot/exist.jsonl", "x");
    await expect(
      logger.record({ tool: "t", category: "read", args: {}, outcome: "success" }),
    ).resolves.toBeUndefined();
  });
});
