// Unit tests with a stubbed fetch: no network, no API key needed.

import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { test } from "node:test";
import {
  KEY_HEADER,
  NO_RETRY,
  STX,
  STXComboPriceMovedException,
  STXComboRefusedException,
  STXNotFoundException,
  STXTimeoutException,
  type ComboPlacement,
  type ComboPlayerEvent,
  type FetchLike,
  type Market,
} from "@stxapp/stx-typescript";
import {
  bestBid,
  bestLevel,
  bestOffer,
  cashOutWhenHeld,
  comboStake,
  findRestingBuy,
  isUpcoming,
  makerQuoteAmount,
  pickComboLegs,
  restingBuyPrice,
  takeBestQuote,
  wouldRest,
  type QuotePlayer,
} from "../src/helpers.ts";

// A throwaway Ed25519 key, so the client signs requests exactly as it would against an exchange.
const { privateKey } = generateKeyPairSync("ed25519");

function stubClient(fetch: FetchLike): STX {
  return new STX({ host: "https://exchange.example", keyId: "test-key", privateKey, fetch, retry: NO_RETRY });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("restingBuyPrice is 1% of max_price in whole cents", () => {
  assert.equal(restingBuyPrice("1.0000"), "0.01");
  assert.equal(restingBuyPrice("100.0000"), "1.00");
  assert.equal(restingBuyPrice("0.50"), "0.01"); // never below one cent
  assert.throws(() => restingBuyPrice("0.01"));
});

test("wouldRest compares against the best offer", () => {
  const market = (offer?: string): Market => ({ offers: offer ? [{ price: offer, quantity: "1.00" }] : [] });
  assert.equal(wouldRest(market(), "0.01"), true);
  assert.equal(wouldRest(market("0.4200"), "0.01"), true);
  assert.equal(wouldRest(market("0.0100"), "0.01"), false);
  // REST lists offers highest first: the one-cent offer at the end is the best.
  const rest: Market = { offers: [{ price: "0.6000", quantity: "5.00" }, { price: "0.0100", quantity: "1.00" }] };
  assert.equal(wouldRest(rest, "0.01"), false);
});

test("the best bid is the highest and the best offer the lowest, in any order", () => {
  // As REST sends them: both sides highest price first.
  const rest: Market = {
    bids: [{ price: "0.4800", quantity: "625.00" }, { price: "0.4700", quantity: "1063.00" }],
    offers: [{ price: "0.6000", quantity: "3000.00" }, { price: "0.5300", quantity: "638.00" }],
  };
  assert.equal(bestBid(rest), "0.4800");
  assert.equal(bestOffer(rest), "0.5300");
  // As the orderbook channel sends offers: lowest first.
  assert.equal(bestLevel([{ price: "0.5300" }, { price: "0.6000" }], "offer")?.price, "0.5300");
  assert.equal(bestBid({ bids: [] }), "-");
  assert.equal(bestOffer({}), "-");
});

test("isUpcoming needs a scheduled event whose start is still ahead", () => {
  const now = new Date("2026-10-21T06:00:00Z");
  assert.equal(isUpcoming({ event_status: "scheduled", event_start: "2026-10-21T19:00:00Z" }, now), true);
  assert.equal(isUpcoming({ event_start: "2026-10-21T19:00:00Z" }, now), true); // no status given
  // Still marked scheduled, but its start time has passed: stale.
  assert.equal(isUpcoming({ event_status: "scheduled", event_start: "2026-10-19T00:00:00Z" }, now), false);
  assert.equal(isUpcoming({ event_status: "in_progress", event_start: "2026-10-21T19:00:00Z" }, now), false);
  assert.equal(isUpcoming({ event_status: "scheduled" }, now), false); // no start time
});

test("findRestingBuy skips a stale market whose start has passed and picks an upcoming one", async () => {
  const client = stubClient(async () =>
    json({
      markets: [
        // Open and still marked scheduled, but the game started two days ago and nobody quotes it.
        { market_id: "stale", max_price: "1.0000", event_status: "scheduled", event_start: "2026-10-19T00:00:00Z", offers: [] },
        { market_id: "next", max_price: "1.0000", event_status: "scheduled", event_start: "2026-10-21T19:00:00Z", offers: [{ price: "0.3600", quantity: "50.00" }] },
      ],
      cursor: null,
    }),
  );
  const found = await findRestingBuy(client, { now: new Date("2026-10-21T06:00:00Z") });
  assert.equal(found?.market.market_id, "next");
});

test("findRestingBuy walks pages and skips markets where the order would trade", async () => {
  const future = "2026-10-22T23:00:00.000000Z";
  const requests: { url: URL; headers: Headers }[] = [];
  const client = stubClient(async (input, init) => {
    const url = new URL(input);
    requests.push({ url, headers: new Headers(init.headers) });
    if (!url.searchParams.get("cursor")) {
      return json({
        markets: [
          // Someone offers at one cent, so a one-cent buy would trade: skipped.
          { market_id: "m1", max_price: "1.0000", event_status: "scheduled", event_start: future, offers: [{ price: "0.0100", quantity: "3.00" }] },
          // The event has started: skipped.
          { market_id: "m2", max_price: "1.0000", event_status: "live", event_start: future, offers: [] },
        ],
        cursor: "page-2",
      });
    }
    return json({
      markets: [{ market_id: "m3", max_price: "100.0000", event_status: "scheduled", event_start: future, offers: [{ price: "40.0000", quantity: "1.00" }] }],
      cursor: null,
    });
  });

  const found = await findRestingBuy(client, { now: new Date("2026-10-21T00:00:00Z") });
  assert.equal(found?.market.market_id, "m3");
  assert.equal(found?.price, "1.00");

  assert.equal(requests.length, 2);
  const first = requests[0]!;
  assert.equal(first.url.pathname, "/api/v1/markets");
  assert.equal(first.url.searchParams.get("status"), "open");
  assert.equal(first.url.searchParams.get("trading"), "true");
  assert.equal(first.headers.get(KEY_HEADER), "test-key"); // every request is signed with the API key
  assert.equal(requests[1]!.url.searchParams.get("cursor"), "page-2");
});

test("findRestingBuy passes a sport to the markets query", async () => {
  const urls: URL[] = [];
  const client = stubClient(async (input) => {
    urls.push(new URL(input));
    return json({ markets: [], cursor: null });
  });
  assert.equal(await findRestingBuy(client, { sport: "Football" }), null);
  assert.equal(urls[0]!.searchParams.get("sports"), "Football");
  await findRestingBuy(client);
  assert.equal(urls[1]!.searchParams.has("sports"), false);
});

test("a 404 from balance() is an STXNotFoundException", async () => {
  const client = stubClient(async () => json({ error: "not found" }, 404));
  await assert.rejects(client.balance(), STXNotFoundException);
});

test("comboStake gives dollars with two decimals and refuses anything else", () => {
  assert.equal(comboStake("2"), "2.00");
  assert.equal(comboStake("2.5"), "2.50");
  assert.equal(comboStake(" 5.25 "), "5.25");
  assert.throws(() => comboStake("0"));
  assert.throws(() => comboStake("5.001")); // below a cent
  assert.throws(() => comboStake("-1"));
  assert.throws(() => comboStake("five"));
});

test("pickComboLegs takes one open, future, non-combo market per event", async () => {
  const urls: URL[] = [];
  const client = stubClient(async (input) => {
    urls.push(new URL(input));
    const future = "2026-10-22T23:00:00.000000Z";
    return json({
      markets: [
        { market_id: "a1", event_id: "e1", event_status: "scheduled", event_start: future },
        { market_id: "a2", event_id: "e1", event_status: "scheduled", event_start: future }, // same event as a1
        { market_id: "old", event_id: "e2", event_status: "scheduled", event_start: "2026-10-19T00:00:00Z" }, // already started
        { market_id: "live", event_id: "e3", event_status: "in_progress", event_start: future },
        { market_id: "combo", event_id: "e4", event_type: "combo", event_status: "scheduled", event_start: future },
        { market_id: "gone", event_id: "e5", archived: true, event_status: "scheduled", event_start: future },
        { market_id: "b1", event_id: "e6", event_status: "scheduled", event_start: future },
        { market_id: "c1", event_id: "e7", event_status: "scheduled", event_start: future },
      ],
      cursor: null,
    });
  });
  const now = new Date("2026-10-21T00:00:00Z");
  const legs = await pickComboLegs(client, { count: 2, sport: "Football", now });
  assert.deepEqual(legs.map((m) => m.market_id), ["a1", "b1"]);
  assert.equal(urls[0]!.searchParams.get("status"), "open");
  assert.equal(urls[0]!.searchParams.get("trading"), "true");
  assert.equal(urls[0]!.searchParams.get("sports"), "Football");

  const all = await pickComboLegs(client, { count: 5, now });
  assert.deepEqual(all.map((m) => m.market_id), ["a1", "b1", "c1"]); // fewer than asked when the scan runs out
});

/** A stand-in ComboPlayer: next() hands out `events` in order, then times out. */
function fakePlayer(events: ComboPlayerEvent[], accept: QuotePlayer["accept"]): QuotePlayer & { accepted: string[][] } {
  const queue = [...events];
  const accepted: string[][] = [];
  return {
    accepted,
    async next() {
      const event = queue.shift();
      if (!event) throw new STXTimeoutException("no event", { topic: "rfq:u1" });
      return event;
    },
    async accept(rfqId, quoteId, amount) {
      accepted.push([rfqId, quoteId, amount]);
      return accept(rfqId, quoteId, amount);
    },
  };
}

const best = (rfq_id: string, quote_id: string | null, amount: string | null): ComboPlayerEvent => ({
  event: "best_quote",
  payload: { rfq_id, market_id: null, quote_id, amount, expires_at: quote_id ? 1792512210052723 : null },
});
const placement: ComboPlacement = { market_id: "combo-1", order_id: "o1", quantity: "7.00", price: "0.2858" };

test("takeBestQuote accepts the first live quote at its exact amount", async () => {
  const seen: (string | null)[] = [];
  const player = fakePlayer(
    [best("other", "q0", "9.0000"), best("r1", null, null), best("r1", "q1", "5.0000")],
    async () => placement,
  );
  const outcome = await takeBestQuote(player, "r1", { timeoutMs: 1000, onQuote: (q) => seen.push(q.amount) });
  assert.deepEqual(outcome, { kind: "placed", amount: "5.0000", placement });
  assert.deepEqual(player.accepted, [["r1", "q1", "5.0000"]]); // another request's quote is ignored
  assert.deepEqual(seen, [null, "5.0000"]);
});

test("takeBestQuote takes the live best when the price moved", async () => {
  let calls = 0;
  const player = fakePlayer([best("r1", "q1", "5.0000")], async () => {
    if (++calls === 1) {
      throw new STXComboPriceMovedException("accept on rfq:u1 refused: price_moved", {
        command: "accept",
        code: "price_moved",
        best: { quote_id: "q2", amount: "4.8000", expires_at: 1792512210052723 },
      });
    }
    return placement;
  });
  const outcome = await takeBestQuote(player, "r1", { timeoutMs: 1000 });
  assert.equal(outcome.kind, "placed");
  assert.deepEqual(player.accepted, [
    ["r1", "q1", "5.0000"],
    ["r1", "q2", "4.8000"],
  ]);
});

test("takeBestQuote reports a refused accept as closed, with the reason", async () => {
  const player = fakePlayer([best("r1", "q1", "1.7900")], async () => {
    throw new STXComboRefusedException("accept on rfq:u1 refused: player_refused:nothing_to_sell", {
      command: "accept",
      code: "player_refused",
      detail: "nothing_to_sell",
    });
  });
  assert.deepEqual(await takeBestQuote(player, "r1", { timeoutMs: 1000 }), {
    kind: "closed",
    reason: "player_refused (nothing_to_sell)",
  });
});

test("takeBestQuote reports no quote, and a request that closed", async () => {
  assert.deepEqual(await takeBestQuote(fakePlayer([], async () => placement), "r1", { timeoutMs: 1000 }), {
    kind: "no_quote",
  });
  const closed: ComboPlayerEvent = { event: "negotiation_closed", payload: { rfq_id: "r1", market_id: null, reason: "expired" } };
  assert.deepEqual(await takeBestQuote(fakePlayer([closed], async () => placement), "r1", { timeoutMs: 1000 }), {
    kind: "closed",
    reason: "expired",
  });
});

test("cashOutWhenHeld retries nothing_to_sell, and nothing else", async () => {
  const refusal = (code: string) =>
    new STXComboRefusedException(`cash_out on rfq:u1 refused: ${code}`, { command: "cash_out", code });
  const reply = { rfq_id: "r2", market_id: "combo-1", quantity: "7.00" };

  let calls = 0;
  const later = { cashOut: async () => (++calls < 3 ? Promise.reject(refusal("nothing_to_sell")) : reply) };
  assert.deepEqual(await cashOutWhenHeld(later, "combo-1", { delayMs: 1 }), reply);
  assert.equal(calls, 3);

  const never = { cashOut: async () => Promise.reject(refusal("nothing_to_sell")) };
  await assert.rejects(cashOutWhenHeld(never, "combo-1", { attempts: 2, delayMs: 1 }), STXComboRefusedException);

  let other = 0;
  const closed = { cashOut: async () => (other++, Promise.reject(refusal("market_not_quotable"))) };
  await assert.rejects(cashOutWhenHeld(closed, "combo-1", { delayMs: 1 }), STXComboRefusedException);
  assert.equal(other, 1);
});

test("makerQuoteAmount prices a buy at the stake times the multiple, in whole cents", () => {
  const buy = { side: "buy" as const, amount: "2.0000", quantity: null, max_price: "1.0000", tick_size: "0.0001000" };
  assert.equal(makerQuoteAmount(buy, "9", "0.08"), "18.00");
  assert.equal(makerQuoteAmount({ ...buy, amount: "2.5000" }, "1.333", "0.08"), "3.33");
  // 0.50 / (0.50 + 0.01) prices at 0.9804: 0.50 buys no whole contract.
  assert.equal(makerQuoteAmount({ ...buy, amount: "0.5000" }, "0.02", "0.08"), null);
  assert.equal(makerQuoteAmount(buy, "0", "0.08"), null);
});

test("makerQuoteAmount pays the cash-out price for the whole size, below max_price", () => {
  const sell = { side: "sell" as const, amount: null, quantity: "17.00", max_price: "1.0000", tick_size: "0.0001000" };
  assert.equal(makerQuoteAmount(sell, "9", "0.08"), "1.36");
  assert.equal(makerQuoteAmount(sell, "9", "1.00"), null);
  assert.equal(makerQuoteAmount(sell, "9", "1.50"), null);
});
