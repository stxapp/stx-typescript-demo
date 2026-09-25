// Your account over REST: balance, positions, and fills and settlements a
// page at a time and across pages.
//
// Run: npx tsx examples/portfolio.ts --profile us-demo

import { STXNotFoundException } from "@stxapp/stx-typescript";

import { makeClient } from "./_shared.js";

const client = makeClient();

/** Run a call, or return undefined when the exchange does not serve that endpoint (404). */
async function ifServed<T>(call: () => Promise<T>): Promise<T | undefined> {
  try {
    return await call();
  } catch (err) {
    if (err instanceof STXNotFoundException) return undefined;
    throw err;
  }
}

const balance = await ifServed(() => client.balance());
if (balance) {
  console.log(`Available balance ${balance.available_balance}  (account ${balance.account_balance})`);
} else {
  console.log("Balance: this exchange does not serve GET /api/v1/account/balance yet");
}

const positions = await ifServed(() => client.positions());
if (positions) {
  console.log(`\nPositions: ${positions.length}`);
  for (const p of positions.slice(0, 10)) {
    console.log(`  ${p.market_id}  position ${p.position}  premium ${p.premium}  max risk ${p.max_risk}`);
  }
} else {
  console.log("\nPositions: this exchange does not serve GET /api/v1/positions yet");
}

// One page, then the next one with the cursor.
const fills = await client.fills({ limit: 5 });
console.log(`\nFills, first page: ${fills.length} (more: ${fills.hasMore})`);
for (const f of fills) {
  console.log(`  ${f.trade_id}  ${f.action} ${f.filled} @ ${f.price}  ${f.time}`);
}
if (fills.cursor) {
  const next = await client.fills({ limit: 5, cursor: fills.cursor });
  console.log(`  next page: ${next.length} more`);
}

// Across pages: iterSettlements follows the cursor until you stop.
console.log("\nSettlements (up to 20, across pages of 5):");
let n = 0;
for await (const s of client.iterSettlements({ limit: 5 })) {
  console.log(
    `  ${s.id}  ${s.type}  qty ${s.quantity}  ${s.opening_price} -> ${s.closing_price}  realized ${s.realized_pnl}`,
  );
  if (++n >= 20) break;
}
if (n === 0) console.log("  none yet");
