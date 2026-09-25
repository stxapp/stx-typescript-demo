// Order placement on a demo exchange: a limit order, an expiring order, a
// market order, and cancel-on-disconnect armed on the orders channel.
//
// Run: npx tsx examples/trading.ts --profile us-demo [--market-order]
//
// Every order here is a 1-cent, 1-contract buy that will not fill, and each one
// is cancelled before the script exits. The market order only runs with
// --market-order, because a market order can fill against the book and open a
// position (at demo prices, with no real money).
// Concepts: https://docs.stxapp.io/sdks/typescript/trading/

import { randomUUID } from "node:crypto";

import { STXRejectedException, STXValidationException } from "@stxapp/stx-typescript";

import { findScheduledMarket, flag, makeClient, requireDemo, requireReadWrite, toMicros } from "./_shared.js";

const client = makeClient();
requireDemo(client);
await requireReadWrite(client);

const market = await findScheduledMarket(client);
if (!market?.market_id) {
  console.log("No open market with an event that has not started; nothing to trade.");
  process.exit(0);
}
const marketId = market.market_id;
console.log(`Trading on ${market.symbol} (${marketId})`);

const placed: string[] = [];

try {
  // 1. A limit order with your own client_order_id, so you can find it again
  //    after a timeout without placing a duplicate.
  const clientOrderId = randomUUID();
  const limit = await client.placeOrder(marketId, "buy", "limit", { price: "0.01", quantity: "1", clientOrderId });
  if (limit.id) placed.push(limit.id);
  console.log(`\nlimit          ${limit.id}  ${limit.status}  client_order_id ${limit.client_order_id}`);
  const found = await client.orders({ clientOrderIds: [clientOrderId] });
  console.log(`               found again by client_order_id: ${found.items[0]?.id}`);

  // 2. good_till_time: the order expires at a time you choose. expirationTime is
  //    Unix time in MICROseconds; Date.getTime() is milliseconds, so multiply by 1000.
  const expiresAt = new Date(Date.now() + 10 * 60_000);
  const expiring = await client.placeOrder(marketId, "buy", "limit", {
    price: "0.01",
    quantity: "1",
    expiration: "good_till_time",
    expirationTime: toMicros(expiresAt),
  });
  if (expiring.id) placed.push(expiring.id);
  console.log(`good_till_time ${expiring.id}  expires ${expiresAt.toISOString()} (${expiring.expiration_time} us)`);

  // 3. A rejected order throws with the exchange's reason. Quantities are whole
  //    contracts, so 1.5 is refused.
  try {
    await client.placeOrder(marketId, "buy", "limit", { price: "0.01", quantity: "1.5" });
  } catch (err) {
    if (err instanceof STXRejectedException || err instanceof STXValidationException) {
      console.log(`rejected       ${err.statusCode} ${err.message}`);
    } else {
      throw err;
    }
  }

  // 4. Cancel-on-disconnect: arm it on the orders channel, then opt each order
  //    in. If the socket drops for longer than the granted timeout, the exchange
  //    cancels those orders. The client pings the channel while the socket is up.
  const ws = await client.websocket().connect();
  try {
    const orders = await ws.orders({ cancelOnDisconnect: true, pingTimeout: 5000 });
    console.log(`\ncancel-on-disconnect armed, granted timeout ${orders.reply.ping_timeout} ms`);
    const guarded = await client.placeOrder(marketId, "buy", "limit", {
      price: "0.01",
      quantity: "1",
      cancelOnDisconnect: true,
    });
    if (guarded.id) placed.push(guarded.id);
    console.log(`guarded        ${guarded.id}  ${guarded.status}`);
  } finally {
    await ws.close();
  }

  // 5. A market order takes whatever the book offers, so it is opt-in.
  if (flag("market-order")) {
    const mkt = await client.placeOrder(marketId, "buy", "market", { quantity: "1" });
    console.log(`market         ${mkt.id}  ${mkt.status}  filled ${mkt.filled}/${mkt.quantity} avg ${mkt.avg_price}`);
  }
} finally {
  // Cancel what is still open. An order can fill while a cancel is in flight,
  // so a real bot reconciles against fills afterwards.
  if (placed.length > 0) {
    const cancellations = await client.cancelOrders(placed);
    console.log(`\ncancelled      ${cancellations.map((c) => `${c.order_id} ${c.status}`).join(", ")}`);
  }
}
