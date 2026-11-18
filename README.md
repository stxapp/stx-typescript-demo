# STX TypeScript demo

[![Live](https://github.com/stxapp/stx-typescript-demo/actions/workflows/live.yml/badge.svg)](https://github.com/stxapp/stx-typescript-demo/actions/workflows/live.yml) [![CI](https://github.com/stxapp/stx-typescript-demo/actions/workflows/ci.yml/badge.svg)](https://github.com/stxapp/stx-typescript-demo/actions/workflows/ci.yml)

Small, commented scripts that list markets, place and cancel an order (plain, post-only or fill-or-kill), stream live prices and your account, buy and cash out a combo, quote combos as a maker, and read your portfolio on the [STX](https://stxapp.io) exchange, using the [`@stxapp/stx-typescript`](https://www.npmjs.com/package/@stxapp/stx-typescript) SDK.

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

`npm run markets` lists the first five markets that are open and accepting orders and whose event has not started yet, with the best bid (highest) and best offer (lowest) on each. Code: [`examples/markets.ts`](examples/markets.ts).

```text
Manchester United at Como: UEFA MAN @ COMO Draw 1st Half  bid 0.3100  offer 0.3600
Galatasaray at Lille: UEFA GAL @ LILL Draw 1st Half  bid 0.3100  offer 0.3600
Galatasaray at Lille: UEFA GAL @ LILL - GAL in Regulation  bid 0.3100  offer 0.3600
Galatasaray at Lille: UEFA GAL @ LILL - LILL 1st Half  bid 0.3100  offer 0.3600
Manchester United at Como: UEFA MAN @ COMO Draw  bid 0.3100  offer 0.3600

5 upcoming markets shown.
```

Prices are dollars per contract. A bid of `0.3100` on a market whose winning contract pays `1.0000` means a buyer will pay 31 cents for a contract that pays $1 if the first half is a draw, and an offer of `0.3600` means a seller will take 36 cents for it. `-` means nobody is bidding or offering. Some markets pay `100.0000` for a winning contract, so their prices read like `42.0000`. Each market's `max_price` says which.

### Place and cancel an order

`npm run trade` places one buy order for 1 contract, reads it back, then cancels it. Code: [`examples/trade.ts`](examples/trade.ts).

The price is 1% of what a winning contract pays, read from the market's `max_price` (one cent on a $1 contract, `1.00` on a $100 one), and the script only picks a market whose event has not started and where nobody is offering at that price or lower. The order rests on the book and does not trade, and the script cancels it before it exits.

It uses the first such market it finds. To look only at one sport, set `SPORT`, for example `SPORT=Football npm run trade`. `npm run live` reads `SPORT` too, so the two scripts still watch the same market.

```text
Market:  Manchester United at Como: UEFA MAN @ COMO Draw 1st Half
         STXUEFA-26OCT211245MANCOMO-R1DRAWMANCOMO  (a winning contract pays 1.0000)
Placed:  buy 1 @ 0.01  id 75a2dc33-db8d-48ca-9818-551fb8be6fcd  status accepted
Read:    status open  filled 0.00 of 1.00  client id demo-d340766b-4fde-45c6-9f7e-42a8524898c6
Cancel:  75a2dc33-db8d-48ca-9818-551fb8be6fcd  cancelled
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

### Post-only and fill-or-kill orders

`npm run fill-modes` places three 1-contract buys and leaves nothing on the book. Code: [`examples/fill_modes.ts`](examples/fill_modes.ts).

1. Post-only at a price that rests, the same kind of buy as `npm run trade`. A post-only order only ever rests on the book as a maker. The script shows it resting, then cancels it.
2. Post-only at the best offer, where it would trade on arrival. The exchange cancels it with `cancellation_reason` `auto_matching` and nothing trades; `placeOrder` throws `STXPostOnlyWouldMatchException` carrying the cancelled order.
3. Fill-or-kill at the resting price. It fills in full or not at all; with nothing to match, it is cancelled with nothing filled.

```text
Market:     Anaheim Ducks at St. Louis Blues: NHL ANA @ STL
            STXNHL-26NOV202000ANASTL-GAMESTL  (a winning contract pays 1.0000)
Post-only:  buy 1 @ 0.01  id 2b65805b-3584-4f29-adbe-0284c99f982b  status open  fill mode post_only
Cancel:     2b65805b-3584-4f29-adbe-0284c99f982b  cancelled
Cross:      STXNBA-26NOV201930LALDEN-GAMEDEN  best offer 0.47
Refused:    post-only would have matched (auto_matching)  id 7f0c1d2e-4a5b-4c6d-8e9f-0a1b2c3d4e5f  status cancelled  reason auto_matching  filled 0.00
Fill-or-kill: cancelled  reason auto_matching  filled 0.00  id 9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d
```

The exchange decides whether it takes a fill mode. Where a mode is not enabled, `placeOrder` throws `STXNotAvailableException`, nothing is placed, and the script prints `Not here:` and exits 0.

An exchange that does not have fill modes may instead place the order as a normal limit order, without an error. A normal order can trade like any other, so always check `fill_mode` on the order you get back. The script does: it cancels a normal order, and skips steps 2 and 3, since at the best offer a normal order would trade.

```text
Normal:     buy 1 @ 0.01  id 5c4d3e2f-1a0b-4c9d-8e7f-6a5b4c3d2e1f  fill mode normal
            This exchange placed it as a normal limit order: it does not have fill modes.
Cancel:     5c4d3e2f-1a0b-4c9d-8e7f-6a5b4c3d2e1f  cancelled
```

The script also shows the errors for a request blocked before it reaches the exchange: `STXBlockedException` carries a `reason` (`restricted_jurisdiction`, `unusual_network`) and a `reference` to quote to STX support, and is never worth retrying. See [Trading](https://docs.stxapp.io/sdks/typescript/trading/) and [Errors & retries](https://docs.stxapp.io/sdks/typescript/errors-and-retries/).

### Stream prices and your account

`npm run live` opens one WebSocket, streams the order book of the market `npm run trade` uses together with your live account (balance, open orders, fills and positions), and exits after 30 seconds. `npm run live -- 60` streams for 60; the run below used `npm run live -- 20`. Code: [`examples/live.ts`](examples/live.ts).

Run `npm run trade` in a second terminal while it streams to see the order arrive on the book and on your account, and leave both when it is cancelled. Each `[book]` line shows the top of the book, so the one-cent order, below the best bid, arrives as a new push without changing the line:

```text
Watching Manchester United at Como: UEFA MAN @ COMO Draw 1st Half
[book]    best bid 50.00 @ 0.3100  best offer 50.00 @ 0.3600  (starting snapshot)
[book]    best bid 50.00 @ 0.3100  best offer 50.00 @ 0.3600
[account] available 100000.0000  open orders 0  positions 0

Streaming for 20 s. Run npm run trade in another terminal to see an order come and go.

[account] positions 1 updated
[account] order buy 1.00 @ 0.0100  open  filled 0.00
[book]    best bid 50.00 @ 0.3100  best offer 50.00 @ 0.3600
[account] order buy 1.00 @ 0.0100  cancelled  filled 0.00
[account] positions 1 updated
[account] positions 1 updated
[account] order buy 1.00 @ 0.0100  cancelled  filled 0.00
[book]    best bid 50.00 @ 0.3100  best offer 50.00 @ 0.3600

Closed. Open orders now: 0
```

The client signs the connection, sends heartbeats and reconnects for you. The channels and their payloads are described under [WebSockets](https://docs.stxapp.io/sdks/typescript/websockets/).

### Buy and cash out a combo

`npm run combos` buys a small combo as a player and then cashes it out, so the run ends holding nothing. Code: [`examples/combos.ts`](examples/combos.ts). On an exchange without combos, the script says so and exits.

A combo is one market over two or more legs, and it pays only if every leg wins. The script picks two open markets from different events that have not started, asks makers to quote on a stake of `2.00`, prints each quote as it arrives (what you would win on that stake), and accepts the best one at its exact amount. The exchange then places your order on the combo's own market. The script cashes out the same way: it asks makers what they pay for everything you hold, accepts the best quote, and checks your position is back to zero.

It waits up to 20 seconds for each quote and says so if none arrives; `npm run combos -- 60` waits up to 60. Set the stake and number of legs with `STAKE=5 LEGS=3 npm run combos`, and look only at one sport with `SPORT=Football npm run combos`.

```text
Leg 1:   Will the game between the Como and the Manchester United end in a draw in the 1st Half?  (MAN @ COMO 1H)
Leg 2:   Will the game between the Lille and the Galatasaray end in a draw in the 1st Half?  (GAL @ LILL 1H)

Request: 8f483ae3-da6a-4053-9ee1-c54928642e23  stake 2.00
Waiting up to 20 s for a quote...
[quote]  win 15.1400 on a 2.00 stake  (quote 23398056-0099-4888-a2c7-43f53f60e1e9)
Bought:  17.00 @ 0.1167  order ae9761b5-df14-4fca-9f31-da1599bd43f4  (accepted win 15.1400)
         combo 4582dc69-296c-4ce3-911c-5314b00b93f7  Won / Won  (a winning contract pays 1.0000)

Cash out: a6fe1494-c725-4496-aaa7-f41055dbd663  selling 17.00
[quote]  pays 1.7900 for all 17.00  (quote 59103d20-5e4e-407a-9def-3094750bef0f)
Sold:    17.00 @ 0.1052  order d0cc92ce-2478-4311-bd4c-b0ad0675616a  (accepted 1.7900)
Final:   position 0.00 on the combo  open orders 0
```

Quotes are amounts, not prices: the exchange derives the price and size of your order from your stake and the amount you accept. Above, a `2.00` stake against a `15.14` win prices at 2 / (2 + 15.14) = 0.11669, rounded up to the combo's tick: `0.1167`. That buys 17 whole contracts, which pay `17.00` if both legs win. The cash out sold all 17 for the `1.79` the maker quoted, at 1.79 / 17 = 0.10529, rounded down: `0.1052`. [Combos](https://docs.stxapp.io/sdks/typescript/combos/) walks through every call, including the maker side, and [Combo negotiation](https://docs.stxapp.io/websockets/channels/combo-negotiation/) documents the protocol.

### Quote combos as a maker

`npm run combo-maker` joins as a maker and quotes every combo request on the exchange until you press Ctrl-C, printing how each one ends. Code: [`examples/combo_maker.ts`](examples/combo_maker.ts). It needs a `read_write` key.

Each request arrives as `rfq_opened`. On a buy you quote what the player wins, the stake times `WIN_MULTIPLE` (default `9`); on a cash out you quote what you pay for everything the player sells, `CASH_OUT_PRICE` a contract (default `0.08`). Each quote stands for `QUOTE_SECONDS` (default `30`). The script checks that the amount prices inside the request's `max_price` and `tick_size` before it sends it, and skips the request if not. `npm run combo-maker -- 120` stops after 120 seconds instead. `PLAYER` set to a player's `external_id` (every request carries it) quotes only that player's requests, e.g. your own test account's.

This run, on the Ontario demo exchange with `WIN_MULTIPLE=15 CASH_OUT_PRICE=0.12`, quoted a buy and then the player's cash out of the same combo, and won both:

```text
Quoting combos on https://demo.stxapp.ca as a maker.
Buys: win 15x the stake. Cash outs: 0.12 a contract. Each quote stands 30 s. Ctrl-C to stop.

[request]  fd508d3f  buy, stake 2.0000, 2 legs: WSH @ CHA won, LA @ NYR won
[quoted]   fd508d3f  win 30.0000  for 30 s  quote f8f62b4b-f47a-488d-b637-7d3cc273d6d6
[accepted] fd508d3f  quote f8f62b4b-f47a-488d-b637-7d3cc273d6d6
[won]      fd508d3f  order 5ad79179-be99-40c0-9d46-64a1d3773ba4  32.00 @ 0.0625  combo df0489de-8f36-4fde-818e-adeaf038bde3
[closed]   fd508d3f  placed
[request]  22f4ee6f  cash out of 32.00 on combo df0489de
[quoted]   22f4ee6f  pay 3.8400 for 32.00  for 30 s  quote ea87fdb0-f6e0-48fe-892b-c731d819cd04
[accepted] 22f4ee6f  quote ea87fdb0-f6e0-48fe-892b-c731d819cd04
[won]      22f4ee6f  order 7dde1e51-d374-490e-a660-f744325a0f10  32.00 @ 0.1200  combo df0489de-8f36-4fde-818e-adeaf038bde3
[closed]   22f4ee6f  placed
```

`[accepted]` is `quote_accepted`: the player took your quote and the exchange is placing both orders. `[won]` is `placed`, with your order on the combo's market at the same price and size as the player's. When another maker quotes the player more, the player takes theirs and your quote ends with `placed_elsewhere`, as in this run at `WIN_MULTIPLE=3 CASH_OUT_PRICE=0.02`:

```text
[request]  f13eb57b  buy, stake 2.0000, 2 legs: WSH @ CHA won, LA @ NYR won
[quoted]   f13eb57b  win 6.0000  for 30 s  quote 512b95f1-fc31-4b9d-ab5b-0df5946f77ca
[lost]     f13eb57b  quote 512b95f1-fc31-4b9d-ab5b-0df5946f77ca  placed_elsewhere
[closed]   f13eb57b  placed
[request]  82e39fd8  cash out of 32.00 on combo df0489de
[quoted]   82e39fd8  pay 0.6400 for 32.00  for 30 s  quote 70d8814a-ad55-48ba-9a2f-fe60b5d006e5
[lost]     82e39fd8  quote 70d8814a-ad55-48ba-9a2f-fe60b5d006e5  placed_elsewhere
[closed]   82e39fd8  placed
```

A quote can also end `[expired]`, when its `QUOTE_SECONDS` run out and a later quote on the request replaces it, or with the request's own reason, such as `cancelled`. `[closed]` is `rfq_closed`, sent for every request whether you quoted or not. Other makers quote too, so expect to lose some requests. A request your own account opened is refused with `cannot_quote_own_request`. Every socket joined as one account gets the pushes about all of that account's quotes, so run one maker per account. Quotes belong to the connection that placed them: on Ctrl-C, or if the connection drops, they are withdrawn. [Quote combos as a maker](https://docs.stxapp.io/websockets/combo-maker/) covers the maker side in every language, and [Combo negotiation](https://docs.stxapp.io/websockets/channels/combo-negotiation/) documents each frame.

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

Everything above trades your own account with your own API key. OAuth is only needed when you build an app that acts on behalf of other STX members, with their consent. See [OAuth with the TypeScript SDK](https://docs.stxapp.io/isv/typescript-sdk/) and the [ISV guide](https://docs.stxapp.io/isv/), and the example app [stx-isv-demo](https://github.com/stxapp/stx-isv-demo).

## Documentation

- [TypeScript SDK guide](https://docs.stxapp.io/sdks/typescript/)
- [API reference](https://docs.stxapp.io/sdks/typescript/reference/)
- [Support](https://docs.stxapp.io/support/)

MIT license. Use of the STX API and exchange is subject to the STX terms of use and privacy policy: United States ([terms of use](https://stxapp.io/legal/terms-of-use.pdf), [privacy policy](https://stxapp.io/legal/privacy-policy.pdf)), Ontario ([terms of use](https://stxapp.ca/legal/terms-of-use.pdf), [privacy policy](https://stxapp.ca/legal/privacy-policy.pdf)).
