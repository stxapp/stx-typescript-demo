// Stream prices over the WebSocket: the book for one market from its join
// reply, then order book and ticker pushes read with `for await`.
//
// Run: npx tsx examples/live-prices.ts --profile us-demo [--seconds 20] [--nudge]
//
// The demo exchange can be quiet, so a window with few messages is normal.
// --nudge (demo exchange and a read_write key only) places a 1-cent buy that
// will not fill and cancels it, so the book for that market moves while you
// watch.

import type { Channel } from "@stxapp/stx-typescript";

import { findScheduledMarket, flag, makeClient, requireDemo, requireReadWrite, seconds } from "./_shared.js";

const client = makeClient();
const listenMs = seconds(20) * 1000;

// Five open markets whose events have not started, the first one of them the
// market --nudge trades on.
const first = await findScheduledMarket(client);
const page = await client.markets({ status: "open", limit: 5 });
const marketIds = [
  ...new Set([first?.market_id, ...page.items.map((m) => m.market_id)].filter((id): id is string => Boolean(id))),
].slice(0, 5);
const symbols = new Map([first, ...page.items].map((m) => [m?.market_id, m?.symbol]));
const name = (id: string) => symbols.get(id) ?? id;
const [focusId] = marketIds;
if (!focusId) {
  console.log("No open markets on this exchange.");
  process.exit(0);
}

type Level = { price?: string; quantity?: string };
const top = (levels: Level[] | undefined) => (levels?.[0] ? `${levels[0].quantity} @ ${levels[0].price}` : "-");

const ws = await client.websocket().connect();
try {
  // market:<id> answers the join with the whole market, including its book.
  const one = await ws.market(focusId);
  console.log(`${one.reply.symbol}: best bid ${top(one.reply.bids)}  best offer ${top(one.reply.offers)}`);
  await one.leave();

  const book = await ws.orderbook(marketIds);
  const ticker = await ws.ticker();
  console.log(`\nStreaming ${marketIds.length} books and the ticker for ${listenMs / 1000}s...`);

  const deadline = Date.now() + listenMs;
  const reading = Promise.all([
    read(book, deadline, (p) => `[book]   ${name(p.market_id)}  best bid ${top(p.bids)}  best offer ${top(p.offers)}`),
    read(ticker, deadline, (p) => `[ticker] ${name(p.market_id)}  ${JSON.stringify(p).slice(0, 120)}`),
  ]);

  if (flag("nudge")) await nudge(focusId);
  await reading;
} finally {
  await ws.close();
}

/** Print what arrives on `channel` until the deadline, then leave it. Leaving ends the `for await`. */
async function read(channel: Channel, deadline: number, show: (payload: any) => string): Promise<void> {
  const timer = setTimeout(() => void channel.leave(), Math.max(0, deadline - Date.now()));
  let count = 0;
  try {
    // Each orderbook message is the full book for one market: replace what you hold.
    for await (const msg of channel) {
      console.log(show(msg.payload));
      count += 1;
    }
  } finally {
    clearTimeout(timer);
  }
  if (count === 0) console.log(`(nothing on ${channel.name} in ${listenMs / 1000}s)`);
}

async function nudge(marketId: string): Promise<void> {
  requireDemo(client);
  await requireReadWrite(client);
  const order = await client.placeOrder(marketId, "buy", "limit", { price: "0.01", quantity: "1" });
  console.log(`(placed 1-cent buy ${order.id}; cancelling in 3s)`);
  await new Promise((r) => setTimeout(r, 3000));
  if (order.id) await client.cancelOrder(order.id);
}
