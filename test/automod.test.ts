import { describe, it, expect, vi } from "vitest";
import {
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleKeywordPresetType,
  AutoModerationRuleTriggerType,
} from "discord.js";
import { automodTools } from "../src/tools/automod/index.js";
import { getTool, makeCtx, mockClientWithGuild, mockGuild, collection } from "./helpers.js";

describe("automod tools", () => {
  it("creates a keyword rule with a default block action", async () => {
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

  it("creates a KeywordPreset rule with mapped presets", async () => {
    const create = vi.fn(async () => ({ name: "p", id: "r2" }));
    const guild = mockGuild({ autoModerationRules: { create } });
    const ctx = makeCtx(mockClientWithGuild(guild));

    await getTool(automodTools, "create_automod_rule").execute(
      { name: "p", triggerType: "KeywordPreset", presets: ["Profanity", "Slurs"] },
      ctx,
    );
    const arg = create.mock.calls[0][0];
    expect(arg.triggerType).toBe(AutoModerationRuleTriggerType.KeywordPreset);
    expect(arg.triggerMetadata.presets).toEqual([
      AutoModerationRuleKeywordPresetType.Profanity,
      AutoModerationRuleKeywordPresetType.Slurs,
    ]);
  });

  it("builds a timeout action with duration and an alert action with channel", async () => {
    const create = vi.fn(async () => ({ name: "m", id: "r3" }));
    const guild = mockGuild({ autoModerationRules: { create } });
    const ctx = makeCtx(mockClientWithGuild(guild));

    await getTool(automodTools, "create_automod_rule").execute(
      {
        name: "m",
        triggerType: "MentionSpam",
        mentionLimit: 4,
        actions: [
          { type: "Timeout", durationSeconds: 60 },
          { type: "Alert", channelId: "log1" },
        ],
      },
      ctx,
    );
    const arg = create.mock.calls[0][0];
    expect(arg.triggerMetadata.mentionTotalLimit).toBe(4);
    expect(arg.actions[0]).toEqual({ type: AutoModerationActionType.Timeout, metadata: { durationSeconds: 60 } });
    expect(arg.actions[1]).toEqual({ type: AutoModerationActionType.SendAlertMessage, metadata: { channel: "log1" } });
  });

  it("rejects a timeout action without a duration", async () => {
    const guild = mockGuild({ autoModerationRules: { create: vi.fn() } });
    const ctx = makeCtx(mockClientWithGuild(guild));
    await expect(
      getTool(automodTools, "create_automod_rule").execute(
        { name: "x", actions: [{ type: "Timeout" }] },
        ctx,
      ),
    ).rejects.toThrow(/durationSeconds/);
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
