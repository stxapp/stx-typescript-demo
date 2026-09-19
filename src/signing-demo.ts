// The OTHER auth mode: a direct trader / market maker authenticating with an
// Ed25519 signing key (no OAuth, no member). Run with `npm run signing` after
// setting STX_KEY_ID + STX_PRIVATE_KEY_PATH in .env.
//
//   node --experimental-strip-types src/signing-demo.ts   (or: bun run src/signing-demo.ts)

import { readFileSync } from "node:fs";
import { StxClient, SigningAuth } from "stx-typescript";
import { config } from "./config.ts";

async function main(): Promise<void> {
  const keyId = process.env.STX_KEY_ID;
  const keyPath = process.env.STX_PRIVATE_KEY_PATH ?? "./stx-key.pem";
  if (!keyId) {
    throw new Error("Set STX_KEY_ID (and STX_PRIVATE_KEY_PATH) in .env to run the signing demo.");
  }

  const client = new StxClient({
    baseUrl: config.baseUrl,
    auth: new SigningAuth({ keyId, privateKey: readFileSync(keyPath) }),
  });

  // Identity + balance for the key's own account.
  console.log("me():", await client.me());
  console.log("balance():", await client.account.balance());

  // One page of open markets (paginated under the hood).
  const page = await client.markets({ limit: 5, status: ["OPEN"] });
  console.log(`markets: showing ${page.length} of ${page.count ?? "?"}`);
  for (const m of page) console.log(" -", m.marketId, m.title);

  // Placing an order would look like:
  //   await client.orders.place({
  //     marketId: page.at(0)!.marketId,
  //     action: OrderAction.BUY, orderType: OrderType.LIMIT,
  //     price: 55, quantity: 10,
  //   });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
