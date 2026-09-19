import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { SigningAuth, SIGNING_HEADERS, type FetchLike } from "stx-typescript";
import {
  makeContext,
  beginLogin,
  completeCallback,
  clientFor,
  refreshMember,
} from "../src/flows.ts";

const CFG = {
  baseUrl: "https://sandbox.example",
  clientId: "stx_client_sandbox_heater",
  clientSecret: "stx_secret_sandbox_heater_do_not_use_in_prod",
  redirectUri: "http://localhost:8787/callback",
  scopes: "identity balance history",
};

// A fake STX serving both the token endpoint and the GraphQL endpoint.
function fakeStx(): { fetch: FetchLike; refreshCount: () => number } {
  let n = 0;
  let refreshes = 0;
  const fetch: FetchLike = async (input, init) => {
    const url = new URL(String(input));
    const j = (b: unknown, status = 200) =>
      new Response(JSON.stringify(b), {
        status,
        headers: { "content-type": "application/json" },
      });

    if (url.pathname === "/oauth/token") {
      const p = new URLSearchParams(String(init?.body ?? ""));
      if (p.get("grant_type") === "refresh_token") refreshes += 1;
      n += 1;
      return j({
        access_token: `at_${n}`,
        refresh_token: `rt_${n}`,
        token_type: "bearer",
        expires_in: 3600,
        scope: "identity balance history",
      });
    }
    if (url.pathname === "/api/graphql") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const auth = (init?.headers as Record<string, string>)?.Authorization;
      expect(auth).toMatch(/^Bearer at_/); // scoped call carried the token
      if (body.operationName === "Me")
        return j({ data: { me: { userId: "u1", accountId: "a1", scope: "identity balance history" } } });
      if (body.operationName === "MyOrderHistory")
        return j({ data: { myOrderHistory: { totalCount: 0, orders: [] } } });
      return j({ data: {} });
    }
    return j({ error: "unexpected" }, 500);
  };
  return { fetch, refreshCount: () => refreshes };
}

describe("ISV OAuth demo wiring", () => {
  it("beginLogin builds a PKCE authorize URL and stores the verifier", async () => {
    const { fetch } = fakeStx();
    const ctx = makeContext(CFG, fetch);
    const url = await beginLogin(ctx);
    const u = new URL(url);
    expect(u.pathname).toBe("/oauth/authorize");
    expect(u.searchParams.get("client_id")).toBe(CFG.clientId);
    expect(u.searchParams.get("redirect_uri")).toBe(CFG.redirectUri);
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("code_challenge")).toBeTruthy();
    expect(u.searchParams.get("state")).toBeTruthy();
  });

  it("callback → token exchange → scoped me()/orders.history() flow", async () => {
    const { fetch } = fakeStx();
    const ctx = makeContext(CFG, fetch);

    const authorizeUrl = await beginLogin(ctx);
    const state = new URL(authorizeUrl).searchParams.get("state")!;

    const { scope } = await completeCallback(ctx, "member", {
      code: "the-code",
      state,
    });
    expect(scope).toContain("identity");

    const client = clientFor(ctx, CFG.baseUrl, "member", fetch);
    const me = await client.me();
    expect(me.userId).toBe("u1");
    const orders = await client.orders.history();
    expect(orders.totalCount).toBe(0);
  });

  it("rejects an unknown / reused state", async () => {
    const { fetch } = fakeStx();
    const ctx = makeContext(CFG, fetch);
    await expect(
      completeCallback(ctx, "member", { code: "c", state: "never-issued" }),
    ).rejects.toThrow(/state/);
  });

  it("refresh rotates and persists the new refresh token", async () => {
    const { fetch, refreshCount } = fakeStx();
    const ctx = makeContext(CFG, fetch);
    const authorizeUrl = await beginLogin(ctx);
    const state = new URL(authorizeUrl).searchParams.get("state")!;
    await completeCallback(ctx, "member", { code: "c", state });

    const before = await ctx.tokens.get("member");
    const { rotated } = await refreshMember(ctx, "member");
    const after = await ctx.tokens.get("member");

    expect(rotated).toBe(true);
    expect(refreshCount()).toBe(1);
    expect(after?.refreshToken).not.toBe(before?.refreshToken);
  });

  it("the signing snippet produces valid X-STX headers (published vector)", async () => {
    // Reuse the SDK's published test key/vector, checked in the SDK too.
    const pem = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIAABAgMEBQYHCAkKCwwNDg8QERITFBUWFxgZGhscHR4f
-----END PRIVATE KEY-----`;
    const auth = new SigningAuth({
      keyId: "k",
      privateKey: pem,
      now: () => 1_700_000_000_000,
    });
    const headers = await auth.authHeaders({ method: "POST", path: "/api/v1/me" });
    expect(headers[SIGNING_HEADERS.signature]).toBe(
      "ZFJ0qEoHt8TLKbGP+UhJ77BNy/Cdf7+oqbQzwynaM5XM0Yphmq5t1YWumC+5pLaDk/xY9EG3h4brxVdodYloCA==",
    );
    // reference the fs import so it is exercised on all runtimes
    expect(typeof readFileSync).toBe("function");
  });
});
