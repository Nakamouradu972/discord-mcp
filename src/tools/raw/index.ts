import { z } from "zod";
import { defineTool, type AnyToolDefinition } from "../../core/types.js";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

/**
 * Generic REST passthrough — a safety net for any Discord route not covered
 * by a typed tool. Subject to the same guardrails: it is classified as
 * `destructive` so it always requires explicit `dryRun: false` and (for the
 * actual call) `confirm: true`, since the payload can do anything.
 */
const discordRaw = defineTool({
  name: "raw",
  description:
    "Call any Discord REST endpoint directly (method + endpoint + optional payload). Guardrailed: requires confirmation.",
  category: "destructive",
  permissions: ["(depends on the endpoint called)"],
  intents: [],
  inputSchema: {
    method: z.enum(METHODS).describe("HTTP method."),
    endpoint: z.string().min(1).describe("REST route starting with '/', e.g. /guilds/{id}/channels."),
    payload: z.record(z.string(), z.unknown()).optional().describe("JSON body for POST/PUT/PATCH."),
    query: z.record(z.string(), z.string()).optional().describe("Optional query-string parameters."),
  },
  plan: (a) => `${a.method} ${a.endpoint}${a.payload ? ` with payload ${JSON.stringify(a.payload)}` : ""}`,
  execute: async (a, ctx) => {
    const route = (a.endpoint.startsWith("/") ? a.endpoint : `/${a.endpoint}`) as `/${string}`;
    const rest = ctx.client.rest;
    const options = {
      body: a.payload,
      query: a.query ? new URLSearchParams(a.query) : undefined,
    };

    let result: unknown;
    switch (a.method) {
      case "GET":
        result = await rest.get(route, { query: options.query });
        break;
      case "POST":
        result = await rest.post(route, options);
        break;
      case "PUT":
        result = await rest.put(route, options);
        break;
      case "PATCH":
        result = await rest.patch(route, options);
        break;
      case "DELETE":
        result = await rest.delete(route, { body: a.payload });
        break;
    }
    const json = JSON.stringify(result ?? null);
    const truncated = json.length > 4000 ? `${json.slice(0, 4000)}… (truncated)` : json;
    return `${a.method} ${route} →\n${truncated}`;
  },
});

/** Raw REST passthrough tool. */
export const rawTools: AnyToolDefinition[] = [discordRaw];
