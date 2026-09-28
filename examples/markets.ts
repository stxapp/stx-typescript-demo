// List markets that are open and accepting orders, with their best bid and offer.
//
// Run: npm run markets

import { STX } from "@stxapp/stx-typescript";
import { describeMarket } from "../src/helpers.ts";

// Reads your API key and exchange from STX_* environment variables or ~/.stx/credentials.
const client = new STX();

// status "open": markets that have opened for trading (not scheduled, closed or settled).
// trading true: only markets accepting orders right now (an open market can be paused).
// limit: markets per page. page.items holds this page; client.iterMarkets() walks every page.
const page = await client.markets({ status: "open", trading: true, limit: 5 });

for (const market of page.items) {
  // bids are what buyers will pay, offers what sellers will accept, best price first.
  // Prices are dollars per contract, as strings; a winning contract pays market.max_price.
  console.log(describeMarket(market));
}

console.log(`\n${page.length} markets shown${page.hasMore ? ", more available" : ""}.`);
