import { z } from "zod";
import {
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleTriggerType,
} from "discord.js";
import { defineTool, type AnyToolDefinition } from "../../core/types.js";
import { resolveGuild } from "../../core/resolve.js";

const createAutomodRule = defineTool({
  name: "create_automod_rule",
  description: "Create a keyword AutoMod rule that blocks messages containing any listed keyword.",
  category: "write",
  permissions: ["Manage Server"],
  intents: ["Guilds"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    name: z.string().min(1).max(100).describe("Rule name."),
    keywords: z.array(z.string().min(1)).min(1).describe("Keyword filters to block."),
    enabled: z.boolean().optional().describe("Whether the rule is active (default true)."),
  },
  plan: (a) => `Create AutoMod rule "${a.name}" blocking ${a.keywords.length} keyword(s).`,
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    const rule = await guild.autoModerationRules.create({
      name: a.name,
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.Keyword,
      triggerMetadata: { keywordFilter: a.keywords },
      actions: [{ type: AutoModerationActionType.BlockMessage }],
      enabled: a.enabled ?? true,
    });
    return `Created AutoMod rule "${rule.name}" (${rule.id}).`;
  },
});

const editAutomodRule = defineTool({
  name: "edit_automod_rule",
  description: "Edit an AutoMod rule (name, enabled state, keyword filters).",
  category: "write",
  permissions: ["Manage Server"],
  intents: ["Guilds"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    ruleId: z.string().describe("AutoMod rule id."),
    name: z.string().min(1).max(100).optional().describe("New name."),
    enabled: z.boolean().optional().describe("Enable/disable the rule."),
    keywords: z.array(z.string().min(1)).optional().describe("Replacement keyword filters."),
  },
  plan: (a) => `Edit AutoMod rule ${a.ruleId}.`,
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    await guild.autoModerationRules.edit(a.ruleId, {
      name: a.name,
      enabled: a.enabled,
      triggerMetadata: a.keywords ? { keywordFilter: a.keywords } : undefined,
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
