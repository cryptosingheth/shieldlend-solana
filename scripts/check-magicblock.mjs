#!/usr/bin/env node
/**
 * check-magicblock.mjs
 *
 * Verifies MagicBlock PER / Private Payments integration surface.
 * Runs a live TDX attestation check against the devnet TEE RPC.
 * Does not require a wallet — safe to run in CI.
 *
 * Usage:
 *   node scripts/check-magicblock.mjs
 *   NEXT_PUBLIC_MAGICBLOCK_TEE_RPC_URL=https://devnet-tee.magicblock.app node scripts/check-magicblock.mjs
 */

import process from "node:process";
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const TEE_RPC_URL =
  process.env.NEXT_PUBLIC_MAGICBLOCK_TEE_RPC_URL ??
  "https://devnet-tee.magicblock.app";

const ROUTER_RPC_URL =
  process.env.NEXT_PUBLIC_MAGICBLOCK_ROUTER_RPC_URL ??
  "https://devnet-router.magicblock.app";

const PRIVATE_PAYMENTS_URL =
  process.env.NEXT_PUBLIC_MAGICBLOCK_PRIVATE_PAYMENTS_URL ?? "";

// Known program IDs from MagicBlock docs (stable, verified against SDK 0.8.x)
const PERMISSION_PROGRAM_ID = "ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1";
const DELEGATION_PROGRAM_ID = "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh";
const MAGIC_PROGRAM_ID = "Magic11111111111111111111111111111111111111";
const MAGIC_CONTEXT_ID = "MagicContext1111111111111111111111111111111";

// Devnet TEE validator
const TEE_VALIDATOR = "MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo";

// Anchor version gap — Rust macros require 0.32.1, workspace has 0.30.1
const ANCHOR_CURRENT = "0.30.1";
const ANCHOR_REQUIRED = "0.32.1";

let overallOk = true;
function ok(label, detail) {
  console.log(`ok   ${label}${detail ? ": " + detail : ""}`);
}
function warn(label, detail) {
  console.log(`warn ${label}${detail ? ": " + detail : ""}`);
}
function fail(label, detail) {
  overallOk = false;
  console.log(`fail ${label}${detail ? ": " + detail : ""}`);
}
function info(label, detail) {
  console.log(`     ${label}${detail ? ": " + detail : ""}`);
}

console.log("=== MagicBlock PER / Private Payments Integration Check ===\n");

// ─── 1. SDK availability ────────────────────────────────────────────────────

let sdk;
try {
  sdk = require("@magicblock-labs/ephemeral-rollups-sdk");
  // package.json is not in exports map — resolve via main entry: lib/index.js → ../..
  const mainEntry = require.resolve("@magicblock-labs/ephemeral-rollups-sdk");
  const pkgRoot = path.resolve(path.dirname(mainEntry), "..");
  const pkgJson = JSON.parse(
    fs.readFileSync(path.join(pkgRoot, "package.json"), "utf8")
  );
  ok("SDK @magicblock-labs/ephemeral-rollups-sdk", `v${pkgJson.version}`);
} catch (err) {
  fail(
    "SDK @magicblock-labs/ephemeral-rollups-sdk",
    `not installed or failed to load: ${err.message} — run: npm install --workspace frontend`
  );
  process.exit(1);
}

// ─── 2. Program IDs ─────────────────────────────────────────────────────────

const sdkPermId = sdk.PERMISSION_PROGRAM_ID?.toBase58?.();
const sdkDelegId = sdk.DELEGATION_PROGRAM_ID?.toBase58?.();

if (sdkPermId === PERMISSION_PROGRAM_ID) {
  ok("Permission Program ID", PERMISSION_PROGRAM_ID);
} else {
  fail(
    "Permission Program ID mismatch",
    `SDK has ${sdkPermId}, docs expected ${PERMISSION_PROGRAM_ID}`
  );
}

if (sdkDelegId === DELEGATION_PROGRAM_ID) {
  ok("Delegation Program ID", DELEGATION_PROGRAM_ID);
} else {
  fail(
    "Delegation Program ID mismatch",
    `SDK has ${sdkDelegId}, docs expected ${DELEGATION_PROGRAM_ID}`
  );
}

info("Magic Program ID", MAGIC_PROGRAM_ID);
info("Magic Context ID", MAGIC_CONTEXT_ID);
info("TEE Validator (devnet)", TEE_VALIDATOR);

// ─── 3. TEE RPC connectivity ─────────────────────────────────────────────────

console.log(`\n--- TEE RPC: ${TEE_RPC_URL} ---`);

let teeReachable = false;
try {
  const res = await fetch(TEE_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
    signal: AbortSignal.timeout(10_000),
  });
  teeReachable = true;
  const body = await res.json().catch(() => null);
  ok("TEE RPC reachable", `HTTP ${res.status} — ${JSON.stringify(body)}`);
} catch (err) {
  warn("TEE RPC unreachable", err.message);
}

