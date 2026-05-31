import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/core/env.js";

describe("loadConfig", () => {
  it("applies defaults when env is empty", () => {
    const c = loadConfig({} as NodeJS.ProcessEnv);
    expect(c.token).toBe("");
    expect(c.defaultGuildId).toBeUndefined();
    expect(c.actor).toBe("mcp");
    expect(c.auditFile).toBe("./audit/audit-log.jsonl");
    expect(c.dryRunDefault).toBe(true);
  });

  it("reads provided values", () => {
    const c = loadConfig({
      DISCORD_TOKEN: "t",
      DISCORD_GUILD_ID: "g",
      DISCORD_MCP_ACTOR: "alice",
      DISCORD_MCP_AUDIT_FILE: "/tmp/a.jsonl",
    } as NodeJS.ProcessEnv);
    expect(c.token).toBe("t");
    expect(c.defaultGuildId).toBe("g");
    expect(c.actor).toBe("alice");
    expect(c.auditFile).toBe("/tmp/a.jsonl");
  });

  it.each([
    ["false", false],
    ["0", false],
    ["no", false],
    ["off", false],
    ["true", true],
    ["1", true],
    ["", true],
  ])("parses DISCORD_MCP_DRY_RUN_DEFAULT=%s as %s", (value, expected) => {
    const c = loadConfig({ DISCORD_MCP_DRY_RUN_DEFAULT: value } as NodeJS.ProcessEnv);
    expect(c.dryRunDefault).toBe(expected);
  });
});
