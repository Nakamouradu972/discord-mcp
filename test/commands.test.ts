import { describe, it, expect, vi } from "vitest";
import { ApplicationCommandOptionType } from "discord.js";
import { commandTools } from "../src/tools/commands/index.js";
import { getTool, makeCtx, collection } from "./helpers.js";

function ctxWithApp(app: unknown) {
  return makeCtx({ application: app } as any);
}

describe("application command tools", () => {
  it("lists commands", async () => {
    const cmds = collection([["1", { name: "ping", id: "1", description: "Pong" }]]);
    const app = { commands: { fetch: vi.fn(async () => cmds) } };
    const result = await getTool(commandTools, "list_application_commands").execute({}, ctxWithApp(app));
    expect(result).toContain("/ping");
  });

  it("registers a command mapping option types", async () => {
    const create = vi.fn(async () => ({ name: "echo", id: "9" }));
    const app = { commands: { create } };
    await getTool(commandTools, "register_application_command").execute(
      { name: "echo", description: "Echo", options: [{ name: "text", description: "t", type: "String", required: true }], guildId: "g1" },
      ctxWithApp(app),
    );
    const [data, guildId] = create.mock.calls[0];
    expect(guildId).toBe("g1");
    expect(data.options[0].type).toBe(ApplicationCommandOptionType.String);
    expect(data.options[0].required).toBe(true);
  });

  it("deletes a command", async () => {
    const del = vi.fn(async () => ({}));
    const app = { commands: { delete: del } };
    await getTool(commandTools, "delete_application_command").execute({ commandId: "9" }, ctxWithApp(app));
    expect(del).toHaveBeenCalledWith("9", undefined);
  });

  it("errors clearly when not logged in", async () => {
    await expect(
      getTool(commandTools, "list_application_commands").execute({}, makeCtx({})),
    ).rejects.toThrow(/logged in/);
  });

  it("delete_application_command is destructive", () => {
    expect(getTool(commandTools, "delete_application_command").category).toBe("destructive");
  });
});
