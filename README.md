# stx-typescript-demo

A small, standalone reference app that **consumes [`stx-typescript`](../tssdk)** —
the TypeScript equivalent of `stx-csharp-demo` / `stx-python-demo`. It walks the
**ISV OAuth path end to end**, and includes a short **direct-trader signing**
snippet so both auth modes are shown.

It links the SDK locally (`"stx-typescript": "file:../tssdk"`), so build the SDK
first (`cd ../tssdk && npm install && npm run build`).

## Layout

```
src/
  config.ts        env-driven config (+ a tiny .env loader, no dependency)
  flows.ts         the OAuth flow, isolated from HTTP so it is unit-testable
  server.ts        minimal node:http server driving the flow (no framework)
  signing-demo.ts  the OTHER auth mode: an Ed25519 signing-key call
test/
  wiring.test.ts   non-interactive tests (mocked STX): authorize URL, callback →
                   token exchange → scoped me()/orders, state reuse, refresh
                   rotation, and signing headers
```

## Run it (ISV OAuth, against the preview sandbox)

```bash
npm install
cp .env.example .env      # pre-filled for the sandbox "Heater" client
npm start                 # Node 18+ (native TS strip).  Bun: npm run start:bun
# → open http://localhost:8787/login
```

The sandbox client is registered for `http://localhost:8787/callback`, so keep
`PORT=8787` (or register a matching redirect URI).

Default `.env` values:

| Var | Value |
| --- | --- |
| `STX_BASE_URL` | `https://sx-12476.preview.sportsxapp.com` |
| `CLIENT_ID` | `stx_client_sandbox_heater` |
| `CLIENT_SECRET` | `stx_secret_sandbox_heater_do_not_use_in_prod` |
| `REDIRECT_URI` | `http://localhost:8787/callback` |

### The flow

| Route | What it does |
| --- | --- |
| `GET /login` | builds a PKCE + `state` authorize URL and redirects to STX consent |
| `GET /callback` | verifies `state`, exchanges the code, stores tokens, shows granted scope |
| `GET /me` `/balance` `/orders` | scoped calls via the SDK's auto-refreshing session adapter |
| `GET /refresh` | manual refresh (rotates the refresh token) |
| `GET /revoke` | revokes the grant and drops the local link |

The browser-consent step needs a real STX member, so the full end-to-end run is
interactive (a human signs in at `/login`). Everything up to and after that
redirect is covered by the tests without a live pod.

## Run it (direct-trader signing snippet)

```bash
# add to .env:
#   STX_KEY_ID=<your key id>
#   STX_PRIVATE_KEY_PATH=./stx-key.pem   (PKCS#8 Ed25519)
npm run signing        # Bun: npm run signing:bun
```

It authenticates with a signing key (no OAuth, no member) and calls `me()`,
`account.balance()` and a page of open `markets()`.

## Test / typecheck

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest — 5 non-interactive wiring tests
```

The tests inject a fake `fetch` (a stub STX serving `/oauth/token` and
`/api/graphql`), so they run offline and assert the wiring: authorize-URL shape,
code exchange, that scoped calls carry the `Bearer` token, single-use `state`,
and refresh-token rotation.
