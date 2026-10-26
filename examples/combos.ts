// Buy a small combo as a player, then cash it out, over one WebSocket.
//
// A combo is one market over two or more legs: it pays only if every leg wins.
// You ask makers to quote on the legs and a stake, they quote what you would
// win, and accepting the best quote places an order for you on the combo's own
// market. Cashing out works the same way in reverse, so the run ends holding
// nothing. It needs a read_write API key.
//
// Run: npm run combos                 (a 2.00 stake on two legs; waits 20 s for each quote)
//      npm run combos -- 60           (waits up to 60 s for each quote)
//      STAKE=5 LEGS=3 npm run combos  (a 5.00 stake on three legs)
//      SPORT=Football npm run combos  (legs from one sport)

import {
  STX,
  STXComboRefusedException,
  STXCombosUnavailableException,
  type ComboBestQuote,
  type ComboPlayer,
} from "@stxapp/stx-typescript";
import { cashOutWhenHeld, comboStake, pickComboLegs, takeBestQuote, type QuoteOutcome } from "../src/helpers.ts";

const waitSeconds = Number(process.argv[2] ?? 20);
const stake = comboStake(process.env.STAKE ?? "2");
const legCount = Number(process.env.LEGS ?? 2);
const client = new STX();

// One signed socket carries the negotiation. Closing it ends any request still open.
const ws = await client.websocket().connect();
try {
  process.exitCode = await buyAndCashOut();
} finally {
  await ws.close();
}

async function buyAndCashOut(): Promise<number> {
  // 1. Join your player topic. An exchange without combos refuses the join.
  let player: ComboPlayer;
  try {
    player = await ws.comboPlayer();
  } catch (err) {
    if (!(err instanceof STXCombosUnavailableException)) throw err;
    console.log(`Combos are not available on ${client.baseUrl}.`);
    return 1;
  }

  // 2. Pick the legs: open markets from different events that have not started.
  const markets = await pickComboLegs(client, { count: legCount, sport: process.env.SPORT });
  if (markets.length < legCount) {
    console.log(`Found ${markets.length} open market(s) from different events; ${legCount} legs need ${legCount}.`);
    return 0;
  }
  markets.forEach((m, i) => console.log(`Leg ${i + 1}:   ${m.question ?? m.title}  (${m.short_title})`));

  // 3. Ask for quotes. Every outcome is "won": the combo pays if all the legs win.
  const legs = markets.map((m) => ({ marketId: m.market_id!, outcome: "won" as const }));
  let rfqId: string;
  try {
    ({ rfq_id: rfqId } = await player.requestQuote(legs, stake));
  } catch (err) {
    if (!(err instanceof STXComboRefusedException)) throw err;
    console.log(`Request refused: ${err.code}`); // e.g. insufficient_assets, leg_not_quotable
    return 1;
  }
  console.log(`\nRequest: ${rfqId}  stake ${stake}`);
  console.log(`Waiting up to ${waitSeconds} s for a quote...`);

  // 4. Take the best quote at its exact amount: what you win on your stake.
  const bought = await takeBestQuote(player, rfqId, {
    timeoutMs: waitSeconds * 1000,
    onQuote: (q) => console.log(`[quote]  ${q.amount ? `win ${q.amount} on a ${stake} stake` : "none live"}${quoteRef(q)}`),
  });
  if (bought.kind !== "placed") {
    console.log(notPlaced(bought, "quote"));
    await player.cancel(rfqId).catch(() => undefined); // already ended if it closed
    return 1;
  }
  const placed = bought.placement;
  const combo = await client.market(placed.market_id);
  console.log(`Bought:  ${placed.quantity} @ ${placed.price}  order ${placed.order_id}  (accepted win ${bought.amount})`);
  console.log(`         combo ${placed.market_id}  ${combo.short_title}  (a winning contract pays ${combo.max_price})`);

  // 5. Cash out: a new request to sell everything you hold of the combo.
  const out = await cashOutWhenHeld(player, placed.market_id);
  console.log(`\nCash out: ${out.rfq_id}  selling ${out.quantity}`);
  const sold = await takeBestQuote(player, out.rfq_id, {
    timeoutMs: waitSeconds * 1000,
    onQuote: (q) => console.log(`[quote]  ${q.amount ? `pays ${q.amount} for all ${out.quantity}` : "none live"}${quoteRef(q)}`),
  });
  if (sold.kind !== "placed") {
    console.log(notPlaced(sold, "cash-out quote"));
    console.log(`You still hold ${out.quantity} of combo ${placed.market_id}. Run again later, or sell it on its order book.`);
    await player.cancel(out.rfq_id).catch(() => undefined);
    return 1;
  }
  console.log(`Sold:    ${sold.placement.quantity} @ ${sold.placement.price}  order ${sold.placement.order_id}  (accepted ${sold.amount})`);

  // 6. Confirm nothing is left: no position and no resting order on the combo.
  //    A trade shows in your position a moment after it fills, so look a few times.
  const position = await settledPosition(placed.market_id);
  const resting = await client.orders({ marketIds: [placed.market_id], status: ["open", "delayed"] });
  for (const order of resting.items) {
    await client.cancelOrder(order.id!); // the unfilled rest of an order the maker did not fully take
  }
  console.log(`Final:   position ${position} on the combo  open orders ${resting.items.length ? `${resting.items.length}, cancelled` : 0}`);
  return Number(position) === 0 ? 0 : 1;
}

/** Your position in a market, read until it is flat or 10 seconds pass. */
async function settledPosition(marketId: string): Promise<string> {
  let position = "0.00";
  for (let i = 0; i < 10; i++) {
    const [held] = await client.positions({ marketIds: [marketId] });
    position = held?.position ?? "0.00";
    if (Number(position) === 0) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return position;
}

function quoteRef(q: ComboBestQuote): string {
  return q.quote_id ? `  (quote ${q.quote_id})` : "";
}

function notPlaced(outcome: Exclude<QuoteOutcome, { kind: "placed" }>, what: string): string {
  if (outcome.kind === "closed") return `The request ended without a trade: ${outcome.reason}.`;
  return `No ${what} arrived within ${waitSeconds} s. Makers quote combos as they choose; try again, or wait longer with npm run combos -- 60.`;
}
