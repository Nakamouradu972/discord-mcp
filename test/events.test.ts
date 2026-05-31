import { describe, it, expect, vi } from "vitest";
import { GuildScheduledEventEntityType } from "discord.js";
import { eventTools } from "../src/tools/events/index.js";
import { getTool, makeCtx, mockClientWithGuild, mockGuild, collection } from "./helpers.js";

describe("scheduled event tools", () => {
  it("creates an external event with location metadata", async () => {
    const create = vi.fn(async () => ({ name: "Meetup", id: "e1" }));
    const guild = mockGuild({ scheduledEvents: { create } });
    const ctx = makeCtx(mockClientWithGuild(guild));

    await getTool(eventTools, "create_scheduled_event").execute(
      { name: "Meetup", startTime: "2026-06-01T10:00:00Z", endTime: "2026-06-01T12:00:00Z", entityType: "External", location: "Paris" },
      ctx,
    );
    const arg = create.mock.calls[0][0];
    expect(arg.entityType).toBe(GuildScheduledEventEntityType.External);
    expect(arg.entityMetadata).toEqual({ location: "Paris" });
  });

  it("lists scheduled events", async () => {
    const events = collection([["e1", { name: "Meetup", id: "e1", scheduledStartAt: new Date("2026-06-01") }]]);
    const guild = mockGuild({ scheduledEvents: { fetch: vi.fn(async () => events) } });
    const ctx = makeCtx(mockClientWithGuild(guild));
    expect(await getTool(eventTools, "list_scheduled_events").execute({}, ctx)).toContain("Meetup");
  });

  it("fetches event subscribers", async () => {
    const subs = collection([["u1", { user: { tag: "a#1", id: "u1" } }]]);
    const event = { fetchSubscribers: vi.fn(async () => subs) };
    const guild = mockGuild({ scheduledEvents: { fetch: vi.fn(async () => event) } });
    const ctx = makeCtx(mockClientWithGuild(guild));
    expect(await getTool(eventTools, "get_event_users").execute({ eventId: "e1" }, ctx)).toContain("a#1");
  });
});
