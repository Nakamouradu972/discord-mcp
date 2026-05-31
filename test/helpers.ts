import { vi } from "vitest";
import type { Client } from "discord.js";
import type { ServerConfig } from "../src/core/env.js";
import type { AuditLogger } from "../src/core/audit.js";
import type { AnyToolDefinition, ToolContext } from "../src/core/types.js";

/** A test config with dry-run disabled so `execute` paths run directly. */
export function testConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    token: "test-token",
    defaultGuildId: "default-guild",
    actor: "test",
    auditFile: "./audit/test.jsonl",
    dryRunDefault: true,
    ...overrides,
  };
}

/** A no-op audit logger that records calls for assertions. */
export function fakeAudit(): AuditLogger & { entries: unknown[] } {
  const entries: unknown[] = [];
  return {
    entries,
    record: vi.fn(async (entry: unknown) => {
      entries.push(entry);
    }),
  } as unknown as AuditLogger & { entries: unknown[] };
}

/** Build a {@link ToolContext} around a (usually mocked) client. */
export function makeCtx(client: Partial<Client>, configOverrides: Partial<ServerConfig> = {}): ToolContext {
  return {
    client: client as Client,
    audit: fakeAudit(),
    config: testConfig(configOverrides),
  };
}

/** Find a tool by its (unprefixed) name within a domain array. */
export function getTool(tools: AnyToolDefinition[], name: string): AnyToolDefinition {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`tool not found: ${name}`);
  return tool;
}

/**
 * Build a mock guild whose `members`/`bans`/`channels` managers return the
 * provided stubs. Only the bits used by tests are populated.
 */
export function mockGuild(overrides: Record<string, unknown> = {}): any {
  return {
    id: "default-guild",
    name: "Test Guild",
    ...overrides,
  };
}

/** Build a mock client whose `guilds.fetch` resolves to `guild`. */
export function mockClientWithGuild(guild: unknown): Partial<Client> {
  return {
    guilds: {
      fetch: vi.fn(async () => guild),
    },
  } as unknown as Partial<Client>;
}
