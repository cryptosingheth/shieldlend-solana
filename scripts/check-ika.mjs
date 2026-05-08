#!/usr/bin/env node
// Probe the IKA dWallet pre-alpha rail.
// Reports SDK availability, endpoint config, capability matrix, and exact blockers.
// Does not make network calls to the gRPC endpoint — local probe only.
//
// Usage: node scripts/check-ika.mjs
// Or:    IKA_GRPC_URL=<url> IKA_PROGRAM_ID=<id> node scripts/check-ika.mjs

import { createRequire } from "module";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendDir = resolve(__dirname, "../frontend");
const frontendRequire = createRequire(resolve(frontendDir, "package.json"));

const IKA_GRPC_URL =
  process.env.IKA_GRPC_URL ?? "https://pre-alpha-dev-1.ika.ika-network.net:443";
const IKA_PROGRAM_ID =
  process.env.IKA_PROGRAM_ID ?? "87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY";

function probeSdk() {
  // npm workspaces hoists packages to root node_modules; check both locations
  const rootDir = resolve(__dirname, "..");
  const candidates = [
    resolve(frontendDir, "node_modules/@ika.xyz/sdk"),
    resolve(rootDir, "node_modules/@ika.xyz/sdk"),
  ];
  const resolvedDir = candidates.find(existsSync);
  if (!resolvedDir) {
    return {
      available: false,
      exports: [],
      error: `@ika.xyz/sdk not found in frontend/node_modules or root node_modules. Run: npm install`,
      resolvedFrom: null,
    };
  }
  try {
    const rootRequire = createRequire(resolve(rootDir, "package.json"));
    const sdk = rootRequire("@ika.xyz/sdk");
    const exports = Object.keys(sdk).filter((k) => !k.startsWith("_")).slice(0, 30);
    return { available: true, exports, error: null, resolvedFrom: resolvedDir };
  } catch (err) {
    return { available: false, exports: [], error: String(err?.message ?? err), resolvedFrom: resolvedDir };
  }
}

