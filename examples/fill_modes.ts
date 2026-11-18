// Post-only and fill-or-kill orders: three small buys, each cancelled or
// finished before the script exits.
//
// 1. Post-only at a price that rests: the order sits on the book as a maker.
//    The script shows it resting, then cancels it.
// 2. Post-only at the best offer, where it would trade on arrival: a post-only
//    order never takes liquidity, so the exchange cancels it
//    (cancellation_reason "auto_matching") and nothing trades.
// 3. Fill-or-kill at the resting price: it fills in full or not at all. With
//    nothing to match, it is cancelled with nothing filled.
//
// It needs a read_write API key.
//
// The exchange decides whether it takes a fill mode. Where a mode is not
// enabled, placeOrder() throws STXNotAvailableException and nothing is placed.
// An exchange that does not have fill modes at all may instead place the order
// as a normal limit order, so the script checks fill_mode on every order it
// gets back, cancels a normal one, and skips steps 2 and 3 there: at the best
// offer a normal order would trade.
//
// Run: npm run fill-modes
//      SPORT=Football npm run fill-modes   (only look at markets in that sport)

import { randomUUID } from "node:crypto";
import {
  type Order,
  STX,
  STXBlockedException,
  STXNotAvailableException,
  STXPostOnlyWouldMatchException,
  STXRateLimitException,
  STXRejectedException,
  STXValidationException,
} from "@stxapp/stx-typescript";
import { findOffer, findRestingBuy } from "../src/helpers.ts";

const client = new STX();
const sport = process.env.SPORT;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Reads the order until it is filled or cancelled, for up to 10 seconds.
async function settle(order: Order): Promise<Order> {
  for (let i = 0; i < 20 && order.status !== "filled" && order.status !== "cancelled"; i++) {
    await sleep(500);
    order = await client.order(order.id!);
  }
  return order;
}

try {
  // 1. Post-only that rests.
  const resting = await findRestingBuy(client, { sport });
  if (!resting) {
    console.log("No open market right now where a small buy would rest. Try again later.");
    process.exit(0);
  }
  const { market, price } = resting;
  console.log(`Market:     ${market.event_title}: ${market.title}`);
  console.log(`            ${market.symbol}  (a winning contract pays ${market.max_price})`);

  let honored = false;
  try {
    const order = await client.placeOrder(market.market_id!, "buy", "limit", {
      price,
      quantity: "1",
      clientOrderId: `demo-po-${randomUUID()}`,
      fillMode: "post_only",
    });
    if (order.fill_mode === "post_only") {
      honored = true;
      const onBook = await client.order(order.id!);
      console.log(`Post-only:  buy 1 @ ${price}  id ${order.id}  status ${onBook.status}  fill mode ${onBook.fill_mode}`);
    } else {
      // The exchange ignored fill_mode: this is a normal limit order.
      console.log(`Normal:     buy 1 @ ${price}  id ${order.id}  fill mode ${order.fill_mode ?? "normal"}`);
      console.log("            This exchange placed it as a normal limit order: it does not have fill modes.");
    }
    const cancellation = await client.cancelOrder(order.id!);
    console.log(`Cancel:     ${cancellation.order_id}  ${cancellation.status}`);
  } catch (err) {
    if (!(err instanceof STXNotAvailableException)) throw err;
    // The exchange has not enabled post-only orders. Nothing was placed.
    console.log(`Not here:   ${err.message}`);
  }
  if (!honored) process.exit(0);

  // 2. Post-only that would cross.
  const offer = await findOffer(client, { sport });
  if (!offer) {
    console.log("Cross:      no upcoming market has an offer to cross right now; skipped");
  } else {
    console.log(`Cross:      ${offer.market.symbol}  best offer ${offer.price}`);
    try {
      const order = await client.placeOrder(offer.market.market_id!, "buy", "limit", {
        price: offer.price,
        quantity: "1",
        clientOrderId: `demo-po-x-${randomUUID()}`,
        fillMode: "post_only",
      });
      // Not expected: the offer went away before the order arrived, so it rests.
      console.log(`Rested:     id ${order.id}  status ${order.status}; cancelling`);
      await client.cancelOrder(order.id!);
    } catch (err) {
      if (!(err instanceof STXPostOnlyWouldMatchException)) throw err;
      // reason is "auto_matching" (the exchange cancelled it; err.order is the
      // cancelled order), or "match_with_self" when the offer is your own.
      const cancelled = err.order;
      console.log(
        `Refused:    post-only would have matched (${err.reason})` +
          (cancelled ? `  id ${cancelled.id}  status ${cancelled.status}  reason ${cancelled.cancellation_reason}  filled ${cancelled.filled ?? "0"}` : ""),
      );
    }
  }

  // 3. Fill-or-kill with nothing to match.
  try {
    const placed = await client.placeOrder(market.market_id!, "buy", "limit", {
      price,
      quantity: "1",
      clientOrderId: `demo-fok-${randomUUID()}`,
      fillMode: "fill_or_kill",
    });
    const order = await settle(placed);
    if (order.status === "filled") {
      console.log(`Fill-or-kill: filled ${order.filled} @ ${order.avg_price}  id ${order.id}`);
    } else {
      console.log(
        `Fill-or-kill: ${order.status}  reason ${order.cancellation_reason}  filled ${order.filled ?? "0"}  id ${order.id}`,
      );
    }
  } catch (err) {
    if (!(err instanceof STXNotAvailableException)) throw err;
    console.log(`Not here:   ${err.message}`);
  }
} catch (err) {
  if (err instanceof STXBlockedException) {
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
}
