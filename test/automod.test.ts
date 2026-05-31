import { describe, it, expect, vi } from "vitest";
import {
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleTriggerType,
} from "discord.js";
import { automodTools } from "../src/tools/automod/index.js";
import { getTool, makeCtx, mockClientWithGuild, mockGuild, collection } from "./helpers.js";

describe("automod tools", () => {
  it("creates a keyword rule with a block action", async () => {
    const create = vi.fn(async () => ({ name: "rule", id: "r1" }));
    const guild = mockGuild({ autoModerationRules: { create } });
    const ctx = makeCtx(mockClientWithGuild(guild));

    await getTool(automodTools, "create_automod_rule").execute({ name: "rule", keywords: ["bad"] }, ctx);
    const arg = create.mock.calls[0][0];
    expect(arg.eventType).toBe(AutoModerationRuleEventType.MessageSend);
    expect(arg.triggerType).toBe(AutoModerationRuleTriggerType.Keyword);
    expect(arg.triggerMetadata.keywordFilter).toEqual(["bad"]);
    expect(arg.actions[0].type).toBe(AutoModerationActionType.BlockMessage);
  });

  it("lists rules", async () => {
    const rules = collection([["r1", { name: "rule", id: "r1", enabled: true }]]);
    const guild = mockGuild({ autoModerationRules: { fetch: vi.fn(async () => rules) } });
    const ctx = makeCtx(mockClientWithGuild(guild));
    expect(await getTool(automodTools, "list_automod_rules").execute({}, ctx)).toContain("rule");
  });

  it("delete_automod_rule is destructive", () => {
    expect(getTool(automodTools, "delete_automod_rule").category).toBe("destructive");
  });
});
