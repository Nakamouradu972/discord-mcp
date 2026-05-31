import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

/** Outcome categories recorded for an audited tool call. */
export type AuditOutcome = "dry-run" | "confirmation-required" | "success" | "error";

/** A single audit-trail record (who / what / when / result). */
export interface AuditEntry {
  /** ISO-8601 timestamp. */
  timestamp: string;
  /** Configured actor name. */
  actor: string;
  /** Tool name. */
  tool: string;
  /** Guardrail category of the tool. */
  category: string;
  /** Sanitized tool arguments. */
  args: Record<string, unknown>;
  /** What happened. */
  outcome: AuditOutcome;
  /** Result summary on success, or error message on failure. */
  detail?: string;
}

/** Keys whose values are redacted before being written to the audit log. */
const SENSITIVE_KEYS = new Set(["token", "password", "secret", "authorization"]);

function sanitize(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    out[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? "[redacted]" : value;
  }
  return out;
}

/**
 * Append-only local audit trail. Each entry is one JSON object per line
 * (JSONL) so the file is both human-readable and easy to post-process.
 *
 * Writing is best-effort: a filesystem failure must never crash a tool call,
 * so errors are swallowed after being surfaced on stderr.
 */
export class AuditLogger {
  private readonly filePath: string;
  private readonly actor: string;
  private dirEnsured = false;

  constructor(filePath: string, actor: string) {
    this.filePath = filePath;
    this.actor = actor;
  }

  /** Record one tool invocation. */
  async record(entry: Omit<AuditEntry, "timestamp" | "actor">): Promise<void> {
    const full: AuditEntry = {
      timestamp: new Date().toISOString(),
      actor: this.actor,
      ...entry,
      args: sanitize(entry.args),
    };
    try {
      if (!this.dirEnsured) {
        await mkdir(dirname(this.filePath), { recursive: true });
        this.dirEnsured = true;
      }
      await appendFile(this.filePath, `${JSON.stringify(full)}\n`, "utf8");
    } catch (err) {
      // Never let audit logging break a tool call.
      process.stderr.write(`[audit] failed to write entry: ${String(err)}\n`);
    }
  }
}
