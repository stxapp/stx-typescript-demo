# STX TypeScript demo

[![Live](https://github.com/stxapp/stx-typescript-demo/actions/workflows/live.yml/badge.svg)](https://github.com/stxapp/stx-typescript-demo/actions/workflows/live.yml) [![CI](https://github.com/stxapp/stx-typescript-demo/actions/workflows/ci.yml/badge.svg)](https://github.com/stxapp/stx-typescript-demo/actions/workflows/ci.yml)

Small, commented scripts that list markets, place and cancel an order, stream live prices and your account, and read your portfolio on the [STX](https://stxapp.io) exchange, using the [`@stxapp/stx-typescript`](https://www.npmjs.com/package/@stxapp/stx-typescript) SDK.

## Before you start

- Node.js 18 or later. The examples also run under Bun, for example `bun examples/markets.ts`.
- An API key for the STX exchange you are building against. [Environments](https://docs.stxapp.io/environments/) lists the exchanges and where to get a key. Start on a demo exchange. Placing orders needs a `read_write` key.

## Setup

```bash
git clone https://github.com/stxapp/stx-typescript-demo.git
cd stx-typescript-demo
npm install
```

Give the scripts your API key in one of two ways. [Authentication](https://docs.stxapp.io/sdks/typescript/authentication/) covers both in full.

A profile in `~/.stx/credentials`, with the region and env of your exchange from [Environments](https://docs.stxapp.io/environments/):

```ini
[default]
region   = us
env      = demo
key_id   = your-key-id
key_file = ~/.stx/stx-key.pem
```

To keep several profiles, name each section and pick one with `STX_PROFILE`, for example `STX_PROFILE=my-demo npm run markets`.

Or environment variables:

```bash
export STX_REGION=us STX_ENV=demo
export STX_KEY_ID=your-key-id
export STX_PRIVATE_KEY=~/.stx/stx-key.pem   # a path, or the PEM text
```

The scripts never print your key.

## Examples

Each script is in [`examples/`](examples/) and runs with one command. The sample output below comes from the US demo exchange (`region = us`, `env = demo`), and from the Ontario demo exchange (`region = ontario`, `env = demo`) where noted. Yours will show the markets open when you run it.

### List markets

`npm run markets` lists markets that are open and accepting orders, with the best bid and offer on each. Code: [`examples/markets.ts`](examples/markets.ts).

```text
New York Yankees at San Diego Padres: Padres First Run  bid -  offer -
New York Yankees at San Diego Padres: Yankees First Run  bid 0.4200  offer -
Norfolk State Spartans at Old Dominion Monarchs: Old Dominion Score Last  bid -  offer -
Norfolk State Spartans at Old Dominion Monarchs: Norfolk St Score Last  bid -  offer -
Philadelphia Eagles at Chicago Bears: NFL - Week 3 PHI @ CHI  bid -  offer -

5 markets shown, more available.
```

Prices are dollars per contract. A bid of `0.4200` on a market whose winning contract pays `1.0000` means a buyer will pay 42 cents for a contract that pays $1 if the Yankees score first. `-` means nobody is bidding or offering. Some markets pay `100.0000` for a winning contract, so their prices read like `42.0000`. Each market's `max_price` says which.

### Place and cancel an order

`npm run trade` places one buy order for 1 contract, reads it back, then cancels it. Code: [`examples/trade.ts`](examples/trade.ts).

The price is 1% of what a winning contract pays, read from the market's `max_price` (one cent on a $1 contract, `1.00` on a $100 one), and the script only picks a market whose event has not started and where nobody is offering at that price or lower. The order rests on the book and does not trade, and the script cancels it before it exits.

It uses the first such market it finds. To look only at one sport, set `SPORT`, for example `SPORT=Football npm run trade`. `npm run live` reads `SPORT` too, so the two scripts still watch the same market.

```text
Market:  Philadelphia Eagles at Chicago Bears: NFL - Week 3 PHI @ CHI
         STXNFL-26SEP282015PHICHI-GAMECHI  (a winning contract pays 1.0000)
Placed:  buy 1 @ 0.01  id 34ac306f-bfe3-4431-9499-2fe0b7ffe283  status accepted
Read:    status open  filled 0.00 of 1.00  client id demo-4553bc76-afd2-4e58-b3a3-138b7301312e
Cancel:  34ac306f-bfe3-4431-9499-2fe0b7ffe283  cancelled
Final:   status cancelled  filled 0.00
```

The same script on the Ontario demo exchange, run as `SPORT=Football npm run trade`:

```text
Market:  Philadelphia Eagles at Chicago Bears: M. Lemon 26.5 Rec YDS
         STXNFL-26SEP282015PHICHI-RECYDSCHIMLEMON545861-26.5  (a winning contract pays 1.0000)
Placed:  buy 1 @ 0.01  id 8fb3cc5e-f8bd-42dd-af55-732cd7d044ae  status accepted
Read:    status open  filled 0.00 of 1.00  client id demo-cf3be6cb-71f8-4cc0-8533-3c832651acbb
Cancel:  8fb3cc5e-f8bd-42dd-af55-732cd7d044ae  cancelled
Final:   status cancelled  filled 0.00
```

The order carries a `clientOrderId`, your own id for it. If a call to place an order fails without an answer, look the order up by that id before placing it again; [Trading](https://docs.stxapp.io/sdks/typescript/trading/) explains why. The script does that lookup before it cancels, and it cancels whatever happens after the order is sent, so it never leaves an order on the book. It exits non-zero if the order is refused or does not end cancelled.

### Stream prices and your account

`npm run live` opens one WebSocket, streams the order book of the market `npm run trade` uses together with your live account (balance, open orders, fills and positions), and exits after 30 seconds. `npm run live -- 60` streams for 60; the run below used `npm run live -- 25`. Code: [`examples/live.ts`](examples/live.ts).

Run `npm run trade` in a second terminal while it streams to see the order arrive on the book and on your account, and leave both when it is cancelled:

```text
Watching Philadelphia Eagles at Chicago Bears: NFL - Week 3 PHI @ CHI
[book]    best bid -  best offer -  (starting snapshot)
[account] available 10019999.6400  open orders 0  positions 0

Streaming for 25 s. Run npm run trade in another terminal to see an order come and go.

[account] positions 1 updated
[account] order buy 1.00 @ 0.0100  open  filled 0.00
[account] order buy 1.00 @ 0.0100  cancelled  filled 0.00
[account] positions 1 updated
[book]    best bid 1.00 @ 0.0100  best offer -
[account] positions 1 updated
[account] order buy 1.00 @ 0.0100  cancelled  filled 0.00
[book]    best bid -  best offer -

Closed. Open orders now: 0
```

The client signs the connection, sends heartbeats and reconnects for you. The channels and their payloads are described under [WebSockets](https://docs.stxapp.io/sdks/typescript/websockets/).

### Read your portfolio

`npm run portfolio` prints your key's scope, balance, open positions, open orders and recent fills. Code: [`examples/portfolio.ts`](examples/portfolio.ts). This run is from the Ontario demo exchange.

```text
Key scope: read_write

Balance: 2000030.2400  available 1999809.2400

Open positions: 2
  7bc6876f-2c29-41c0-b8f5-c19717e380e0  11.00
  affabdfe-fd72-44c0-88a9-32245c8030bb  1.00

Open orders: 0

Recent fills: 5
  03b72898-2652-4ab2-a6d8-874e070cb215  buy 2.00 @ 0.5000
  79218d15-841b-4873-91be-fed5569c6b62  buy 2.00 @ 0.5500
  5c580312-3dc1-4f9e-8fa4-b3620f7006bb  buy 2.00 @ 0.4600
  e4ce8faa-e2e9-4787-ac0c-d4cc43374205  buy 2.00 @ 0.5000
  4ecd1451-7b00-4049-9ab5-e164031ef92e  buy 2.00 @ 0.5500
```

`positions()` also returns markets you have traded out of, with a position of `0.00`; the script leaves those out. `npm run live` shows the same balance and positions as they change.

## Tests

```bash
npm run typecheck
npm test
```

The tests stub `fetch`, so they need no API key and make no network calls.

The [Live](.github/workflows/live.yml) workflow also runs every example against the US and Ontario demo exchanges on each push to `main` and once a day.

## Building an app for other STX members?

Everything above trades your own account with your own API key. OAuth is only needed when you build an app that acts on behalf of other STX members, with their consent. See [Apps for STX members (OAuth)](https://docs.stxapp.io/sdks/typescript/oauth/) and the [ISV guide](https://docs.stxapp.io/isv/), and the example app [stx-isv-demo](https://github.com/stxapp/stx-isv-demo).

## Documentation

- [TypeScript SDK guide](https://docs.stxapp.io/sdks/typescript/)
- [API reference](https://docs.stxapp.io/sdks/typescript/reference/)
- [Support](https://docs.stxapp.io/support/)

MIT license. Use of the STX API and exchange is subject to the STX terms of use and privacy policy: United States ([terms of use](https://config.stxapp.io/us/terms_of_use.pdf), [privacy policy](https://config.stxapp.io/us/privacy_policy.pdf)), Ontario ([terms of use](https://config.stxapp.ca/on/terms-of-use.pdf), [privacy policy](https://config.stxapp.ca/on/privacy-policy.pdf)).
