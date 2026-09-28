// Small helpers shared by the examples. Nothing here talks to the network on its own.

import type { Market, STX } from "@stxapp/stx-typescript";

/** The best bid price as a string, or "-" when nobody is bidding. */
export function bestBid(market: Market): string {
  return market.bids?.[0]?.price ?? "-";
}

/** The best offer price as a string, or "-" when nobody is offering. */
export function bestOffer(market: Market): string {
  return market.offers?.[0]?.price ?? "-";
}

/** A one-line description of a market: event, market title, best bid and offer. */
export function describeMarket(market: Market): string {
  return `${market.event_title}: ${market.title}  bid ${bestBid(market)}  offer ${bestOffer(market)}`;
}

/** Converts a dollar string such as "1.0000" to whole cents. */
function toCents(dollars: string): number {
  return Math.round(Number(dollars) * 100);
}

/** Formats whole cents as a dollar string with two decimals, e.g. 1 becomes "0.01". */
function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * A buy price far below anything a seller is likely to accept: 1% of what a
 * winning contract pays, in whole cents, and never less than one cent.
 *
 * A market whose contract pays "1.0000" gives "0.01"; one that pays "100.0000"
 * gives "1.00". Prices are read from the market, never assumed.
 */
export function restingBuyPrice(maxPrice: string): string {
  const cents = toCents(maxPrice);
  if (!Number.isFinite(cents) || cents < 2) {
    throw new Error(`cannot derive a resting price from max_price ${JSON.stringify(maxPrice)}`);
  }
  return fromCents(Math.max(1, Math.floor(cents / 100)));
}

/**
 * True when a buy at `price` would rest on the book instead of trading:
 * nobody is offering, or the best offer is above `price`.
 */
export function wouldRest(market: Market, price: string): boolean {
  const offer = market.offers?.[0]?.price;
  return offer == null || toCents(offer) > toCents(price);
}

/**
 * The first open market that is accepting orders, whose event has not
 * started, and where a buy at restingBuyPrice() would rest. Returns the
 * market and that price, or null when none of the first `scan` markets fit.
 * Pass `sport` (e.g. "Football") to look only at markets in that sport.
 */
export async function findRestingBuy(
  client: STX,
  { sport, scan = 200 }: { sport?: string; scan?: number } = {},
): Promise<{ market: Market; price: string } | null> {
  let seen = 0;
  const query = { status: "open", trading: true, ...(sport ? { sports: [sport] } : {}) } as const;
  for await (const market of client.iterMarkets(query)) {
    if (++seen > scan) break;
    if (!market.market_id || !market.max_price) continue;
    if (market.event_status && market.event_status !== "scheduled") continue;
    const price = restingBuyPrice(market.max_price);
    if (wouldRest(market, price)) return { market, price };
  }
  return null;
}
