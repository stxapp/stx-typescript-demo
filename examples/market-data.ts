// Read-only market data: open markets a page at a time, events found by
// title, and the top of the book for one market.
//
// Run: npx tsx examples/market-data.ts --profile us-demo [--search "Yankees"] [--market <market_id>]

import { arg, makeClient } from "./_shared.js";

const client = makeClient();

// One page of open markets, soonest event first. `page.cursor` fetches the next page.
const page = await client.markets({ status: "open", sortBy: "event_start", sortDirection: "asc", limit: 10 });
console.log(`Open markets (first ${page.length}, more pages: ${page.hasMore}):`);
for (const m of page) {
  console.log(`  ${m.market_id}  ${m.symbol}  ${m.event_status}  last ${m.last_traded_price ?? "-"}`);
}

// Count every open market by walking all pages; iterMarkets follows the cursor for you.
let total = 0;
for await (const _ of client.iterMarkets({ status: "open" })) total += 1;
console.log(`\n${total} open markets in all`);

// Find events by title, then the markets under them.
const search = arg("search");
if (search) {
  const events = await client.events({ title: search, limit: 5 });
  console.log(`\nEvents matching "${search}": ${events.length}`);
  const eventIds = events.items.map((e) => e.event_id).filter((id): id is string => Boolean(id));
  for (const e of events) console.log(`  ${e.event_id}  ${e.title}  ${e.status}`);
  if (eventIds.length > 0) {
    const markets = await client.markets({ eventIds, limit: 10 });
    for (const m of markets) console.log(`    market ${m.market_id}  ${m.symbol}`);
  }
}

// The book for one market: bids and offers as REST returns them. To follow the
// book as it moves, stream it instead (see live-prices.ts).
const marketId = arg("market") ?? page.items[0]?.market_id;
if (marketId) {
  const market = await client.market(marketId);
  console.log(`\nBook for ${market.symbol} (max price ${market.max_price}):`);
  console.log("  bids:  ", (market.bids ?? []).map((l) => `${l.quantity} @ ${l.price}`).join(", ") || "none");
  console.log("  offers:", (market.offers ?? []).map((l) => `${l.quantity} @ ${l.price}`).join(", ") || "none");
}
