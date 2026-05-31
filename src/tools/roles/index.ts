import { z } from "zod";
import { type PermissionResolvable } from "discord.js";
import { defineTool, type AnyToolDefinition } from "../../core/types.js";
import { resolveGuild } from "../../core/resolve.js";

const listRoles = defineTool({
  name: "list_roles",
  description: "List the roles of a server.",
  category: "read",
  permissions: ["View Channel"],
  intents: ["Guilds"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
  },
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    const roles = await guild.roles.fetch();
    return `${roles.size} role(s):\n${roles.map((r) => `- ${r.name} (${r.id})`).join("\n")}`;
  },
});

const createRole = defineTool({
  name: "create_role",
  description: "Create a role with optional color, hoist and mentionable flags.",
  category: "write",
  permissions: ["Manage Roles"],
  intents: ["Guilds"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    name: z.string().min(1).max(100).describe("Role name."),
    color: z.string().optional().describe("Hex color, e.g. #5865F2."),
    hoist: z.boolean().optional().describe("Show role separately in the member list."),
    mentionable: z.boolean().optional().describe("Allow anyone to @mention this role."),
    permissions: z.array(z.string()).optional().describe("Permission names granted to the role."),
    reason: z.string().optional().describe("Audit-log reason."),
  },
  plan: (a) => `Create role "${a.name}".`,
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    const role = await guild.roles.create({
      name: a.name,
      color: a.color as `#${string}` | undefined,
      hoist: a.hoist,
      mentionable: a.mentionable,
      permissions: a.permissions as PermissionResolvable | undefined,
      reason: a.reason,
    });
    return `Created role "${role.name}" (${role.id}).`;
  },
});

const editRole = defineTool({
  name: "edit_role",
  description: "Edit a role's name, color, hoist or mentionable flags.",
  category: "write",
  permissions: ["Manage Roles"],
  intents: ["Guilds"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    roleId: z.string().describe("Role id."),
    name: z.string().min(1).max(100).optional().describe("New name."),
    color: z.string().optional().describe("New hex color."),
    hoist: z.boolean().optional().describe("Show separately in member list."),
    mentionable: z.boolean().optional().describe("Allow @mention."),
    reason: z.string().optional().describe("Audit-log reason."),
  },
  plan: (a) => `Edit role ${a.roleId}.`,
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    const role = await guild.roles.fetch(a.roleId);
    if (!role) throw new Error(`Role ${a.roleId} not found.`);
    await role.edit({
      name: a.name,
      color: a.color as `#${string}` | undefined,
      hoist: a.hoist,
      mentionable: a.mentionable,
      reason: a.reason,
    });
    return `Edited role ${a.roleId}.`;
  },
});

const deleteRole = defineTool({
  name: "delete_role",
  description: "Delete a role permanently.",
  category: "destructive",
  permissions: ["Manage Roles"],
  intents: ["Guilds"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    roleId: z.string().describe("Role id."),
    reason: z.string().optional().describe("Audit-log reason."),
  },
  plan: (a) => `Delete role ${a.roleId}.`,
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    await guild.roles.delete(a.roleId, a.reason);
    return `Deleted role ${a.roleId}.`;
  },
});

const assignRole = defineTool({
  name: "assign_role",
  description: "Assign a role to a member.",
  category: "write",
  permissions: ["Manage Roles"],
  intents: ["GuildMembers"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    userId: z.string().describe("Member id."),
    roleId: z.string().describe("Role id."),
    reason: z.string().optional().describe("Audit-log reason."),
  },
  plan: (a) => `Assign role ${a.roleId} to member ${a.userId}.`,
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    const member = await guild.members.fetch(a.userId);
    await member.roles.add(a.roleId, a.reason);
    return `Assigned role ${a.roleId} to ${member.user.tag}.`;
  },
});

const removeRole = defineTool({
  name: "remove_role",
  description: "Remove a role from a member.",
  category: "write",
  permissions: ["Manage Roles"],
  intents: ["GuildMembers"],
  inputSchema: {
    guildId: z.string().optional().describe("Target server id (defaults to DISCORD_GUILD_ID)."),
    userId: z.string().describe("Member id."),
    roleId: z.string().describe("Role id."),
    reason: z.string().optional().describe("Audit-log reason."),
  },
  plan: (a) => `Remove role ${a.roleId} from member ${a.userId}.`,
  execute: async (a, ctx) => {
    const guild = await resolveGuild(ctx, a.guildId);
    const member = await guild.members.fetch(a.userId);
    await member.roles.remove(a.roleId, a.reason);
    return `Removed role ${a.roleId} from ${member.user.tag}.`;
  },
});

/** Role tools. */
export const roleTools: AnyToolDefinition[] = [
  listRoles,
  createRole,
  editRole,
  deleteRole,
  assignRole,
  removeRole,
];
