import { z } from "zod";
import { ButtonStyle, ComponentType, type APIEmbed, type APIActionRowComponent, type APIButtonComponent } from "discord.js";

/** Zod schema for a single rich embed. All fields optional; at least one should be set. */
export const embedSchema = z.object({
  title: z.string().max(256).optional(),
  description: z.string().max(4096).optional(),
  url: z.string().url().optional(),
  color: z.string().regex(/^#?[0-9a-fA-F]{6}$/).optional().describe("Hex color, e.g. #5865F2."),
  timestamp: z.string().optional().describe("ISO-8601 timestamp."),
  author: z.object({ name: z.string().max(256), url: z.string().url().optional(), iconUrl: z.string().url().optional() }).optional(),
  footer: z.object({ text: z.string().max(2048), iconUrl: z.string().url().optional() }).optional(),
  image: z.string().url().optional().describe("Large image URL."),
  thumbnail: z.string().url().optional().describe("Thumbnail image URL."),
  fields: z
    .array(z.object({ name: z.string().max(256), value: z.string().max(1024), inline: z.boolean().optional() }))
    .max(25)
    .optional(),
});

/**
 * Zod schema for a button. A **Link** button (style "Link" + `url`) is fully
 * functional through this MCP. Other styles require a `customId` and an
 * external interaction handler to respond to clicks — this server does not
 * consume gateway interaction events, so non-link buttons will not get a reply.
 */
export const buttonSchema = z.object({
  label: z.string().max(80),
  style: z.enum(["Primary", "Secondary", "Success", "Danger", "Link"]).optional().describe("Default: Link if url set, else Secondary."),
  url: z.string().url().optional().describe("Target URL (Link buttons only)."),
  customId: z.string().max(100).optional().describe("Custom id (non-link buttons; needs an external handler)."),
  emoji: z.string().optional(),
  disabled: z.boolean().optional(),
});

export type EmbedInput = z.infer<typeof embedSchema>;
export type ButtonInput = z.infer<typeof buttonSchema>;

const BUTTON_STYLES = {
  Primary: ButtonStyle.Primary,
  Secondary: ButtonStyle.Secondary,
  Success: ButtonStyle.Success,
  Danger: ButtonStyle.Danger,
  Link: ButtonStyle.Link,
} as const;

function toApiEmbed(e: EmbedInput): APIEmbed {
  return {
    title: e.title,
    description: e.description,
    url: e.url,
    color: e.color ? parseInt(e.color.replace("#", ""), 16) : undefined,
    timestamp: e.timestamp,
    author: e.author ? { name: e.author.name, url: e.author.url, icon_url: e.author.iconUrl } : undefined,
    footer: e.footer ? { text: e.footer.text, icon_url: e.footer.iconUrl } : undefined,
    image: e.image ? { url: e.image } : undefined,
    thumbnail: e.thumbnail ? { url: e.thumbnail } : undefined,
    fields: e.fields,
  };
}

function toApiButton(b: ButtonInput): APIButtonComponent {
  const style = b.style ? BUTTON_STYLES[b.style] : b.url ? ButtonStyle.Link : ButtonStyle.Secondary;
  if (style === ButtonStyle.Link) {
    if (!b.url) throw new Error(`Link button "${b.label}" requires a url.`);
    return { type: ComponentType.Button, style, label: b.label, url: b.url, emoji: b.emoji ? { name: b.emoji } : undefined, disabled: b.disabled };
  }
  if (!b.customId) throw new Error(`Non-link button "${b.label}" requires a customId.`);
  return { type: ComponentType.Button, style, label: b.label, custom_id: b.customId, emoji: b.emoji ? { name: b.emoji } : undefined, disabled: b.disabled };
}

/** Group buttons into action rows (max 5 buttons per row, max 5 rows). */
function toComponentRows(buttons: ButtonInput[]): APIActionRowComponent<APIButtonComponent>[] {
  const rows: APIActionRowComponent<APIButtonComponent>[] = [];
  for (let i = 0; i < buttons.length && rows.length < 5; i += 5) {
    rows.push({ type: ComponentType.ActionRow, components: buttons.slice(i, i + 5).map(toApiButton) });
  }
  return rows;
}

/** What a rich message can carry, beyond plain content. */
export interface RichMessageInput {
  content?: string;
  embeds?: EmbedInput[];
  files?: string[];
  buttons?: ButtonInput[];
}

/** Discord.js-compatible message payload assembled from validated input. */
export interface MessagePayload {
  content?: string;
  embeds?: APIEmbed[];
  files?: string[];
  components?: APIActionRowComponent<APIButtonComponent>[];
}

/**
 * Convert validated rich-message input into a discord.js message payload.
 * Throws when the message would be empty (no content, embeds or files).
 */
export function buildMessagePayload(input: RichMessageInput): MessagePayload {
  const hasContent = !!input.content;
  const hasEmbeds = !!input.embeds?.length;
  const hasFiles = !!input.files?.length;
  if (!hasContent && !hasEmbeds && !hasFiles) {
    throw new Error("A message must have at least one of: content, embeds, files.");
  }
  return {
    content: input.content,
    embeds: input.embeds?.map(toApiEmbed),
    files: input.files,
    components: input.buttons?.length ? toComponentRows(input.buttons) : undefined,
  };
}
