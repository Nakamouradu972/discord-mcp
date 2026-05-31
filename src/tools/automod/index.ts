import { z } from "zod";
import {
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleKeywordPresetType,
  AutoModerationRuleTriggerType,
  type AutoModerationActionOptions,
  type AutoModerationTriggerMetadataOptions,
} from "discord.js";
import { defineTool, type AnyToolDefinition } from "../../core/types.js";
import { resolveGuild } from "../../core/resolve.js";

const TRIGGER_TYPES = ["Keyword", "Spam", "KeywordPreset", "MentionSpam"] as const;
const TRIGGER_MAP = {
  Keyword: AutoModerationRuleTriggerType.Keyword,
  Spam: AutoModerationRuleTriggerType.Spam,
  KeywordPreset: AutoModerationRuleTriggerType.KeywordPreset,
  MentionSpam: AutoModerationRuleTriggerType.MentionSpam,
} as const;

const PRESETS = ["Profanity", "SexualContent", "Slurs"] as const;
const PRESET_MAP = {
  Profanity: AutoModerationRuleKeywordPresetType.Profanity,
  SexualContent: AutoModerationRuleKeywordPresetType.SexualContent,
  Slurs: AutoModerationRuleKeywordPresetType.Slurs,
} as const;

const actionSchema = z.object({
  type: z.enum(["BlockMessage", "Timeout", "Alert"]).describe("BlockMessage, Timeout (member), or Alert (log channel)."),
  customMessage: z.string().max(150).optional().describe("Block explanation shown to the user (BlockMessage)."),
  durationSeconds: z.number().int().min(1).max(2419200).optional().describe("Timeout duration in seconds (Timeout)."),
  channelId: z.string().optional().describe("Alert log channel id (Alert)."),
});

type ActionInput = z.infer<typeof actionSchema>;

function buildActions(actions: ActionInput[] | undefined): AutoModerationActionOptions[] {
  const list = actions && actions.length > 0 ? actions : [{ type: "BlockMessage" as const }];
  return list.map((a): AutoModerationActionOptions => {
    switch (a.type) {
      case "BlockMessage":
        return { type: AutoModerationActionType.BlockMessage, metadata: { customMessage: a.customMessage } };
      case "Timeout":
        if (!a.durationSeconds) throw new Error("Timeout action requires durationSeconds.");
        return { type: AutoModerationActionType.Timeout, metadata: { durationSeconds: a.durationSeconds } };
      case "Alert":
        if (!a.channelId) throw new Error("Alert action requires a channelId.");
        return { type: AutoModerationActionType.SendAlertMessage, metadata: { channel: a.channelId } };
    }
  });
}

function buildTriggerMetadata(a: {
  triggerType: (typeof TRIGGER_TYPES)[number];
  keywords?: string[];
  regexPatterns?: string[];
  presets?: (typeof PRESETS)[number][];
  allowList?: string[];
  mentionLimit?: number;
}): AutoModerationTriggerMetadataOptions | undefined {
  switch (a.triggerType) {
    case "Keyword":
      return { keywordFilter: a.keywords ?? [], regexPatterns: a.regexPatterns, allowList: a.allowList };
    case "KeywordPreset":
      return { presets: a.presets?.map((p) => PRESET_MAP[p]), allowList: a.allowList };
    case "MentionSpam":
      return { mentionTotalLimit: a.mentionLimit ?? 5 };
    case "Spam":
      return undefined;
  }
}

