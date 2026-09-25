// A live view of your account from the WebSocket: balance, open orders, fills
// and positions, kept current without polling REST.
//
// Run: npx tsx examples/account-view.ts --profile us-demo [--seconds 30] [--place-order]
//
// With --place-order (demo exchange and a read_write key only), the example
// places a 1-cent buy that will not fill and cancels it, so you can watch the
// open order and the balance change arrive on the socket.

import { findScheduledMarket, flag, makeClient, requireDemo, requireReadWrite, seconds } from "./_shared.js";

const client = makeClient();
const ws = await client.websocket().connect();

try {
  // Joins the balances, orders, fills and positions channels and resolves once
  // all four snapshots are in. After a reconnect it starts over from fresh ones.
  const view = await ws.accountView({
    onChange: (change) => {
      const v = change.view;
      console.log(
        `[${change.kind}] available ${v.balance?.available_balance}  open orders ${v.openOrders.length}  ` +
          `fills ${v.fills.length}  positions ${v.positions.length}`,
      );
    },
  });

  console.log("Account view ready:");
  console.log(`  available balance  ${view.balance?.available_balance}`);
  console.log(`  open orders        ${view.openOrders.length}`);
  console.log(`  fills              ${view.fills.length}`);
  console.log(`  positions          ${view.positions.length}`);
  for (const o of view.openOrders.slice(0, 5)) {
    console.log(`    order ${o.id}  ${o.action} ${o.quantity} @ ${o.price}  ${o.status}`);
  }

  if (flag("place-order")) {
    requireDemo(client);
    await requireReadWrite(client);
    const market = await findScheduledMarket(client);
    if (market?.market_id) {
      const order = await client.placeOrder(market.market_id, "buy", "limit", { price: "0.01", quantity: "1" });
      console.log(`\nPlaced ${order.id} on ${market.symbol}; watch it arrive, then leave.`);
      await new Promise((r) => setTimeout(r, 3000));
      if (order.id) await client.cancelOrder(order.id);
      console.log(`Cancelled ${order.id}`);
    } else {
      console.log("\nNo open market with an event that has not started; not placing an order.");
    }
  }

  const listenFor = seconds(20);
  console.log(`\nListening for ${listenFor}s...`);
  await new Promise((r) => setTimeout(r, listenFor * 1000));

  // state() is plain data: safe to JSON-encode and send to a browser.
  const state = view.state();
  console.log(`\nFinal state: ${JSON.stringify(state).length} bytes of JSON, ${state.openOrders.length} open orders`);
  await view.close();
} finally {
  await ws.close();
}
