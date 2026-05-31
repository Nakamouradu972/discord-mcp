import { describe, it, expect } from "vitest";
import { ButtonStyle, ComponentType } from "discord.js";
import { buildMessagePayload } from "../src/core/messagePayload.js";

describe("buildMessagePayload", () => {
  it("throws on an empty message", () => {
    expect(() => buildMessagePayload({})).toThrow(/at least one/);
  });

  it("passes plain content through", () => {
    expect(buildMessagePayload({ content: "hi" }).content).toBe("hi");
  });

  it("converts an embed, mapping hex color to an int and nested fields", () => {
    const p = buildMessagePayload({
      embeds: [
        {
          title: "T",
          color: "#5865F2",
          author: { name: "a", iconUrl: "https://x/i.png" },
          footer: { text: "f" },
          image: "https://x/img.png",
        },
      ],
    });
    const e = p.embeds![0];
    expect(e.title).toBe("T");
    expect(e.color).toBe(0x5865f2);
    expect(e.author).toEqual({ name: "a", url: undefined, icon_url: "https://x/i.png" });
    expect(e.image).toEqual({ url: "https://x/img.png" });
  });

  it("builds a link button without a customId", () => {
    const p = buildMessagePayload({ content: "x", buttons: [{ label: "Docs", url: "https://x" }] });
    const row = p.components![0];
    expect(row.type).toBe(ComponentType.ActionRow);
    const btn = row.components[0] as any;
    expect(btn.style).toBe(ButtonStyle.Link);
    expect(btn.url).toBe("https://x");
  });

  it("requires a customId for non-link buttons", () => {
    expect(() => buildMessagePayload({ content: "x", buttons: [{ label: "Click", style: "Primary" }] })).toThrow(
      /customId/,
    );
  });

  it("chunks buttons into rows of five", () => {
    const buttons = Array.from({ length: 7 }, (_, i) => ({ label: `b${i}`, url: `https://x/${i}` }));
    const p = buildMessagePayload({ content: "x", buttons });
    expect(p.components).toHaveLength(2);
    expect(p.components![0].components).toHaveLength(5);
    expect(p.components![1].components).toHaveLength(2);
  });

  it("forwards file URLs", () => {
    const p = buildMessagePayload({ files: ["https://x/a.png"] });
    expect(p.files).toEqual(["https://x/a.png"]);
  });
});
