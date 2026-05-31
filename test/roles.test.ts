import { describe, it, expect, vi } from "vitest";
import { roleTools } from "../src/tools/roles/index.js";
import { getTool, makeCtx, mockClientWithGuild, mockGuild, collection } from "./helpers.js";

describe("role tools", () => {
  it("lists roles", async () => {
    const roles = collection([["r1", { name: "Admin", id: "r1" }]]);
    const guild = mockGuild({ roles: { fetch: vi.fn(async () => roles) } });
    const ctx = makeCtx(mockClientWithGuild(guild));
    expect(await getTool(roleTools, "list_roles").execute({}, ctx)).toContain("Admin");
  });

  it("creates a role", async () => {
    const create = vi.fn(async () => ({ name: "Mod", id: "r2" }));
    const guild = mockGuild({ roles: { create } });
    const ctx = makeCtx(mockClientWithGuild(guild));
    const result = await getTool(roleTools, "create_role").execute({ name: "Mod", color: "#fff" }, ctx);
    expect(create).toHaveBeenCalled();
    expect(result).toContain("Mod");
  });

  it("assigns a role to a member", async () => {
    const add = vi.fn(async () => ({}));
    const member = { user: { tag: "a#1" }, roles: { add } };
    const guild = mockGuild({ members: { fetch: vi.fn(async () => member) } });
    const ctx = makeCtx(mockClientWithGuild(guild));
    await getTool(roleTools, "assign_role").execute({ userId: "1", roleId: "r1" }, ctx);
    expect(add).toHaveBeenCalledWith("r1", undefined);
  });

  it("delete_role is destructive", () => {
    expect(getTool(roleTools, "delete_role").category).toBe("destructive");
  });
});
