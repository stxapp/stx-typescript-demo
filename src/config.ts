// Env-driven config. Loads a local .env (if present) without a dependency, so
// the demo runs the same on Node and Bun.

import { readFileSync } from "node:fs";

function loadDotEnv(path = ".env"): void {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return; // no .env — rely on the real environment
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadDotEnv();

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`Missing env ${name}. Copy .env.example to .env and fill it in.`);
  }
  return v.trim();
}

function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : fallback;
}

export const config = {
  baseUrl: required("STX_BASE_URL"),
  clientId: required("CLIENT_ID"),
  clientSecret: required("CLIENT_SECRET"),
  redirectUri: optional("REDIRECT_URI", "http://localhost:8787/callback"),
  scopes: optional("OAUTH_SCOPES", "identity balance portfolio history trade"),
  port: Number(optional("PORT", "8787")),
};

// The single demo member. A real ISV keys tokens per end-user; this demo has one.
export const DEMO_MEMBER = "demo-member";
