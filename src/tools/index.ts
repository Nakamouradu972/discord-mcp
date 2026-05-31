import type { AnyToolDefinition } from "../core/types.js";
import { moderationTools } from "./moderation/index.js";

export const allTools: AnyToolDefinition[] = [...moderationTools];
