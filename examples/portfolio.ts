// Print your balance, positions, open orders and recent fills.
//
// Run: npm run portfolio

import { STX } from "@stxapp/stx-typescript";

const client = new STX();

const me = await client.me();
console.log(`Key scope: ${me.scope}\n`);

// Money is in dollars, as decimal strings. available_balance is what you can
// place orders with right now; the rest is held by open orders and positions.
const balance = await client.balance();
console.log(`Balance: ${balance.account_balance}  available ${balance.available_balance}`);

// position is positive when you are long (you bought), negative when short.
// Markets you have traded out of stay in the list with position 0; skip those.
const positions = (await client.positions()).filter((p) => Number(p.position) !== 0);
console.log(`\nOpen positions: ${positions.length}`);
for (const p of positions) console.log(`  ${p.market_id}  ${p.position}`);

const orders = await client.orders({ status: ["open", "delayed"], limit: 10 });
console.log(`\nOpen orders: ${orders.length}${orders.hasMore ? " (more available)" : ""}`);
for (const o of orders) console.log(`  ${o.id}  ${o.action} ${o.quantity} @ ${o.price}  filled ${o.filled}`);

const fills = await client.fills({ limit: 5 });
console.log(`\nRecent fills: ${fills.length}`);
for (const f of fills) console.log(`  ${f.trade_id}  ${f.action} ${f.filled} @ ${f.price}`);
