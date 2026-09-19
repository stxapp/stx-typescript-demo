// A minimal HTTP server (node:http, no framework) that drives the ISV OAuth
// path end to end against STX. Runs on Node (`npm start`) or Bun
// (`npm run start:bun`). This is a reference, not a product — one demo member,
// in-memory stores, plain responses.
//
//   /            → links
//   /login       → redirect to STX consent (PKCE + state)
//   /callback    → exchange the code, store tokens, show the granted scope
//   /me /balance /orders → scoped calls for the member
//   /refresh     → rotate the refresh token
//   /revoke      → revoke + drop the local link

import { createServer } from "node:http";
import { config, DEMO_MEMBER } from "./config.ts";
import {
  makeContext,
  beginLogin,
  completeCallback,
  clientFor,
  refreshMember,
  revokeMember,
} from "./flows.ts";
import { StxAuthError, StxGrantRevokedError } from "stx-typescript";

const ctx = makeContext(config);

function json(res: import("node:http").ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body, null, 2));
}

function html(res: import("node:http").ServerResponse, body: string): void {
  res.writeHead(200, { "content-type": "text/html" });
  res.end(body);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${config.port}`);
  try {
    switch (url.pathname) {
      case "/": {
        html(
          res,
          `<h1>stx-typescript — ISV OAuth demo</h1>
           <p>Connected client: <code>${config.clientId}</code> @ <code>${config.baseUrl}</code></p>
           <ul>
             <li><a href="/login">1. Connect an STX account (consent)</a></li>
             <li><a href="/me">2. me()</a> · <a href="/balance">balance()</a> · <a href="/orders">orders.history()</a></li>
             <li><a href="/refresh">3. refresh</a> · <a href="/revoke">4. revoke</a></li>
           </ul>`,
        );
        return;
      }

      case "/login": {
        const authorizeUrl = await beginLogin(ctx);
        res.writeHead(302, { location: authorizeUrl });
        res.end();
        return;
      }

      case "/callback": {
        const { scope } = await completeCallback(ctx, DEMO_MEMBER, {
          code: url.searchParams.get("code") ?? undefined,
          state: url.searchParams.get("state") ?? undefined,
          error: url.searchParams.get("error") ?? undefined,
        });
        html(
          res,
          `<h1>Connected ✔</h1><p>Granted scope: <code>${scope ?? "(unknown)"}</code></p>
           <p><a href="/me">me()</a> · <a href="/balance">balance()</a> · <a href="/orders">orders.history()</a></p>`,
        );
        return;
      }

      case "/me": {
        const client = clientFor(ctx, config.baseUrl, DEMO_MEMBER);
        json(res, 200, await client.me());
        return;
      }

      case "/balance": {
        const client = clientFor(ctx, config.baseUrl, DEMO_MEMBER);
        json(res, 200, await client.account.balance());
        return;
      }

      case "/orders": {
        const client = clientFor(ctx, config.baseUrl, DEMO_MEMBER);
        json(res, 200, await client.orders.history({ pagination: { page: 1, limit: 25 } }));
        return;
      }

      case "/refresh": {
        json(res, 200, await refreshMember(ctx, DEMO_MEMBER));
        return;
      }

      case "/revoke": {
        await revokeMember(ctx, DEMO_MEMBER);
        json(res, 200, { revoked: true });
        return;
      }

      default:
        json(res, 404, { error: "not found" });
    }
  } catch (err) {
    if (err instanceof StxGrantRevokedError) {
      json(res, 401, { error: "grant_revoked", detail: err.message, hint: "reconnect at /login" });
    } else if (err instanceof StxAuthError) {
      json(res, 401, { error: "unauthorized", detail: err.message });
    } else {
      json(res, 500, { error: String(err instanceof Error ? err.message : err) });
    }
  }
});

server.listen(config.port, () => {
  console.log(`ISV OAuth demo on http://localhost:${config.port}`);
  console.log(`→ open http://localhost:${config.port}/login to connect an STX account`);
});
