import type { z } from "zod";
import type { Client } from "discord.js";
import type { AuditLogger } from "./audit.js";
import type { ServerConfig } from "./env.js";

/**
 * Classification that drives the guardrail behaviour of a tool.
 *
 * - `read`        — no side effects; never gated by dry-run or confirmation.
 * - `write`       — mutates Discord state; defaults to dry-run.
 * - `destructive` — irreversible or high-impact (delete, ban, bulk delete);
 *                   defaults to dry-run AND requires explicit `confirm: true`.
 */
export type ToolCategory = "read" | "write" | "destructive";

/** Runtime dependencies handed to every tool handler. */
export interface ToolContext {
  /** Logged-in discord.js client (or a mock during unit tests). */
  client: Client;
  /** Local audit-trail writer. */
  audit: AuditLogger;
  /** Resolved server configuration (default guild, dry-run default, …). */
  config: ServerConfig;
}

/**
 * A single MCP tool definition.
 *
 * Handlers stay small and pure: they receive the validated `args` plus the
 * shared {@link ToolContext} and return a human-readable string. All cross
 * cutting concerns (validation, dry-run, confirmation, audit, rate-limit
 * retry) are applied by the guardrail wrapper in `registerTool.ts`, so a
 * domain never re-implements them.
 *
 * @typeParam Shape - the zod raw shape describing the tool input.
 */
export interface ToolDefinition<Shape extends z.ZodRawShape = z.ZodRawShape> {
  /** Tool name, registered to MCP with the `discord_` prefix. */
  name: string;
  /** One-line, human-readable description shown to the model. */
  description: string;
  /** Guardrail classification. */
  category: ToolCategory;
  /** Zod raw shape validating the tool input. */
  inputSchema: Shape;
  /**
   * Produce a human-readable preview of the change for write/destructive
   * tools. Returned verbatim to the caller in dry-run mode. Optional for
   * `read` tools (ignored if present).
   */
  plan?: (args: z.objectOutputType<Shape, z.ZodTypeAny>, ctx: ToolContext) => Promise<string> | string;
  /** Perform the action and return a result message. */
  execute: (args: z.objectOutputType<Shape, z.ZodTypeAny>, ctx: ToolContext) => Promise<string> | string;
  /** Discord bot permissions required to use this tool (documentation). */
  permissions?: string[];
  /** Gateway intents required to use this tool (documentation). */
  intents?: string[];
}

/**
 * A tool definition with its input-shape generic erased so heterogeneous
 * tools can live in the same array. `plan`/`execute` accept loosely-typed
 * args here; the strong typing happens at authoring time via {@link defineTool}.
 */
export interface AnyToolDefinition {
  name: string;
  description: string;
  category: ToolCategory;
  inputSchema: z.ZodRawShape;
  plan?: (args: Record<string, any>, ctx: ToolContext) => Promise<string> | string;
  execute: (args: Record<string, any>, ctx: ToolContext) => Promise<string> | string;
  permissions?: string[];
  intents?: string[];
}

/**
 * Authoring helper: validates a tool definition against its specific input
 * shape (so `args` are fully typed inside `plan`/`execute`) while returning
 * the shape-erased {@link AnyToolDefinition} used for aggregation/registration.
 */
export function defineTool<Shape extends z.ZodRawShape>(def: ToolDefinition<Shape>): AnyToolDefinition {
  return def as unknown as AnyToolDefinition;
}