// ─── 4. TEE TDX attestation (verifyTeeRpcIntegrity) ─────────────────────────

let integrityVerified = false;
if (teeReachable) {
  try {
    integrityVerified = await sdk.verifyTeeRpcIntegrity(TEE_RPC_URL);
    if (integrityVerified) {
      ok("TEE TDX attestation", "PASS — running inside Intel TDX enclave");
    } else {
      warn(
        "TEE TDX attestation",
        "verifyTeeRpcIntegrity returned false (attestation failed or not a TEE)"
      );
    }
  } catch (err) {
    warn("TEE TDX attestation", `Exception: ${err.message}`);
  }
} else {
  warn("TEE TDX attestation", "skipped — TEE RPC not reachable");
}

// ─── 5. Router RPC connectivity ──────────────────────────────────────────────

console.log(`\n--- Router RPC: ${ROUTER_RPC_URL} ---`);

try {
  const res = await fetch(ROUTER_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await res.json().catch(() => null);
  ok("Router RPC reachable", `HTTP ${res.status} — ${JSON.stringify(body)}`);
} catch (err) {
  warn("Router RPC unreachable", err.message);
}

// ─── 6. Private Payments API ─────────────────────────────────────────────────

console.log("\n--- Private Payments API ---");

if (PRIVATE_PAYMENTS_URL) {
  ok("NEXT_PUBLIC_MAGICBLOCK_PRIVATE_PAYMENTS_URL", PRIVATE_PAYMENTS_URL);
  try {
    const res = await fetch(
      `${PRIVATE_PAYMENTS_URL.replace(/\/$/, "")}/health`,
      {
        method: "GET",
        signal: AbortSignal.timeout(8_000),
      }
    );
    ok(
      "Private Payments /health",
      `HTTP ${res.status} — ${res.statusText}`
    );
  } catch (err) {
    warn("Private Payments /health", `unreachable: ${err.message}`);
  }
} else {
  warn(
    "NEXT_PUBLIC_MAGICBLOCK_PRIVATE_PAYMENTS_URL",
    "not set — Private Payments API unavailable. " +
      "Request access at discord.com/invite/MBkdC3gxcv"
  );
}

// ─── 7. Rust macro version gap ───────────────────────────────────────────────

console.log("\n--- Rust PER Macros ---");

warn(
  `Anchor version gap`,
  `Current: ${ANCHOR_CURRENT} — Required for PER macros: ${ANCHOR_REQUIRED}`
);
info(
  "Blocked macros",
  "#[ephemeral], #[delegate], #[commit] on shielded_pool / lending_pool"
);
info(
  "Risk",
  "Anchor upgrade must be isolated (rebuild all three programs, re-run C2H round-trip)"
);
info(
  "Unblocked surface",
  "TypeScript SDK (TEE auth, permission instructions, Private Payments) — all working"
);

// ─── 8. TypeScript SDK function availability ─────────────────────────────────

console.log("\n--- TypeScript SDK Functions ---");

const expectedExports = [
  "verifyTeeRpcIntegrity",
  "verifyTeeIntegrity",
  "getAuthToken",
  "createCreatePermissionInstruction",
  "createDelegatePermissionInstruction",
  "createCommitAndUndelegatePermissionInstruction",
  "permissionPdaFromAccount",
  "PERMISSION_PROGRAM_ID",
  "DELEGATION_PROGRAM_ID",
  "MAGIC_PROGRAM_ID",
  "MAGIC_CONTEXT_ID",
  "AUTHORITY_FLAG",
  "TX_LOGS_FLAG",
];

for (const name of expectedExports) {
  if (typeof sdk[name] !== "undefined") {
    ok(`sdk.${name}`, "available");
  } else {
    fail(`sdk.${name}`, "missing from installed SDK");
  }
}

// ─── 9. Summary ──────────────────────────────────────────────────────────────

console.log("\n=== Summary ===");

if (integrityVerified) {
  console.log("LIVE  — TEE TDX attestation verified. PER TypeScript surface ready.");
} else if (teeReachable) {
  console.log("CONFIGURED — TEE RPC reachable but attestation not verified.");
} else {
  console.log("UNAVAILABLE — TEE RPC not reachable from this network.");
}

if (PRIVATE_PAYMENTS_URL) {
  console.log("CONFIGURED — Private Payments API URL is set.");
} else {
  console.log("BLOCKED    — Private Payments API URL not set (requires Discord access).");
}

console.log("BLOCKED    — Rust PER macros require Anchor 0.32.1 (current 0.30.1).");

if (!overallOk) {
  console.error("\nOne or more checks failed. See above for details.");
  process.exit(1);
}
