// The ISV OAuth flow, isolated from HTTP routing so it is unit-testable without
// a browser or a live server. The HTTP server (server.ts) and the wiring tests
// both drive these functions.

import {
  OAuthClient,
  StxClient,
  MemoryTokenStore,
  tokenSetToStored,
  type TokenStore,
  type FetchLike,
} from "stx-typescript";

/** Transient PKCE/state store: `state -> codeVerifier`, single-use. */
export interface FlowStore {
  save(state: string, codeVerifier: string): void;
  take(state: string): string | null;
}

export class MemoryFlowStore implements FlowStore {
  private readonly map = new Map<string, string>();
  save(state: string, codeVerifier: string): void {
    this.map.set(state, codeVerifier);
  }
  take(state: string): string | null {
    const v = this.map.get(state) ?? null;
    if (v !== null) this.map.delete(state);
    return v;
  }
}

export interface DemoContext {
  oauth: OAuthClient;
  tokens: TokenStore;
  flows: FlowStore;
}

/** Build the demo context from config. `fetch` is injectable for tests. */
export function makeContext(
  cfg: {
    baseUrl: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    scopes: string;
  },
  fetch?: FetchLike,
): DemoContext {
  return {
    oauth: new OAuthClient({
      baseUrl: cfg.baseUrl,
      clientId: cfg.clientId,
      clientSecret: cfg.clientSecret,
      redirectUri: cfg.redirectUri,
      scope: cfg.scopes,
      fetch,
    }),
    tokens: new MemoryTokenStore(),
    flows: new MemoryFlowStore(),
  };
}

/** Step 1–2: prepare PKCE + state and return the authorize URL to redirect to. */
export async function beginLogin(ctx: DemoContext): Promise<string> {
  const { url, state, codeVerifier } = await ctx.oauth.createAuthorization();
  ctx.flows.save(state, codeVerifier);
  return url;
}

/** Step 3–4: verify state, exchange the code, and persist the member's tokens. */
export async function completeCallback(
  ctx: DemoContext,
  memberKey: string,
  params: { code?: string; state?: string; error?: string },
): Promise<{ scope?: string }> {
  if (params.error) throw new Error(`authorization denied: ${params.error}`);
  if (!params.code || !params.state) throw new Error("missing code/state");

  const codeVerifier = ctx.flows.take(params.state);
  if (codeVerifier === null) throw new Error("unknown or reused state");

  const set = await ctx.oauth.exchangeCode({ code: params.code, codeVerifier });
  await ctx.tokens.set(memberKey, tokenSetToStored(set));
  return { scope: set.scope };
}

/** A member-scoped SDK client backed by the store's auto-refreshing session. */
export function clientFor(
  ctx: DemoContext,
  baseUrl: string,
  memberKey: string,
  fetch?: FetchLike,
): StxClient {
  return new StxClient({
    baseUrl,
    auth: ctx.oauth.session(ctx.tokens, memberKey),
    fetch,
  });
}

/** Step: manual refresh (rotation persisted by the session adapter on next use). */
export async function refreshMember(
  ctx: DemoContext,
  memberKey: string,
): Promise<{ rotated: boolean }> {
  const stored = await ctx.tokens.get(memberKey);
  if (!stored?.refreshToken) throw new Error("no refresh token for member");
  const set = await ctx.oauth.refresh(stored.refreshToken);
  await ctx.tokens.set(memberKey, tokenSetToStored(set));
  return { rotated: set.refreshToken !== stored.refreshToken };
}

/** Step: revoke on sign-out and drop the local tokens. */
export async function revokeMember(
  ctx: DemoContext,
  memberKey: string,
): Promise<void> {
  const stored = await ctx.tokens.get(memberKey);
  if (stored?.accessToken) await ctx.oauth.revoke(stored.accessToken);
  await ctx.tokens.delete(memberKey);
}
