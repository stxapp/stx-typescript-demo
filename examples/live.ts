// Stream a market's order book and your live account over one WebSocket, then exit.
//
// It watches the same market that `npm run trade` uses, so running the trade
// example in a second terminal shows the order arriving on both streams.
//
// Run: npm run live            (streams for 30 seconds)
//      npm run live -- 60      (streams for 60 seconds)
//      SPORT=Football npm run live   (watch a market in that sport, as trade does)

import { STX, type AccountChange } from "@stxapp/stx-typescript";
import { findRestingBuy } from "../src/helpers.ts";

const seconds = Number(process.argv[2] ?? 30);
const client = new STX();

const found = await findRestingBuy(client, { sport: process.env.SPORT });
if (!found) {
  console.log("No open market to watch right now.");
  process.exit(0);
}
const { market } = found;
const marketId = market.market_id!;

type Level = { price?: string | null; quantity?: string | null };
const top = (levels?: Level[] | null) => (levels?.[0] ? `${levels[0].quantity} @ ${levels[0].price}` : "-");

console.log(`Watching ${market.event_title}: ${market.title}`);
console.log(`[book]    best bid ${top(market.bids)}  best offer ${top(market.offers)}  (starting snapshot)`);

// One signed socket carries every channel. The client sends heartbeats and reconnects for you.
const ws = await client.websocket().connect();

// The order book channel pushes the market's whole book each time it changes.
await ws.orderbook([marketId], {
  onMessage: (msg) => {
    if (msg.event === "book") console.log(`[book]    best bid ${top(msg.payload.bids)}  best offer ${top(msg.payload.offers)}`);
  },
});

// One line per account update. The payloads are documented per channel on docs.stxapp.io.
function describe(change: AccountChange): string {
  const p = change.payload;
  switch (change.kind) {
    case "orders":
      return `order ${p.action} ${p.quantity} @ ${p.price}  ${p.status}  filled ${p.filled}`;
    case "fills":
      return `fill ${p.action} ${p.filled} @ ${p.price}`;
    case "balance":
      return `balance available ${p.available_balance}`;
    case "positions":
      return `positions ${p.positions?.length ?? 0} updated`;
    default:
      return `${change.kind} ${change.event}`;
  }
}

// The live account view keeps your balance, open orders, fills and positions current.
// It resolves once the starting snapshot of each is in; onChange then reports every update.
const view = await ws.accountView({
  onChange: (change) => {
    if (!change.snapshot) console.log(`[account] ${describe(change)}`);
  },
});
console.log(`[account] available ${view.balance?.available_balance ?? "-"}  open orders ${view.openOrders.length}  positions ${view.positions.length}`);

console.log(`\nStreaming for ${seconds} s. Run npm run trade in another terminal to see an order come and go.\n`);
await new Promise((resolve) => setTimeout(resolve, seconds * 1000));

await ws.close();
console.log(`\nClosed. Open orders now: ${view.openOrders.length}`);
