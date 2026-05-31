import { describe, it, expect, vi } from "vitest";
import type { Request, Response } from "express";
import { httpSecurityMiddleware, loadHttpSecurity, type HttpSecurityConfig } from "../src/core/httpSecurity.js";

function mockRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    setHeader(k: string, v: string) {
      this.headers[k] = v;
    },
  };
  return res as unknown as Response & { statusCode: number; body: any; headers: Record<string, string> };
}

function run(config: HttpSecurityConfig, headers: Record<string, string>) {
  const req = { headers } as unknown as Request;
  const res = mockRes();
  const next = vi.fn();
  httpSecurityMiddleware(config)(req, res, next);
  return { res, next };
}

const open: HttpSecurityConfig = { authToken: "", allowedHosts: [], allowedOrigins: [] };

describe("httpSecurityMiddleware", () => {
  it("passes through when nothing is configured", () => {
    const { next, res } = run(open, {});
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(0);
  });

  it("rejects a missing bearer token with 401", () => {
    const { next, res } = run({ ...open, authToken: "secret" }, {});
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.headers["WWW-Authenticate"]).toBe("Bearer");
  });

  it("rejects a wrong bearer token with 401", () => {
    const { next, res } = run({ ...open, authToken: "secret" }, { authorization: "Bearer nope" });
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("accepts the correct bearer token", () => {
    const { next, res } = run({ ...open, authToken: "secret" }, { authorization: "Bearer secret" });
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(0);
  });

  it("enforces the Host allow-list", () => {
    const cfg = { ...open, allowedHosts: ["mcp.example.com"] };
    expect(run(cfg, { host: "evil.com" }).res.statusCode).toBe(403);
    expect(run(cfg, { host: "MCP.example.com" }).next).toHaveBeenCalledOnce();
  });

  it("enforces the Origin allow-list only when an Origin header is present", () => {
    const cfg = { ...open, allowedOrigins: ["https://app.example.com"] };
    expect(run(cfg, { origin: "https://evil.com" }).res.statusCode).toBe(403);
    expect(run(cfg, { origin: "https://app.example.com" }).next).toHaveBeenCalledOnce();
    // No Origin header (e.g. non-browser client) is allowed through.
    expect(run(cfg, {}).next).toHaveBeenCalledOnce();
  });
});

describe("loadHttpSecurity", () => {
  it("parses comma-separated lists and the token", () => {
    const cfg = loadHttpSecurity({
      DISCORD_MCP_AUTH_TOKEN: "tok",
      DISCORD_MCP_ALLOWED_HOSTS: "a.com, B.com",
      DISCORD_MCP_ALLOWED_ORIGINS: "https://x.com",
    } as NodeJS.ProcessEnv);
    expect(cfg.authToken).toBe("tok");
    expect(cfg.allowedHosts).toEqual(["a.com", "b.com"]);
    expect(cfg.allowedOrigins).toEqual(["https://x.com"]);
  });

  it("defaults to open (empty) config", () => {
    const cfg = loadHttpSecurity({} as NodeJS.ProcessEnv);
    expect(cfg.authToken).toBe("");
    expect(cfg.allowedHosts).toEqual([]);
  });
});
