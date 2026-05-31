import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { Client } from "discord.js";
import { createHttpApp } from "../src/app.js";
import { testConfig } from "./helpers.js";

let server: Server;
let url: string;

beforeAll(async () => {
  // The MCP initialize handshake never touches Discord, so a stub client is enough.
  // Require a bearer token to also exercise the security middleware in-process.
  const app = createHttpApp({} as unknown as Client, testConfig(), {
    authToken: "test-secret",
    allowedHosts: [],
    allowedOrigins: [],
  });
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
});

afterAll(() => {
  server.close();
});

const headers = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
  authorization: "Bearer test-secret",
};

describe("HTTP transport", () => {
  it("rejects a request without the bearer token (401)", async () => {
    const { authorization: _drop, ...noAuth } = headers;
    const res = await fetch(url, {
      method: "POST",
      headers: noAuth,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects a session-less non-initialize POST with 400", async () => {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toMatch(/non-initialize/);
  });

  it("rejects a GET without a session id with 400", async () => {
    const res = await fetch(url, { method: "GET", headers });
    expect(res.status).toBe(400);
  });

  it("opens a session on an initialize request and returns a session id", async () => {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0.0" },
        },
      }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("mcp-session-id")).toBeTruthy();
  });
});
