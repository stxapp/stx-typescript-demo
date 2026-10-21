// List upcoming markets that are open and accepting orders, with their best bid and offer.
//
// Run: npm run markets

import { STX } from "@stxapp/stx-typescript";
import { describeMarket, isUpcoming } from "../src/helpers.ts";

// Reads your API key and exchange from STX_* environment variables or ~/.stx/credentials.
const client = new STX();
const want = 5;

// status "open": markets that have opened for trading (not scheduled, closed or settled).
// trading true: only markets accepting orders right now (an open market can be paused).
// Markets come soonest event first. client.iterMarkets() walks every page for you;
// client.markets() returns one page at a time instead.
let shown = 0;
for await (const market of client.iterMarkets({ status: "open", trading: true })) {
  // Skip events already under way or past their start time: an open market can
  // outlive its event's start, and nobody quotes it then.
  if (!isUpcoming(market)) continue;
  // bids are what buyers will pay, offers what sellers will accept. describeMarket
  // prints the best of each: the highest bid and the lowest offer.
  // Prices are dollars per contract, as strings; a winning contract pays market.max_price.
  console.log(describeMarket(market));
  if (++shown >= want) break;
}

console.log(`\n${shown} upcoming markets shown.`);
