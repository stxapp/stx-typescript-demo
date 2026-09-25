# stx-typescript-demo

Runnable TypeScript examples for the **STX TypeScript SDK**, [`@stxapp/stx-typescript`](https://docs.stxapp.io/sdks/typescript/). Each example is one small file you can run with `npx tsx` and copy as the starting point for your own bot, backend or research code: browsing markets, streaming prices, keeping a live view of your account, and placing and cancelling orders.

## Prerequisites

- Node.js 18 or newer
- An account on an STX demo exchange and an API key for it. The demo exchanges use no real money. [Authentication](https://docs.stxapp.io/api/authentication/) shows how to create a key; [Environments](https://docs.stxapp.io/environments/) lists the exchanges.

## Install

```bash
git clone https://github.com/stxapp/stx-typescript-demo.git
cd stx-typescript-demo
npm install
```

`package.json` depends on `@stxapp/stx-typescript` `^0.4.2`. If that version is not on npm yet and you have the release tarball, install from it instead of the plain `npm install`:

```bash
npm install --no-save "@stxapp/stx-typescript@file:/path/to/stx-typescript-0.4.2.tgz"
```

## Set up your API key

Save the private key you downloaded to a file such as `~/.stx/us-demo.pem`, then add a profile for it to `~/.stx/credentials`:

```ini
[us-demo]
region   = us
env      = demo
key_id   = your-key-id
key_file = ~/.stx/us-demo.pem
```

For the Ontario demo, use `region = ontario`. A key works on one exchange only, so keep one profile per exchange. Every example takes `--profile <name>`. Without it, the SDK reads `STX_KEY_ID`, `STX_PRIVATE_KEY` (a path or the PEM text), `STX_REGION` and `STX_ENV` from the environment, or `STX_PROFILE`. More in the SDK's [authentication guide](https://docs.stxapp.io/sdks/typescript/authentication/).

There is no login call: the SDK signs every request, and the WebSocket handshake, with your key.

## Run the examples

```bash
npx tsx examples/quickstart.ts --profile us-demo
```

| Example | What it shows |
|---|---|
| [`quickstart.ts`](./examples/quickstart.ts) | Confirm the key with `me()`, list open markets, place a 1-cent buy and cancel it. `--read-only` skips the order. |
| [`market-data.ts`](./examples/market-data.ts) | Markets one page at a time and across all pages, events found by title (`--search "Yankees"`), and the book for one market (`--market <id>`). Read-only. |
| [`live-prices.ts`](./examples/live-prices.ts) | The book for one market from its WebSocket join, then `orderbook` and `ticker` pushes read with `for await`. `--seconds N` sets the window; `--nudge` places and cancels a 1-cent order so the book moves while you watch. |
| [`account-view.ts`](./examples/account-view.ts) | `ws.accountView()`: balance, open orders, fills and positions kept current from the socket. `--place-order` places and cancels a 1-cent order so you can see the changes arrive. |
| [`trading.ts`](./examples/trading.ts) | A limit order with a `clientOrderId`, a `good_till_time` order (converting a `Date` to microseconds), a rejected order, and cancel-on-disconnect armed on the `orders` channel. Cancels everything it placed. `--market-order` adds a market order. |
| [`portfolio.ts`](./examples/portfolio.ts) | Balance, positions, fills one page at a time with the cursor, and settlements across pages with `iterSettlements`. Read-only. |

Each example is also an npm script: `npm run trading -- --profile us-demo`.

The examples that place orders (`quickstart.ts`, `trading.ts`, and `live-prices.ts` and `account-view.ts` with their flags) need a `read_write` key and only run against a demo exchange (`demo.stxapp.io` or `demo.stxapp.ca`). Their orders are 1-cent, 1-contract buys that will not fill, and each is cancelled before the example exits. The one exception is `--market-order`, which can fill against the book.

The demo exchanges can be quiet, so a streaming window with few messages is normal.

[`examples/_shared.ts`](./examples/_shared.ts) holds the few helpers the examples share: building the client from `--profile`, the demo-only guard, and finding a market that accepts orders. Copy it alongside any example you take out of this repo.

## Good to know

- **Amounts are strings.** Prices, balances and quantities come back as decimal strings exactly as the API sends them (`"0.5600"`), and orders take strings: `{ price: "0.01", quantity: "1" }`. Use a decimal library for arithmetic.
- **Response fields are snake_case** (`order.client_order_id`); method options are camelCase (`clientOrderId`).
- **Expiration times are microseconds.** `Date.getTime()` returns milliseconds, so multiply by 1000.

## Typecheck

```bash
npm run typecheck
```

CI runs the typecheck on Node 18, 20 and 22. When the repository has the `DEMO_KEY_ID` and `DEMO_PRIVATE_KEY` secrets (the latter holding the PEM text), it also runs `quickstart.ts` against the US demo exchange; without them that step is skipped. No credentials are stored in the repo.

## Docs

Full SDK documentation: [docs.stxapp.io/sdks/typescript](https://docs.stxapp.io/sdks/typescript/). Start there, then read the trading and WebSocket guides.

## License

MIT. See [LICENSE](./LICENSE).
