import { z } from "zod";
import { ApplicationCommandOptionType, type ApplicationCommandOptionData } from "discord.js";
import { defineTool, type AnyToolDefinition, type ToolContext } from "../../core/types.js";

const OPTION_TYPES = ["String", "Integer", "Boolean", "Number", "User", "Channel", "Role", "Mentionable"] as const;
const OPTION_TYPE_MAP = {
  String: ApplicationCommandOptionType.String,
  Integer: ApplicationCommandOptionType.Integer,
  Boolean: ApplicationCommandOptionType.Boolean,
  Number: ApplicationCommandOptionType.Number,
  User: ApplicationCommandOptionType.User,
  Channel: ApplicationCommandOptionType.Channel,
  Role: ApplicationCommandOptionType.Role,
  Mentionable: ApplicationCommandOptionType.Mentionable,
} as const;

const optionSchema = z.object({
  name: z.string().min(1).max(32),
  description: z.string().min(1).max(100),
  type: z.enum(OPTION_TYPES),
  required: z.boolean().optional(),
});

function getApplication(ctx: ToolContext) {
  const app = ctx.client.application;
  if (!app) throw new Error("Application not available (the bot must be logged in).");
  return app;
}

const listApplicationCommands = defineTool({
  name: "list_application_commands",
  description: "List the bot's registered slash (application) commands, globally or for a guild.",
  category: "read",
  permissions: [],
  intents: ["Guilds"],
  inputSchema: {
    guildId: z.string().optional().describe("List guild-scoped commands for this guild; omit for global commands."),
  },
  execute: async (a, ctx) => {
    const app = getApplication(ctx);
    const commands = a.guildId ? await app.commands.fetch({ guildId: a.guildId }) : await app.commands.fetch();
    if (commands.size === 0) return `No ${a.guildId ? "guild" : "global"} commands registered.`;
    return `${commands.size} command(s):\n${commands.map((c) => `- /${c.name} (${c.id}) — ${c.description}`).join("\n")}`;
  },
});

const registerApplicationCommand = defineTool({
  name: "register_application_command",
  description:
    "Register (create) a slash command. Note: this MCP cannot respond to invocations — an external interaction handler is required to reply to the command.",
  category: "write",
  permissions: [],
  intents: ["Guilds"],
  inputSchema: {
    guildId: z.string().optional().describe("Register for this guild (instant); omit for global (slow to propagate)."),
    name: z.string().min(1).max(32).regex(/^[\w-]+$/).describe("Command name (lowercase, no spaces)."),
    description: z.string().min(1).max(100).describe("Command description."),
    options: z.array(optionSchema).max(25).optional().describe("Command options/arguments."),
  },
  plan: (a) => `Register ${a.guildId ? `guild(${a.guildId})` : "global"} command /${a.name}.`,
  execute: async (a, ctx) => {
    const app = getApplication(ctx);
    const options: ApplicationCommandOptionData[] | undefined = a.options?.map((o) => ({
      name: o.name,
      description: o.description,
      type: OPTION_TYPE_MAP[o.type],
      required: o.required,
    })) as ApplicationCommandOptionData[] | undefined;
    const created = await app.commands.create(
      { name: a.name, description: a.description, options },
      a.guildId,
    );
    return `Registered command /${created.name} (${created.id}).`;
  },
});

const deleteApplicationCommand = defineTool({
  name: "delete_application_command",
  description: "Delete a registered slash command by id.",
  category: "destructive",
  permissions: [],
  intents: ["Guilds"],
  inputSchema: {
    commandId: z.string().describe("Application command id."),
    guildId: z.string().optional().describe("Guild id if it is a guild-scoped command; omit for global."),
  },
  plan: (a) => `Delete command ${a.commandId}${a.guildId ? ` in guild ${a.guildId}` : " (global)"}.`,
  execute: async (a, ctx) => {
    const app = getApplication(ctx);
    await app.commands.delete(a.commandId, a.guildId);
    return `Deleted command ${a.commandId}.`;
  },
});

/** Application (slash) command tools. */
export const commandTools: AnyToolDefinition[] = [
  listApplicationCommands,
  registerApplicationCommand,
  deleteApplicationCommand,
];
