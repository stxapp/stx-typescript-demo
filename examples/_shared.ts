// Helpers shared by the examples. Copy this file alongside any example you
// take out of the repo.
//
// Every example builds its client with `makeClient()`, which reads the API key
// from a profile in ~/.stx/credentials (`--profile <name>`), or, without a
// profile, from the STX_* environment variables the SDK reads itself.
// Setup: https://docs.stxapp.io/sdks/typescript/authentication/

import { STX, STXConfigException, type Market, type STXOptions } from "@stxapp/stx-typescript";

/** The value after `--name` on the command line, if any. */
export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** True when `--name` is on the command line. */
export function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/** `--seconds N`, or the fallback. */
export function seconds(fallback: number): number {
  const value = Number(arg("seconds"));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** A client for `--profile <name>`, or for the STX_* environment variables. */
export function makeClient(extra: STXOptions = {}): STX {
  const profile = arg("profile");
  try {
    return new STX({ ...(profile ? { profile } : {}), ...extra });
  } catch (err) {
    if (err instanceof STXConfigException) {
      console.error(
        [
          `Could not configure the client: ${err.message}`,
          "",
          "Pass --profile <name> for a profile in ~/.stx/credentials, or set STX_KEY_ID,",
          "STX_PRIVATE_KEY, STX_REGION and STX_ENV. Setup:",
          "https://docs.stxapp.io/sdks/typescript/authentication/",
        ].join("\n"),
      );
      process.exit(1);
    }
    throw err;
  }
}

const DEMO_HOSTS = new Set(["demo.stxapp.io", "demo.stxapp.ca"]);

/** Exit unless the client points at a demo exchange. The examples that place orders call this first. */
export function requireDemo(client: STX): void {
  const host = new URL(client.baseUrl).hostname;
  if (DEMO_HOSTS.has(host)) return;
  console.error(
    `This example places orders, so it only runs against a demo exchange (demo.stxapp.io or demo.stxapp.ca). ` +
      `The client points at ${host}.`,
  );
  process.exit(1);
}

/**
 * An open market that accepts orders and whose event has not started yet, or
 * undefined. The examples place their 1-cent orders here.
 */
export async function findScheduledMarket(client: STX): Promise<Market | undefined> {
  for await (const m of client.iterMarkets({ status: "open", sortBy: "event_start", sortDirection: "desc" })) {
    if (m.market_id && m.trading && m.event_status === "scheduled") return m;
  }
  return undefined;
}

/** Microseconds since the Unix epoch, the unit order expiration times use. */
export function toMicros(date: Date): number {
  return date.getTime() * 1000;
}

/** Exit with a message when the account's key cannot place orders. */
export async function requireReadWrite(client: STX): Promise<void> {
  const me = await client.me();
  if (me.scope === "read_write") return;
  console.error(`This example places orders, which needs a read_write API key. This key is ${me.scope}.`);
  process.exit(1);
}
