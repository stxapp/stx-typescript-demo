// Print your balance, positions, open orders and recent fills.
//
// Run: npm run portfolio

import { STX, STXNotFoundException } from "@stxapp/stx-typescript";

const client = new STX();

const me = await client.me();
console.log(`Key scope: ${me.scope}\n`);

// balance() and positions() are not yet available on every exchange. Where they are
// not, the call returns 404, which the SDK throws as STXNotFoundException. The live
// account view (npm run live) reads both from the WebSocket instead.
async function orNotAvailable<T>(what: string, read: () => Promise<T>): Promise<T | undefined> {
  try {
    return await read();
  } catch (err) {
    if (err instanceof STXNotFoundException) {
      console.log(`${what}: not available on this exchange yet; npm run live shows it from the WebSocket.`);
      return undefined;
    }
    throw err;
  }
}

const balance = await orNotAvailable("Balance", () => client.balance());
if (balance) console.log(`Balance: ${balance.balance}  available ${balance.available_balance}`);

const positions = await orNotAvailable("Positions", () => client.positions());
if (positions) {
  console.log(`Positions: ${positions.length}`);
  for (const p of positions) console.log(`  ${p.market_id}  ${p.position}`);
}

const orders = await client.orders({ status: ["open", "delayed"], limit: 10 });
console.log(`\nOpen orders: ${orders.length}${orders.hasMore ? " (more available)" : ""}`);
for (const o of orders) console.log(`  ${o.id}  ${o.action} ${o.quantity} @ ${o.price}  filled ${o.filled}`);

const fills = await client.fills({ limit: 5 });
console.log(`\nRecent fills: ${fills.length}`);
for (const f of fills) console.log(`  ${f.trade_id}  ${f.action} ${f.filled} @ ${f.price}`);
