#!/usr/bin/env node
// Probe the IKA dWallet pre-alpha rail.
// Reports SDK availability, endpoint config, Anchor CPI wiring, and exact blockers.
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
  const localCpiCrate = resolve(__dirname, "../crates/ika-dwallet-anchor/Cargo.toml");
  const shieldedPoolCargo = resolve(__dirname, "../programs/shielded_pool/Cargo.toml");
  const lendingPoolCargo = resolve(__dirname, "../programs/lending_pool/Cargo.toml");
  const lendingPoolLib = resolve(__dirname, "../programs/lending_pool/src/lib.rs");
  let cpiWired = false;
  if (existsSync(localCpiCrate)) {
    console.log("   [OK]   local ika-dwallet-anchor compatibility crate present");
  } else {
    console.log("   [MISS] local ika-dwallet-anchor compatibility crate absent");
  }
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
  if (existsSync(lendingPoolLib)) {
    const { readFileSync } = await import("fs");
    const content = readFileSync(lendingPoolLib, "utf8");
    const hasInstruction = content.includes("approve_ika_borrow_message");
    const hasSeed = content.includes("CPI_AUTHORITY_SEED");
    const hasProgramId = content.includes(IKA_PROGRAM_ID);
    console.log(`   ${hasInstruction ? "[OK]  " : "[MISS]"} lending_pool approve_ika_borrow_message instruction: ${hasInstruction ? "PRESENT" : "ABSENT"}`);
    console.log(`   ${hasSeed ? "[OK]  " : "[MISS]"} official CPI authority seed usage: ${hasSeed ? "PRESENT" : "ABSENT"}`);
    console.log(`   ${hasProgramId ? "[OK]  " : "[MISS]"} official IKA program ID: ${hasProgramId ? "PRESENT" : "ABSENT"}`);
    cpiWired = cpiWired && hasInstruction && hasSeed && hasProgramId;
  }
  if (!cpiWired) {
    console.log("   Result: Solana tx relay blocked — compile-level CPI wiring incomplete");
  } else {
    console.log("   Result: compile-level IKA Anchor CPI wiring present; live tx still requires external IKA accounts");
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
      available: cpiWired,
      note: cpiWired
        ? "Compile-wired locally; devnet DKG + dWallet authority transfer confirmed; redeployed lending_pool ID configured; latest live smoke stopped at Solana RPC fetch failure before approval"
        : "Requires Rust CPI crate + approve_message instruction in Anchor programs",
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
    cpiWired
      ? {
          id: "DEVNET_RPC_FETCH_FAILED",
          summary: "The redeployed lending_pool ID is configured, but the latest live approval smoke failed before the approval call because Solana RPC getBalance fetch failed.",
          source: "local + devnet — node scripts/ika-anchor-approval-smoke.mjs; getBalance(TypeError: fetch failed)",
          impact:
            "ShieldLend cannot yet confirm whether approve_ika_borrow_message succeeds on the redeployed lending_pool. A rerun from a healthy RPC environment is required.",
        }
      : {
          id: "SOLANA_CPI_INCOMPLETE",
          summary: "ika-dwallet-anchor CPI wiring is incomplete.",
          source: "local — crates/ika-dwallet-anchor and programs/lending_pool/src/lib.rs",
          impact:
            "Solana programs cannot call IKA approve_message until the CPI crate and instruction are present.",
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
  console.log(`   IKA Solana relay path works : NO live approval tx confirmed`);
  console.log(`   Solana CPI wired            : ${cpiWired ? "YES (compile-level approve_message CPI)" : "NO"}`);
  console.log(`   SDK available               : ${sdk.available ? "YES (mock signer only — pre-alpha)" : "NO (run cd frontend && npm install)"}`);
  console.log(`   Real MPC signing            : NO (pre-alpha single mock signer)`);
  console.log(`   Safe to label as relay      : NO`);
  console.log(`   UI label to use             : "IKA pre-alpha / DKG live, redeployed lending_pool configured, approval still unconfirmed"`);
  console.log(`   Signer mode today           : direct_wallet (reduced privacy)`);

  // Exit 1 if SDK not installed (actionable); exit 0 if only architectural/pre-alpha blockers
  process.exit(sdk.available ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