const createAutomodRule = defineTool({
  name: "create_automod_rule",
  description:
    "Create an AutoMod rule. Supports Keyword, Spam, KeywordPreset and MentionSpam triggers with block/timeout/alert actions.",
  category: "write",
  permissions: ["Manage Server"],
  intents: ["Guilds"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    name: z.string().min(1).max(100).describe("Rule name."),
    triggerType: z.enum(TRIGGER_TYPES).optional().describe("Trigger type (default Keyword)."),
    keywords: z.array(z.string().min(1)).optional().describe("Keyword filters (Keyword trigger)."),
    regexPatterns: z.array(z.string().min(1)).optional().describe("Regex patterns (Keyword trigger)."),
    presets: z.array(z.enum(PRESETS)).optional().describe("Preset word lists (KeywordPreset trigger)."),
    allowList: z.array(z.string().min(1)).optional().describe("Words exempt from the filter."),
    mentionLimit: z.number().int().min(1).max(50).optional().describe("Max mentions per message (MentionSpam)."),
    actions: z.array(actionSchema).optional().describe("Actions to take (default: block message)."),
    exemptRoleIds: z.array(z.string()).optional().describe("Roles exempt from the rule."),
    exemptChannelIds: z.array(z.string()).optional().describe("Channels exempt from the rule."),
    enabled: z.boolean().optional().describe("Whether the rule is active (default true)."),
  },
  plan: (a) => `Create ${a.triggerType ?? "Keyword"} AutoMod rule "${a.name}".`,
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    const triggerType = a.triggerType ?? "Keyword";
    const rule = await guild.autoModerationRules.create({
      name: a.name,
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: TRIGGER_MAP[triggerType],
      triggerMetadata: buildTriggerMetadata({ ...a, triggerType }),
      actions: buildActions(a.actions),
      enabled: a.enabled ?? true,
      exemptRoles: a.exemptRoleIds,
      exemptChannels: a.exemptChannelIds,
    });
    return `Created AutoMod rule "${rule.name}" (${rule.id}).`;
  },
});

const editAutomodRule = defineTool({
  name: "edit_automod_rule",
  description: "Edit an AutoMod rule (name, enabled state, keyword filters, actions, exemptions).",
  category: "write",
  permissions: ["Manage Server"],
  intents: ["Guilds"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    ruleId: z.string().describe("AutoMod rule id."),
    name: z.string().min(1).max(100).optional().describe("New name."),
    enabled: z.boolean().optional().describe("Enable/disable the rule."),
    keywords: z.array(z.string().min(1)).optional().describe("Replacement keyword filters (Keyword rules)."),
    actions: z.array(actionSchema).optional().describe("Replacement actions."),
    exemptRoleIds: z.array(z.string()).optional().describe("Replacement exempt roles."),
    exemptChannelIds: z.array(z.string()).optional().describe("Replacement exempt channels."),
  },
  plan: (a) => `Edit AutoMod rule ${a.ruleId}.`,
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    await guild.autoModerationRules.edit(a.ruleId, {
      name: a.name,
      enabled: a.enabled,
      triggerMetadata: a.keywords ? { keywordFilter: a.keywords } : undefined,
      actions: a.actions ? buildActions(a.actions) : undefined,
      exemptRoles: a.exemptRoleIds,
      exemptChannels: a.exemptChannelIds,
    });
    return `Edited AutoMod rule ${a.ruleId}.`;
  },
});

const deleteAutomodRule = defineTool({
  name: "delete_automod_rule",
  description: "Delete an AutoMod rule.",
  category: "destructive",
  permissions: ["Manage Server"],
  intents: ["Guilds"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    ruleId: z.string().describe("AutoMod rule id."),
    reason: z.string().optional().describe("Audit-log reason."),
  },
  plan: (a) => `Delete AutoMod rule ${a.ruleId}.`,
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    await guild.autoModerationRules.delete(a.ruleId, a.reason);
    return `Deleted AutoMod rule ${a.ruleId}.`;
  },
});

const listAutomodRules = defineTool({
  name: "list_automod_rules",
  description: "List the AutoMod rules of a server.",
  category: "read",
  permissions: ["Manage Server"],
  intents: ["Guilds"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
  },
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    const rules = await guild.autoModerationRules.fetch();
    if (rules.size === 0) return `No AutoMod rules in ${guild.name}.`;
    return `${rules.size} rule(s):\n${rules
      .map((r) => `- ${r.name} (${r.id}) ${r.enabled ? "enabled" : "disabled"}`)
      .join("\n")}`;
  },
});

/** AutoMod tools. */
export const automodTools: AnyToolDefinition[] = [
  createAutomodRule,
  editAutomodRule,
  deleteAutomodRule,
  listAutomodRules,
];
