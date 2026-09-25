// The smallest useful program: confirm the key, list a few open markets, then
// place a 1-cent buy order that will not fill and cancel it.
//
// Run: npx tsx examples/quickstart.ts --profile us-demo [--read-only]
//
// The order step runs on a demo exchange only, with a read_write key. Pass
// --read-only to skip it.

import { findScheduledMarket, flag, makeClient, requireDemo } from "./_shared.js";

const client = makeClient();

const me = await client.me();
console.log(`Signed in as user ${me.user_id} on ${client.baseUrl} (key scope: ${me.scope})`);

const page = await client.markets({ status: "open", limit: 5 });
console.log(`\n${page.length} open markets:`);
for (const m of page) {
  console.log(`  ${m.symbol}  bid ${m.bids?.[0]?.price ?? "-"}  offer ${m.offers?.[0]?.price ?? "-"}`);
}

if (flag("read-only") || me.scope !== "read_write") {
  console.log("\nSkipping the order step (read-only).");
} else {
  requireDemo(client);
  const market = await findScheduledMarket(client);
  if (!market?.market_id) {
    console.log("\nNo open market with an event that has not started; skipping the order step.");
  } else {
    // Prices and quantities are strings: "0.01" is one cent, "1" is one contract.
    const order = await client.placeOrder(market.market_id, "buy", "limit", { price: "0.01", quantity: "1" });
    console.log(`\nPlaced order ${order.id} on ${market.symbol}: ${order.status}`);
    if (order.id) {
      const cancelled = await client.cancelOrder(order.id);
      console.log(`Cancelled: ${cancelled.status}`);
    }
  }
}
