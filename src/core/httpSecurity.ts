import type { Request, Response, NextFunction } from "express";

/** HTTP security configuration for the remote-exposed MCP endpoint. */
export interface HttpSecurityConfig {
  /** Bearer token required in the Authorization header. Empty = auth disabled. */
  authToken: string;
  /**
   * Allowed `Host` header values (DNS-rebinding protection). Empty = allow any.
   * Compared case-insensitively, port included if present.
   */
  allowedHosts: string[];
  /** Allowed `Origin` header values. Empty = allow any (no browser origin check). */
  allowedOrigins: string[];
}

/** Build {@link HttpSecurityConfig} from an environment map. */
export function loadHttpSecurity(env: NodeJS.ProcessEnv = process.env): HttpSecurityConfig {
  const split = (v: string | undefined): string[] =>
    (v ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);
  return {
    authToken: env.DISCORD_MCP_AUTH_TOKEN ?? "",
    allowedHosts: split(env.DISCORD_MCP_ALLOWED_HOSTS),
    allowedOrigins: split(env.DISCORD_MCP_ALLOWED_ORIGINS),
  };
}

/** Constant-time-ish string compare to avoid trivial timing leaks. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function jsonError(res: Response, status: number, message: string): void {
  res.status(status).json({
    jsonrpc: "2.0",
    error: { code: status === 401 ? -32001 : -32000, message },
    id: null,
  });
}

/**
 * Express middleware enforcing DNS-rebinding protection (Host/Origin allow-lists)
 * and bearer-token authentication. Each check is skipped when its allow-list /
 * token is empty, so local development stays friction-free while production can
 * lock everything down via env vars.
 */
export function httpSecurityMiddleware(config: HttpSecurityConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (config.allowedHosts.length > 0) {
      const host = (req.headers.host ?? "").toLowerCase();
      if (!config.allowedHosts.includes(host)) {
        jsonError(res, 403, "Forbidden: Host not allowed.");
        return;
      }
    }

    if (config.allowedOrigins.length > 0) {
      const origin = req.headers.origin;
      if (origin && !config.allowedOrigins.includes(origin.toLowerCase())) {
        jsonError(res, 403, "Forbidden: Origin not allowed.");
        return;
      }
    }

    if (config.authToken) {
      const header = req.headers.authorization ?? "";
      const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
      if (!token || !safeEqual(token, config.authToken)) {
        res.setHeader("WWW-Authenticate", "Bearer");
        jsonError(res, 401, "Unauthorized: a valid Bearer token is required.");
        return;
      }
    }

    next();
  };
}
