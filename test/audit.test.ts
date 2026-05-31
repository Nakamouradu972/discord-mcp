import { describe, it, expect, vi } from "vitest";
import { AuditLogEvent } from "discord.js";
import { auditTools } from "../src/tools/audit/index.js";
import { getTool, makeCtx, mockClientWithGuild, mockGuild, collection } from "./helpers.js";

describe("audit tools", () => {
  it("maps actionType name to enum and formats entries", async () => {
    const entries = collection([
      ["1", { action: AuditLogEvent.MemberKick, executorId: "10", targetId: "20", reason: "spam" }],
    ]);
    const fetchAuditLogs = vi.fn(async () => ({ entries }));
    const guild = mockGuild({ fetchAuditLogs });
    const ctx = makeCtx(mockClientWithGuild(guild));

    const result = await getTool(auditTools, "get_audit_log").execute({ actionType: "MemberKick", limit: 10 }, ctx);
    expect(fetchAuditLogs).toHaveBeenCalledWith({ user: undefined, type: AuditLogEvent.MemberKick, limit: 10 });
    expect(result).toContain("MemberKick");
    expect(result).toContain("spam");
  });

  it("get_audit_log is read-only", () => {
    expect(getTool(auditTools, "get_audit_log").category).toBe("read");
  });
});
