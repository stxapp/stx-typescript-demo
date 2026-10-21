// Small helpers shared by the examples. Nothing here talks to the network on its own.

import {
  STXComboPriceMovedException,
  STXComboRefusedException,
  STXTimeoutException,
  type ComboBestQuote,
  type ComboCashOutReply,
  type ComboPlacement,
  type ComboPlayerEvent,
  type Market,
  type STX,
} from "@stxapp/stx-typescript";

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

/**
 * A combo stake as a dollar string with two decimals, e.g. "2" becomes "2.00".
 * The exchange takes whole cents and nothing below one cent.
 */
export function comboStake(input: string): string {
  if (!/^\d+(\.\d{1,2})?$/.test(input.trim())) {
    throw new Error(`a stake is dollars in whole cents, e.g. "2" or "2.50", not ${JSON.stringify(input)}`);
  }
  const cents = toCents(input);
  if (cents < 1) throw new Error(`a stake must be at least one cent, not ${JSON.stringify(input)}`);
  return fromCents(cents);
}

/**
 * Up to `count` legs for a combo: open markets accepting orders, whose event
 * is scheduled to start after `now`, each from a different event (two markets
 * of one game can contradict each other), and never a combo itself. Fewer than
 * `count` come back when the first `scan` markets do not have enough.
 */
export async function pickComboLegs(
  client: STX,
  {
    count = 2,
    sport,
    scan = 500,
    now = new Date(),
  }: { count?: number; sport?: string; scan?: number; now?: Date } = {},
): Promise<Market[]> {
  const legs: Market[] = [];
  const events = new Set<string>();
  let seen = 0;
  const query = { status: "open", trading: true, ...(sport ? { sports: [sport] } : {}) } as const;
  for await (const market of client.iterMarkets(query)) {
    if (++seen > scan || legs.length >= count) break;
    if (!market.market_id || market.archived || market.event_type === "combo") continue;
    if (market.event_status && market.event_status !== "scheduled") continue;
    if (market.event_start && Date.parse(market.event_start) <= now.getTime()) continue;
    const event = market.event_id ?? market.market_id;
    if (events.has(event)) continue;
    events.add(event);
    legs.push(market);
  }
  return legs;
}

/** What `takeBestQuote` needs of a `ComboPlayer`. */
export interface QuotePlayer {
  next(timeoutMs?: number | null): Promise<ComboPlayerEvent>;
  accept(rfqId: string, quoteId: string, amount: string): Promise<ComboPlacement>;
}

/** How a request ended for `takeBestQuote`. */
export type QuoteOutcome =
  | { kind: "placed"; amount: string; placement: ComboPlacement }
  | { kind: "no_quote" }
  | { kind: "closed"; reason: string };

/**
 * Waits up to `timeoutMs` for a live quote on `rfqId` and accepts it at its
 * exact amount. When the best moves before the accept lands, it takes the new
 * best if one is live, or waits for the next. Any other refusal of the accept
 * comes back as `closed` with the exchange's reason. `onQuote` sees every best quote
 * as it arrives, including the empty one sent when quotes are withdrawn.
 */
export async function takeBestQuote(
  player: QuotePlayer,
  rfqId: string,
  { timeoutMs, onQuote }: { timeoutMs: number; onQuote?: (best: ComboBestQuote) => void },
): Promise<QuoteOutcome> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const left = deadline - Date.now();
    if (left <= 0) return { kind: "no_quote" };
    let event: ComboPlayerEvent;
    try {
      event = await player.next(left);
    } catch (err) {
      if (err instanceof STXTimeoutException) return { kind: "no_quote" };
      throw err;
    }
    if (event.payload.rfq_id !== rfqId) continue;
    if (event.event === "negotiation_closed") return { kind: "closed", reason: event.payload.reason };
    if (event.event !== "best_quote") continue;
    onQuote?.(event.payload);
    let best: ComboBestQuote = event.payload;
    while (best.quote_id && best.amount && Date.now() < deadline) {
      try {
        const placement = await player.accept(rfqId, best.quote_id, best.amount);
        return { kind: "placed", amount: best.amount, placement };
      } catch (err) {
        if (err instanceof STXComboPriceMovedException) {
          best = err.best; // the request stays open: take the live best, or wait for the next quote
          onQuote?.(best);
          continue;
        }
        // Any other refusal, e.g. player_refused:nothing_to_sell when the holding changed under a cash out.
        if (err instanceof STXComboRefusedException) {
          return { kind: "closed", reason: err.detail ? `${err.code} (${err.detail})` : err.code };
        }
        throw err;
      }
    }
  }
}

/**
 * Opens a cash out of everything you hold of the combo `marketId`. A fill
 * counts toward your position a moment after it trades, so straight after
 * buying the exchange can answer `nothing_to_sell`: this tries again, up to
 * `attempts` times, `delayMs` apart.
 */
export async function cashOutWhenHeld(
  player: { cashOut(marketId: string): Promise<ComboCashOutReply> },
  marketId: string,
  { attempts = 15, delayMs = 1000 }: { attempts?: number; delayMs?: number } = {},
): Promise<ComboCashOutReply> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await player.cashOut(marketId);
    } catch (err) {
      const notYet = err instanceof STXComboRefusedException && err.code === "nothing_to_sell";
      if (!notYet || attempt >= attempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
