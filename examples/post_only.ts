// Place a post-only buy order, which only ever rests on the book as a maker, then cancel it.
//
// A post-only order never takes liquidity: if it would match an offer on
// arrival, the exchange does not place it. Like examples/trade.ts, the script
// buys at 1% of what a winning contract pays on a market where nobody offers
// that low, so the order rests. It needs a read_write API key.
//
// Not every exchange offers post-only orders yet. The SDK asks the exchange
// before sending one, and where it is not offered the script says so and sends
// nothing.
//
// Run: npm run post-only
//      SPORT=Football npm run post-only   (only look at markets in that sport)

import { randomUUID } from "node:crypto";
import {
  STX,
  STXBlockedException,
  STXNotAvailableException,
  STXPostOnlyWouldMatchException,
  STXRateLimitException,
  STXRejectedException,
  STXValidationException,
} from "@stxapp/stx-typescript";
import { findRestingBuy } from "../src/helpers.ts";

const client = new STX();

// 1. Ask the exchange which order fill modes it offers. placeOrder() checks this
//    itself; asking first just lets the script explain the answer.
const caps = await client.capabilities();
console.log(`Exchange: ${caps.host} ${caps.apiVersion}  post-only: ${caps.features["orders.post_only"]}`);

// 2. Find a market that accepts orders, whose event has not started, and a price that will rest.
const found = await findRestingBuy(client, { sport: process.env.SPORT });
if (!found) {
  console.log("No open market right now where a small buy would rest. Try again later.");
  process.exit(0);
}
const { market, price } = found;
console.log(`Market:   ${market.event_title}: ${market.title}`);
console.log(`          ${market.symbol}  (a winning contract pays ${market.max_price})`);

let orderId: string | undefined;
try {
  // 3. Place it post-only.
  const order = await client.placeOrder(market.market_id!, "buy", "limit", {
    price,
    quantity: "1",
    clientOrderId: `demo-po-${randomUUID()}`,
    fillMode: "post_only",
  });
  orderId = order.id!;
  console.log(`Placed:   buy 1 @ ${price}  post-only  id ${orderId}  status ${order.status}  fill mode ${order.fill_mode}`);
} catch (err) {
  if (err instanceof STXNotAvailableException) {
    // This exchange does not offer post-only orders yet. Nothing was sent.
    console.log(`Not here: ${err.message}`);
  } else if (err instanceof STXPostOnlyWouldMatchException) {
    // It would have traded on arrival, so the exchange did not place it.
    // reason is "auto_matching", or "match_with_self" when the offer it would take is your own.
    console.log(`Not placed: it would have matched (${err.reason})`);
  } else if (err instanceof STXBlockedException) {
    // Refused before it reached the exchange, e.g. from a location or network it does not serve.
    // Retrying will not help; quote the reference to STX support.
    console.error(`Blocked (${err.reason}): ${err.message}  reference ${err.reference}`);
    process.exitCode = 1;
  } else if (err instanceof STXRateLimitException) {
    // Too many requests. The SDK already waited and retried; this is what was left.
    console.error(`Rate limited: retry after ${err.retryAfter} s  reference ${err.reference}`);
    process.exitCode = 1;
  } else if (err instanceof STXRejectedException || err instanceof STXValidationException) {
    console.error(`Order refused (${err.statusCode}): ${err.message}`);
    process.exitCode = 1;
  } else {
    throw err;
  }
} finally {
  // 4. Cancel it if it is on the book.
  if (orderId !== undefined) {
    const cancellation = await client.cancelOrder(orderId);
    console.log(`Cancel:   ${cancellation.order_id}  ${cancellation.status}`);
  }
}