async function main() {
  console.log("=== IKA dWallet Rail Probe ===");
  console.log(`Source: https://solana-pre-alpha.ika.xyz/`);
  console.log(`Date: ${new Date().toISOString()}\n`);

  // 1. SDK probe
  console.log("1. SDK availability");
  const sdk = probeSdk();
  if (sdk.available) {
    console.log(`   [OK]   @ika.xyz/sdk loaded from ${sdk.resolvedFrom}`);
    if (sdk.exports.length > 0) {
      console.log(`   Exports (sample): ${sdk.exports.join(", ")}`);
    }
  } else {
    console.log("   [MISS] @ika.xyz/sdk not available");
    console.log(`   Reason: ${sdk.error}`);
  }

  // 2. Endpoint config
  console.log("\n2. Endpoint configuration");
  console.log(`   gRPC URL  : ${IKA_GRPC_URL}`);
  console.log(`   Program ID: ${IKA_PROGRAM_ID}`);
  if (IKA_GRPC_URL && IKA_PROGRAM_ID) {
    console.log("   [OK]   Endpoint and program ID configured (from env or defaults)");
  } else {
    console.log("   [MISS] Set IKA_GRPC_URL and IKA_PROGRAM_ID in .env.local");
  }

  // 3. Anchor program CPI probe
  console.log("\n3. Solana CPI probe");
  const shieldedPoolCargo = resolve(__dirname, "../programs/shielded_pool/Cargo.toml");
  const lendingPoolCargo = resolve(__dirname, "../programs/lending_pool/Cargo.toml");
  let cpiWired = false;
  for (const [label, path] of [["shielded_pool", shieldedPoolCargo], ["lending_pool", lendingPoolCargo]]) {
    if (existsSync(path)) {
      const { readFileSync } = await import("fs");
      const content = readFileSync(path, "utf8");
      const hasIkaCpi = content.includes("ika-dwallet-anchor") || content.includes("ika_dwallet_anchor");
      console.log(
        `   ${hasIkaCpi ? "[OK]  " : "[MISS]"} ${label}/Cargo.toml — ika-dwallet-anchor: ${hasIkaCpi ? "PRESENT" : "ABSENT"}`
      );
      if (hasIkaCpi) cpiWired = true;
    } else {
      console.log(`   [SKIP] ${label}/Cargo.toml not found`);
    }
  }
  if (!cpiWired) {
    console.log("   Result: Solana tx relay blocked — CPI crate not wired in any program");
  }

  // 4. Capability matrix
  console.log("\n4. Capability matrix (pre-alpha, source: https://solana-pre-alpha.ika.xyz/)");
  const capabilities = [
    {
      name: "Create dWallet          requestDWalletDKG()",
      available: sdk.available,
      note: sdk.available ? "SDK ready; requires gRPC auth (user Ed25519/Secp256k1 signature)" : "SDK not installed",
    },
    {
      name: "Approve message         approveMessage()",
      available: sdk.available,
      note: sdk.available ? "SDK ready; creates MessageApproval PDA on Sui" : "SDK not installed",
    },
    {
      name: "Sign Ed25519 message    requestSign() — EddsaSha512",
      available: sdk.available,
      note: sdk.available ? "SDK ready; MOCK SIGNER — not real MPC" : "SDK not installed",
    },
    {
      name: "FutureSign              requestFutureSign()",
      available: sdk.available,
      note: sdk.available ? "SDK ready; MOCK SIGNER — not real MPC" : "SDK not installed",
    },
    {
      name: "Solana tx relay         ika-dwallet-anchor CPI",
      available: false,
      note: "Requires Rust CPI crate in Anchor programs — NOT WIRED",
    },
    {
      name: "Real distributed MPC    network signing",
      available: false,
      note: "Pre-alpha uses single mock signer — NOT real MPC",
    },
  ];
  for (const cap of capabilities) {
    console.log(`   ${cap.available ? "[OK]  " : "[MISS]"} ${cap.name}`);
    console.log(`          ${cap.note}`);
  }

  // 5. Exact blockers
  console.log("\n5. Exact blockers for ShieldLend IKA relay signing");
  const blockers = [
    {
      id: "MOCK_SIGNER",
      summary: "Pre-alpha uses a single mock signer, not real distributed MPC.",
      source: "https://solana-pre-alpha.ika.xyz/ — 'signing uses a single mock signer, not real distributed MPC'",
      impact:
        "The security guarantee that no single party can move funds unilaterally is not yet delivered. " +
        "Pre-alpha on-chain data will be wiped before mainnet.",
    },
    {
      id: "SOLANA_CPI_ABSENT",
      summary: "ika-dwallet-anchor Rust CPI crate not in shielded_pool or lending_pool Cargo.toml.",
      source: "local — programs/shielded_pool/Cargo.toml, programs/lending_pool/Cargo.toml",
      impact:
        "Solana programs cannot verify IKA MessageApproval or accept IKA-relay-signed instructions. " +
        "Fix: add ika-dwallet-anchor dependency and wire approve_message CPI into relevant instruction handlers.",
    },
    !sdk.available
      ? {
          id: "SDK_NOT_INSTALLED",
          summary: "@ika.xyz/sdk is in package.json but not installed in node_modules.",
          source: "local — frontend/node_modules/@ika.xyz/sdk absent",
          impact: "SDK calls cannot be made. Fix: cd frontend && npm install",
        }
      : null,
  ].filter(Boolean);

  blockers.forEach((b, i) => {
    console.log(`\n   ${i + 1}. [${b.id}]`);
    console.log(`      Summary: ${b.summary}`);
    console.log(`      Source:  ${b.source}`);
    console.log(`      Impact:  ${b.impact}`);
  });

  // 6. Summary
  console.log("\n6. Summary");
  console.log(`   IKA Solana relay path works : NO`);
  console.log(`   Solana CPI wired            : NO`);
  console.log(`   SDK available               : ${sdk.available ? "YES (mock signer only — pre-alpha)" : "NO (run cd frontend && npm install)"}`);
  console.log(`   Real MPC signing            : NO (pre-alpha single mock signer)`);
  console.log(`   Safe to label as relay      : NO`);
  console.log(`   UI label to use             : "IKA pre-alpha / mock signer — Solana relay not active"`);
  console.log(`   Signer mode today           : direct_wallet (reduced privacy)`);

  // Exit 1 if SDK not installed (actionable); exit 0 if only architectural/pre-alpha blockers
  process.exit(sdk.available ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
