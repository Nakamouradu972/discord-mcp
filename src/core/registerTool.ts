import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { AnyToolDefinition, ToolContext } from "./types.js";
import { withRateLimitRetry } from "./rateLimit.js";

/** Extra input fields injected into every write/destructive tool. */
const GUARDRAIL_FIELDS = {
  dryRun: z
    .boolean()
    .optional()
    .describe(
      "Preview the change without performing it. Defaults to ON for write tools. Set to false to actually execute.",
    ),
  confirm: z
    .boolean()
    .optional()
    .describe("Required (true) to run a destructive action. Has no effect on non-destructive tools."),
};

function textResult(text: string, isError = false): CallToolResult {
  return { content: [{ type: "text", text }], isError };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Build the guardrail-wrapped MCP handler for a tool. Exposed separately from
 * {@link registerTool} so the pipeline (dry-run / confirmation / audit /
 * rate-limit) can be unit-tested without MCP transport plumbing.
 */
export function createGuardedHandler(
  def: AnyToolDefinition,
  ctx: ToolContext,
): (rawArgs: Record<string, unknown>) => Promise<CallToolResult> {
  const isWrite = def.category !== "read";
  const isDestructive = def.category === "destructive";

  return async (rawArgs: Record<string, unknown>): Promise<CallToolResult> => {
    const { dryRun, confirm, ...args } = rawArgs;
    const auditArgs = args as Record<string, unknown>;

    try {
        if (isWrite) {
          const dryRunActive = typeof dryRun === "boolean" ? dryRun : ctx.config.dryRunDefault;
          const preview = def.plan ? await def.plan(args, ctx) : "(no preview available)";

          if (dryRunActive) {
            await ctx.audit.record({
              tool: def.name,
              category: def.category,
              args: auditArgs,
              outcome: "dry-run",
              detail: preview,
            });
            const howTo = isDestructive
              ? "Re-run with dryRun=false and confirm=true to execute."
              : "Re-run with dryRun=false to execute.";
            return textResult(`🧪 DRY-RUN — no action taken.\n\nPlanned change:\n${preview}\n\n${howTo}`);
          }

          if (isDestructive && confirm !== true) {
            await ctx.audit.record({
              tool: def.name,
              category: def.category,
              args: auditArgs,
              outcome: "confirmation-required",
              detail: preview,
            });
            return textResult(
              `⚠️ CONFIRMATION REQUIRED — destructive action.\n\nPlanned change:\n${preview}\n\nRe-run with confirm=true (and dryRun=false) to proceed.`,
            );
          }
        }

        const result = await withRateLimitRetry(() => Promise.resolve(def.execute(args, ctx)));
        await ctx.audit.record({
          tool: def.name,
          category: def.category,
          args: auditArgs,
          outcome: "success",
          detail: result,
        });
        return textResult(result);
      } catch (error) {
        const message = errorMessage(error);
        await ctx.audit.record({
          tool: def.name,
          category: def.category,
          args: auditArgs,
          outcome: "error",
          detail: message,
        });
        return textResult(`❌ ${message}`, true);
      }
  };
}

/**
 * Register a single tool on the MCP server behind the generic guardrail
 * pipeline (input validation, dry-run, confirmation, rate-limit retry, audit).
 * Domains never re-implement any of this; they only provide `plan`/`execute`.
 */
export function registerTool(server: McpServer, def: AnyToolDefinition, ctx: ToolContext): void {
  const isWrite = def.category !== "read";
  const inputSchema = isWrite ? { ...def.inputSchema, ...GUARDRAIL_FIELDS } : def.inputSchema;

  server.registerTool(
    `discord_${def.name}`,
    { description: def.description, inputSchema },
    createGuardedHandler(def, ctx),
  );
}
