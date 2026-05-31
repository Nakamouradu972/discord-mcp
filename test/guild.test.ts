import { describe, it, expect, vi } from "vitest";
import { guildTools } from "../src/tools/guild/index.js";
import { getTool, makeCtx, mockClientWithGuild, mockGuild } from "./helpers.js";

describe("guild tools", () => {
  it("reads guild settings", async () => {
    const guild = mockGuild({
      description: "desc",
      verificationLevel: 1,
      afkChannelId: "afk",
      afkTimeout: 300,
      systemChannelId: "sys",
      vanityURLCode: "vanity",
    });
    const ctx = makeCtx(mockClientWithGuild(guild));
    const result = await getTool(guildTools, "get_guild_settings").execute({}, ctx);
    expect(result).toContain("Low"); // verificationLevel 1
    expect(result).toContain("vanity");
  });

  it("edits only the provided fields", async () => {
    const edit = vi.fn(async () => ({}));
    const guild = mockGuild({ edit });
    const ctx = makeCtx(mockClientWithGuild(guild));

    await getTool(guildTools, "edit_guild_settings").execute({ name: "New", verificationLevel: "High" }, ctx);
    const arg = edit.mock.calls[0][0];
    expect(arg.name).toBe("New");
    expect(arg.verificationLevel).toBe(3); // High
    expect("description" in arg).toBe(false);
  });
});
