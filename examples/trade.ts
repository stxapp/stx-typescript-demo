// Place one small buy order that will rest on the book, read it back, then cancel it.
//
// The price is 1% of what a winning contract pays (one cent on a $1 contract),
// and the script only uses a market where nobody is offering at that price or
// lower, so the order rests instead of trading. It needs a read_write API key.
//
// Run: npm run trade

import { randomUUID } from "node:crypto";
import { STX, STXRejectedException, STXValidationException } from "@stxapp/stx-typescript";
import { findRestingBuy } from "../src/helpers.ts";

const client = new STX();

// 1. Find a market that accepts orders, whose event has not started, and a price that will rest.
const found = await findRestingBuy(client);
if (!found) {
  console.log("No open market right now where a small buy would rest. Try again later.");
  process.exit(0);
}
const { market, price } = found;
const marketId = market.market_id!;
console.log(`Market:  ${market.event_title}: ${market.title}`);
console.log(`         ${market.symbol}  (a winning contract pays ${market.max_price})`);

// 2. Place the order. clientOrderId is your own id: use it to find the order again
//    if the call fails without an answer, instead of placing it twice.
const clientOrderId = `demo-${randomUUID()}`;
let orderId: string;
try {
  const order = await client.placeOrder(marketId, "buy", "limit", {
    price, // a dollar string with whole cents, e.g. "0.01"
    quantity: "1", // one contract
    clientOrderId,
  });
  orderId = order.id!;
  console.log(`Placed:  buy 1 @ ${price}  id ${orderId}  status ${order.status}`);
} catch (err) {
  // The exchange explains why it refused the order, e.g. a read_only key or a market that just paused.
  if (err instanceof STXRejectedException || err instanceof STXValidationException) {
    console.error(`Order refused (${err.statusCode}): ${err.message}`);
    process.exit(1);
  }
  throw err;
}

try {
  // 3. Read it back. The order is on the book and has not filled.
  const open = await client.order(orderId);
  console.log(`Read:    status ${open.status}  filled ${open.filled} of ${open.quantity}  client id ${open.client_order_id}`);
} finally {
  // 4. Cancel it, even if reading it back failed.
  const cancellation = await client.cancelOrder(orderId);
  console.log(`Cancel:  ${cancellation.order_id}  ${cancellation.status}`);
}

// 5. Confirm the final state.
const done = await client.order(orderId);
console.log(`Final:   status ${done.status}  filled ${done.filled}`);
