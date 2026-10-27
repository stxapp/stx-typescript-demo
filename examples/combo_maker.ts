// Quote every combo request as a maker, and report how each one ends.
//
// Players ask for quotes on a combo: a set of legs and a stake to buy, or a
// combo they hold to cash out. Every maker joined to its combo_quote topic
// receives each request. This script quotes all of them and prints what
// happens next: your quote placed (quote_accepted, then placed), another
// maker's placed instead (placed_elsewhere), your quote expiring, and the
// request closing. It needs a read_write API key.
//
// On a buy you quote what the player wins: the stake times WIN_MULTIPLE. On a
// cash out you quote what you pay for everything the player sells:
// CASH_OUT_PRICE a contract. Each quote stands for QUOTE_SECONDS. With PLAYER
// set to a player's external_id, it quotes only that player's requests.
//
// Run: npm run combo-maker              (quote until Ctrl-C)
//      npm run combo-maker -- 120       (stop after 120 s)
//      WIN_MULTIPLE=12 CASH_OUT_PRICE=0.10 QUOTE_SECONDS=60 npm run combo-maker

import {
  STX,
  STXComboRefusedException,
  STXCombosUnavailableException,
  STXTimeoutException,
  type ComboMaker,
  type ComboMakerEvent,
  type ComboRfqOpenedEvent,
} from "@stxapp/stx-typescript";
import { makerQuoteAmount } from "../src/helpers.ts";

const runSeconds = process.argv[2] ? Number(process.argv[2]) : null;
const winMultiple = process.env.WIN_MULTIPLE ?? "9";
const cashOutPrice = process.env.CASH_OUT_PRICE ?? "0.08";
const quoteMs = Math.round(Number(process.env.QUOTE_SECONDS ?? 30) * 1000);
const player = process.env.PLAYER; // a player's external_id: quote only their requests
const client = new STX();

// The SDK signs the socket, sends heartbeats and reconnects. Quotes belong to the
// connection that placed them: a drop withdraws them, so there is nothing to clean up.
const ws = await client
  .websocket({ onReconnect: () => console.log("[reconnected]  quotes from before the drop were withdrawn") })
  .connect();
process.on("SIGINT", () => {
  console.log("\nStopped. Quotes still standing were withdrawn with the connection.");
  void ws.close().finally(() => process.exit(0));
});
try {
  process.exitCode = await quoteEverything();
} finally {
  await ws.close();
}

async function quoteEverything(): Promise<number> {
  let maker: ComboMaker;
  try {
    maker = await ws.comboMaker();
  } catch (err) {
    if (!(err instanceof STXCombosUnavailableException)) throw err;
    console.log(`Combos are not available on ${client.baseUrl}.`);
    return 1;
  }
  console.log(`Quoting combos on ${client.baseUrl} as a maker.`);
  console.log(
    `Buys: win ${winMultiple}x the stake. Cash outs: ${cashOutPrice} a contract. Each quote stands ${quoteMs / 1000} s. Ctrl-C to stop.\n`,
  );

  const deadline = runSeconds ? Date.now() + runSeconds * 1000 : null;
  const quoting = new Set<string>(); // with PLAYER set, the requests this maker takes part in
  while (deadline === null || Date.now() < deadline) {
    let event: ComboMakerEvent;
    try {
      event = await maker.next(deadline === null ? null : Math.max(1, deadline - Date.now()));
    } catch (err) {
      if (err instanceof STXTimeoutException) break;
      throw err;
    }
    const rfq = event.payload.rfq_id.slice(0, 8);
    if (player && (event.event === "rfq_opened" || event.event === "rfq_closed")) {
      if (event.event === "rfq_opened" && event.payload.external_id === player) quoting.add(event.payload.rfq_id);
      if (!quoting.has(event.payload.rfq_id)) continue; // another player's request
    }
    switch (event.event) {
      case "rfq_opened":
        // Every request opened after the join, from every player, your own included.
        console.log(`[request]  ${rfq}  ${describe(event.payload)}`);
        await quote(maker, event.payload);
        break;
      case "quote_accepted":
        // The player took your quote; the exchange is placing both orders now.
        console.log(`[accepted] ${rfq}  quote ${event.payload.quote_id}`);
        break;
      case "placed": {
        const p = event.payload;
        console.log(`[won]      ${rfq}  order ${p.order_id}  ${p.quantity} @ ${p.price}  combo ${p.market_id}`);
        break;
      }
      case "negotiation_closed": {
        // One of your quotes stopped standing, once per quote, with the reason.
        const p = event.payload;
        const label = p.reason === "placed_elsewhere" ? "[lost]   " : p.reason === "expired" ? "[expired]" : "[ended]  ";
        console.log(`${label}  ${rfq}  quote ${p.quote_id}  ${p.reason}`);
        break;
      }
      case "rfq_closed":
        console.log(`[closed]   ${rfq}  ${event.payload.reason}`);
        break;
    }
  }
  return 0;
}

function describe(request: ComboRfqOpenedEvent): string {
  if (request.side === "buy") {
    const legs = request.legs.map((leg) => `${leg.short_name ?? leg.market_id.slice(0, 8)} ${leg.outcome}`).join(", ");
    return `buy, stake ${request.amount}, ${request.legs.length} legs: ${legs}`;
  }
  return `cash out of ${request.quantity} on combo ${request.market_id?.slice(0, 8)}`;
}

async function quote(maker: ComboMaker, request: ComboRfqOpenedEvent): Promise<void> {
  const rfq = request.rfq_id.slice(0, 8);
  const amount = makerQuoteAmount(request, winMultiple, cashOutPrice);
  if (amount === null) {
    console.log(`[skip]     ${rfq}  no amount prices inside 0 to ${request.max_price}`);
    return;
  }
  try {
    const q = await maker.quote(request.rfq_id, amount, quoteMs, { clientOrderId: `maker-${rfq}` });
    const what = request.side === "buy" ? `win ${q.amount}` : `pay ${q.amount} for ${request.quantity}`;
    console.log(`[quoted]   ${rfq}  ${what}  for ${quoteMs / 1000} s  quote ${q.quote_id}`);
  } catch (err) {
    // e.g. cannot_quote_own_request, or not_found when the request ended first
    if (!(err instanceof STXComboRefusedException)) throw err;
    console.log(`[refused]  ${rfq}  ${err.code}`);
  }
}
