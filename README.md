# STX TypeScript demo

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

Each script is in [`examples/`](examples/) and runs with one command. The sample output below comes from a demo exchange; yours will show the markets open when you run it.

### List markets

`npm run markets` lists markets that are open and accepting orders, with the best bid and offer on each. Code: [`examples/markets.ts`](examples/markets.ts).

```text
New York Yankees at San Diego Padres: Padres First Run  bid -  offer -
New York Yankees at San Diego Padres: Yankees First Run  bid 0.4200  offer -
Norfolk State Spartans at Old Dominion Monarchs: Old Dominion Score Last  bid -  offer -
Norfolk State Spartans at Old Dominion Monarchs: Norfolk St Score Last  bid -  offer -
Washington Mystics at Atlanta Dream: WNBA Playoff WSH @ ATL  bid -  offer -

5 markets shown, more available.
```

Prices are dollars per contract. A bid of `0.4200` on a market whose winning contract pays `1.0000` means a buyer will pay 42 cents for a contract that pays $1 if the Yankees score first. `-` means nobody is bidding or offering.

### Place and cancel an order

`npm run trade` places one buy order for 1 contract, reads it back, then cancels it. Code: [`examples/trade.ts`](examples/trade.ts).

The price is 1% of what a winning contract pays, read from the market's `max_price` (one cent on a $1 contract), and the script only picks a market whose event has not started and where nobody is offering at that price or lower. The order rests on the book and does not trade, and the script cancels it before it exits.

```text
Market:  Dallas Wings at Golden State Valkyries: WNBA Playoff DAL @ GS
         STXWNBA-26SEP272100DALGS-GAMEGS  (a winning contract pays 1.0000)
Placed:  buy 1 @ 0.01  id bfb36d01-e79c-4841-86fa-26d68ffe0f4b  status accepted
Read:    status open  filled 0.00 of 1.00  client id demo-97c7ef28-43a7-45c9-86ff-b2bae6456992
Cancel:  bfb36d01-e79c-4841-86fa-26d68ffe0f4b  cancelled
Final:   status cancelled  filled 0.00
```

The order carries a `clientOrderId`, your own id for it. If a call to place an order fails without an answer, look the order up by that id before placing it again; [Trading](https://docs.stxapp.io/sdks/typescript/trading/) explains why.

### Stream prices and your account

`npm run live` opens one WebSocket, streams the order book of the market `npm run trade` uses together with your live account (balance, open orders, fills and positions), and exits after 30 seconds. `npm run live -- 60` streams for 60. Code: [`examples/live.ts`](examples/live.ts).

Run `npm run trade` in a second terminal while it streams to see the order arrive on the book and on your account, and leave both when it is cancelled:

```text
Watching Dallas Wings at Golden State Valkyries: WNBA Playoff DAL @ GS
[book]    best bid -  best offer -  (starting snapshot)
[account] available 10019999.6400  open orders 0  positions 0

Streaming for 30 s. Run npm run trade in another terminal to see an order come and go.

[account] positions 1 updated
[account] order buy 1.00 @ 0.0100  open  filled 0.00
[account] balance available 10019999.6400
[account] order buy 1.00 @ 0.0100  cancelled  filled 0.00
[account] positions 1 updated
[book]    best bid 1.00 @ 0.0100  best offer -
[account] positions 1 updated
[account] order buy 1.00 @ 0.0100  cancelled  filled 0.00
[book]    best bid -  best offer -
[account] balance available 10019999.6400

Closed. Open orders now: 0
```

The client signs the connection, sends heartbeats and reconnects for you. The channels and their payloads are described under [WebSockets](https://docs.stxapp.io/sdks/typescript/websockets/).

### Read your portfolio

`npm run portfolio` prints your key's scope, balance, positions, open orders and recent fills. Code: [`examples/portfolio.ts`](examples/portfolio.ts).

```text
Key scope: read_write

Balance: not available on this exchange yet; npm run live shows it from the WebSocket.
Positions: not available on this exchange yet; npm run live shows it from the WebSocket.

Open orders: 0

Recent fills: 5
  ee99086e-99b0-4f95-99bc-c93fd1a50118  buy 2.00 @ 0.3600
  5635f7a3-4ef5-417d-9123-b05e11d4307f  buy 1.00 @ 0.4500
  8868999f-f0dc-4278-9b95-2421b50d2c1f  buy 1.00 @ 0.4500
  e82a9a02-fda1-4cc4-ba66-d154581ae290  buy 5.00 @ 0.1000
  7a6e8526-8691-4efa-88e0-8eb7e91fe9c1  sell 1.00 @ 0.6000
```

Reading the balance and positions this way is not yet available on every exchange. Where it is not, the SDK throws `STXNotFoundException` and the script says so; the live account view in `npm run live` has both.

## Tests

```bash
npm run typecheck
npm test
```

The tests stub `fetch`, so they need no API key and make no network calls.

## Building an app for other STX members?

Everything above trades your own account with your own API key. OAuth is only needed when you build an app that acts on behalf of other STX members, with their consent. See [Apps for STX members (OAuth)](https://docs.stxapp.io/sdks/typescript/oauth/) and the [ISV guide](https://docs.stxapp.io/isv/), and the example app [stx-isv-demo](https://github.com/stxapp/stx-isv-demo).

## Documentation

- [TypeScript SDK guide](https://docs.stxapp.io/sdks/typescript/)
- [API reference](https://docs.stxapp.io/sdks/typescript/reference/)
- [Support](https://docs.stxapp.io/support/)

MIT license. Use of the STX API and exchange is subject to the STX terms of use and privacy policy: United States ([terms of use](https://config.stxapp.io/us/terms_of_use.pdf), [privacy policy](https://config.stxapp.io/us/privacy_policy.pdf)), Ontario ([terms of use](https://config.stxapp.ca/on/terms-of-use.pdf), [privacy policy](https://config.stxapp.ca/on/privacy-policy.pdf)).
