import type { AnyToolDefinition } from "../core/types.js";
import { baseTools } from "./base/index.js";
import { channelTools } from "./channels/index.js";
import { roleTools } from "./roles/index.js";
import { messageTools } from "./messages/index.js";
import { reactionTools } from "./reactions/index.js";
import { forumTools } from "./forum/index.js";
import { webhookTools } from "./webhooks/index.js";
import { memberTools } from "./members/index.js";
import { moderationTools } from "./moderation/index.js";
import { guildTools } from "./guild/index.js";
import { inviteTools } from "./invites/index.js";
import { eventTools } from "./events/index.js";
import { pollTools } from "./polls/index.js";
import { emojiTools } from "./emojis/index.js";
import { automodTools } from "./automod/index.js";
import { auditTools } from "./audit/index.js";
import { threadTools } from "./threads/index.js";
import { commandTools } from "./commands/index.js";
import { voiceTools } from "./voice/index.js";
import { rawTools } from "./raw/index.js";

/** Every tool exposed by the server, aggregated from each domain module. */
export const allTools: AnyToolDefinition[] = [
  ...baseTools,
  ...channelTools,
  ...roleTools,
  ...messageTools,
  ...reactionTools,
  ...forumTools,
  ...webhookTools,
  ...memberTools,
  ...moderationTools,
  ...guildTools,
  ...inviteTools,
  ...eventTools,
  ...pollTools,
  ...emojiTools,
  ...automodTools,
  ...auditTools,
  ...threadTools,
  ...commandTools,
  ...voiceTools,
  ...rawTools,
];
