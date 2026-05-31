import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createRequire } from "node:module";

// `node:sqlite` is built-in on Node >=22 but emits an ExperimentalWarning on
// import. We load it via require() at construction time (not as a static ESM
// import) so the warning only ever appears when the event queue is actually
// used, and after src/core/warnings.ts has installed its filter.
type DatabaseSyncCtor = new (path: string) => {
  exec(sql: string): void;
  prepare(sql: string): { run(...p: unknown[]): { changes: number | bigint }; get(...p: unknown[]): unknown; all(...p: unknown[]): unknown[] };
  close(): void;
};
let DatabaseSync: DatabaseSyncCtor | null = null;
function getDatabaseSync(): DatabaseSyncCtor {
  if (!DatabaseSync) {
    const require = createRequire(import.meta.url);
    DatabaseSync = (require("node:sqlite") as { DatabaseSync: DatabaseSyncCtor }).DatabaseSync;
  }
  return DatabaseSync;
}

/** Kinds of Discord events the gateway worker can enqueue. */
export type EventKind = "interaction" | "message" | "member_join" | "reaction";

/** Lifecycle status of a queued event. */
export type EventStatus = "pending" | "claimed" | "done" | "expired";

/** A row in the event queue. */
export interface QueuedEvent {
  id: string;
  kind: EventKind;
  createdAt: string;
  guildId: string | null;
  channelId: string | null;
  userId: string | null;
  /** Event-specific data (already JSON-parsed). */
  payload: Record<string, unknown>;
  /** Interaction token, present only for `interaction` events. */
  interactionToken: string | null;
  /** ISO deadline after which an interaction token is dead (~15 min). */
  interactionExpiresAt: string | null;
  status: EventStatus;
}

/** Data needed to enqueue a new event. */
export interface NewEvent {
  kind: EventKind;
  guildId?: string | null;
  channelId?: string | null;
  userId?: string | null;
  payload: Record<string, unknown>;
  interactionToken?: string | null;
  interactionExpiresAt?: string | null;
}

interface RawRow {
  id: string;
  kind: string;
  created_at: string;
  guild_id: string | null;
  channel_id: string | null;
  user_id: string | null;
  payload: string;
  interaction_token: string | null;
  interaction_expires_at: string | null;
  status: string;
}

/**
 * SQLite-backed, at-least-once event queue shared between the gateway worker
 * (producer) and the MCP `poll_events` / `respond_interaction` tools (consumer).
 *
 * Uses the built-in `node:sqlite` module (Node ≥ 22), so there is no external
 * dependency. A single file persists across restarts when placed on a mounted
 * volume; `:memory:` is used by unit tests.
 */
export class EventQueue {
  private readonly db: InstanceType<DatabaseSyncCtor>;

  constructor(filePath: string) {
    if (filePath !== ":memory:") mkdirSync(dirname(filePath), { recursive: true });
    const Ctor = getDatabaseSync();
    this.db = new Ctor(filePath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        created_at TEXT NOT NULL,
        guild_id TEXT,
        channel_id TEXT,
        user_id TEXT,
        payload TEXT NOT NULL,
        interaction_token TEXT,
        interaction_expires_at TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        claimed_by TEXT,
        claimed_at TEXT
      );
    `);
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_events_status ON events(status, created_at);");
  }

  /** Add an event, returning its generated id. */
  enqueue(event: NewEvent): string {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO events (id, kind, created_at, guild_id, channel_id, user_id, payload, interaction_token, interaction_expires_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      )
      .run(
        id,
        event.kind,
        new Date().toISOString(),
        event.guildId ?? null,
        event.channelId ?? null,
        event.userId ?? null,
        JSON.stringify(event.payload),
        event.interactionToken ?? null,
        event.interactionExpiresAt ?? null,
      );
    return id;
  }

  /**
   * Atomically claim up to `limit` pending events (optionally filtered by kind),
   * marking them `claimed` so a second consumer won't pick them up. Returns the
   * claimed events oldest-first.
   */
  claim(options: { limit?: number; kinds?: EventKind[]; claimedBy?: string } = {}): QueuedEvent[] {
    const limit = options.limit ?? 10;
    const claimedBy = options.claimedBy ?? "runner";
    this.expireStale();

    const kindFilter = options.kinds?.length ? `AND kind IN (${options.kinds.map(() => "?").join(",")})` : "";
    const rows = this.db
      .prepare(
        `SELECT id FROM events WHERE status = 'pending' ${kindFilter} ORDER BY created_at ASC LIMIT ?`,
      )
      .all(...(options.kinds ?? []), limit) as { id: string }[];

    const claimStmt = this.db.prepare(
      "UPDATE events SET status = 'claimed', claimed_by = ?, claimed_at = ? WHERE id = ? AND status = 'pending'",
    );
    const now = new Date().toISOString();
    const claimed: QueuedEvent[] = [];
    for (const { id } of rows) {
      const result = claimStmt.run(claimedBy, now, id);
      if (Number(result.changes) === 1) claimed.push(this.get(id)!);
    }
    return claimed;
  }

  /** Mark an event as fully handled. Returns false if the id is unknown. */
  complete(id: string): boolean {
    const result = this.db.prepare("UPDATE events SET status = 'done' WHERE id = ?").run(id);
    return Number(result.changes) === 1;
  }

  /** Fetch a single event by id. */
  get(id: string): QueuedEvent | null {
    const row = this.db.prepare("SELECT * FROM events WHERE id = ?").get(id) as RawRow | undefined;
    return row ? this.toEvent(row) : null;
  }

  /** Count events by status (for diagnostics/tests). */
  countByStatus(status: EventStatus): number {
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM events WHERE status = ?").get(status) as { n: number | bigint };
    return Number(row.n);
  }

  /**
   * Mark interaction events whose token has expired as `expired` so consumers
   * never try to reply to a dead token. Called automatically before claiming.
   */
  expireStale(now: Date = new Date()): number {
    const result = this.db
      .prepare(
        `UPDATE events SET status = 'expired'
         WHERE status IN ('pending','claimed')
           AND interaction_expires_at IS NOT NULL
           AND interaction_expires_at < ?`,
      )
      .run(now.toISOString());
    return Number(result.changes);
  }

  /** Close the underlying database handle. */
  close(): void {
    this.db.close();
  }

  private toEvent(row: RawRow): QueuedEvent {
    return {
      id: row.id,
      kind: row.kind as EventKind,
      createdAt: row.created_at,
      guildId: row.guild_id,
      channelId: row.channel_id,
      userId: row.user_id,
      payload: JSON.parse(row.payload) as Record<string, unknown>,
      interactionToken: row.interaction_token,
      interactionExpiresAt: row.interaction_expires_at,
      status: row.status as EventStatus,
    };
  }
}
