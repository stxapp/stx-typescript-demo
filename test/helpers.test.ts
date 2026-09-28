// Unit tests with a stubbed fetch: no network, no API key needed.

import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { test } from "node:test";
import { KEY_HEADER, NO_RETRY, STX, STXNotFoundException, type FetchLike, type Market } from "@stxapp/stx-typescript";
import { findRestingBuy, restingBuyPrice, wouldRest } from "../src/helpers.ts";

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
});

test("findRestingBuy walks pages and skips markets where the order would trade", async () => {
  const requests: { url: URL; headers: Headers }[] = [];
  const client = stubClient(async (input, init) => {
    const url = new URL(input);
    requests.push({ url, headers: new Headers(init.headers) });
    if (!url.searchParams.get("cursor")) {
      return json({
        markets: [
          // Someone offers at one cent, so a one-cent buy would trade: skipped.
          { market_id: "m1", max_price: "1.0000", event_status: "scheduled", offers: [{ price: "0.0100", quantity: "3.00" }] },
          // The event has started: skipped.
          { market_id: "m2", max_price: "1.0000", event_status: "live", offers: [] },
        ],
        cursor: "page-2",
      });
    }
    return json({
      markets: [{ market_id: "m3", max_price: "100.0000", event_status: "scheduled", offers: [{ price: "40.0000", quantity: "1.00" }] }],
      cursor: null,
    });
  });

  const found = await findRestingBuy(client);
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

test("a 404 from balance() is an STXNotFoundException", async () => {
  const client = stubClient(async () => json({ error: "not found" }, 404));
  await assert.rejects(client.balance(), STXNotFoundException);
});
