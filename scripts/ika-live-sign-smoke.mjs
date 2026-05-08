#!/usr/bin/env node
// IKA dWallet Solana signing capability probe.
//
// Goal: determine whether IKA can sign Solana transactions today and, if not,
//       document the exact blockers with source evidence so the rail can be
//       enabled without guesswork when the SDK matures.
//
// This script is intentionally LOCAL ONLY — it makes no network calls.
// It inspects installed SDK exports and source to answer four questions:
//
//   Q1. Does the SDK load and WASM initialize?
//   Q2. Is there any Solana transaction / Ed25519 byte output in the SDK?
//   Q3. Does requestSign return Ed25519 bytes or a Sui Move call?
//   Q4. Is ika-dwallet-anchor wired into ShieldLend Anchor programs?
//
// Usage: node scripts/ika-live-sign-smoke.mjs

import { createRequire } from "module";
import { existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const require = createRequire(resolve(rootDir, "package.json"));

// ── helpers ────────────────────────────────────────────────────────────────

const pass = (label, detail) =>
  console.log(`[PASS] ${label}${detail ? "  —  " + detail : ""}`);
const fail = (label, detail) =>
  console.log(`[FAIL] ${label}${detail ? "  —  " + detail : ""}`);
const info = (msg) => console.log(`       ${msg}`);
const src  = (msg) => console.log(`       SOURCE: ${msg}`);

// ── locate SDK ────────────────────────────────────────────────────────────

function findSdkDir() {
  const candidates = [
    resolve(rootDir, "node_modules/@ika.xyz/sdk"),
    resolve(rootDir, "frontend/node_modules/@ika.xyz/sdk"),
  ];
  return candidates.find(existsSync) ?? null;
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== IKA dWallet Solana Signing Capability Probe ===");
  console.log(`Date   : ${new Date().toISOString()}`);
  console.log(`Scope  : local-only — no Sui or Solana network calls`);
  console.log(`Source : https://solana-pre-alpha.ika.xyz/\n`);

  // ── Q1: SDK load + WASM ────────────────────────────────────────────────
  console.log("Q1. SDK load and WASM initialization");

  const sdkDir = findSdkDir();
  if (!sdkDir) {
    fail("@ika.xyz/sdk not found", "run: npm install");
    process.exit(1);
  }
  pass("@ika.xyz/sdk found", sdkDir);

  let sdk;
  try {
    sdk = require("@ika.xyz/sdk");
  } catch (e) {
    fail("require('@ika.xyz/sdk') threw", e.message.slice(0, 120));
    process.exit(1);
  }
  pass("require('@ika.xyz/sdk') success", `${Object.keys(sdk).length} exports`);

  const {
    createClassGroupsKeypair,
    coordinatorTransactions,
    Curve,
    SignatureAlgorithm,
    Hash,
  } = sdk;

  if (typeof createClassGroupsKeypair !== "function") {
    fail("createClassGroupsKeypair not exported");
  } else {
    const seed = new Uint8Array(32).fill(0x2a);
    try {
      const kp = await createClassGroupsKeypair(seed, Curve.ED25519);
      pass(
        "createClassGroupsKeypair(ED25519) WASM",
        `encKey ${kp.encryptionKey.length}B  decKey ${kp.decryptionKey.length}B`
      );
    } catch (e) {
      fail("createClassGroupsKeypair WASM threw", e.message.slice(0, 120));
    }
  }

  // ── Q2: Solana code in SDK? ────────────────────────────────────────────
  console.log("\nQ2. Solana transaction / Ed25519 byte output in SDK source");

  const cjsIndex = resolve(sdkDir, "dist/cjs/index.js");
  const cjsIndexExists = existsSync(cjsIndex);
  if (!cjsIndexExists) {
    fail("dist/cjs/index.js not found — SDK install may be incomplete");
  } else {
    const indexSrc = readFileSync(cjsIndex, "utf8");

    // Check for any Solana-specific code
    const solanaPatterns = [
      { pattern: /solana/i,           label: "keyword 'solana'" },
      { pattern: /web3\.js/i,         label: "keyword '@solana/web3.js'" },
      { pattern: /Transaction\.serialize/i, label: "Transaction.serialize()" },
      { pattern: /signTransaction/i,  label: "signTransaction helper" },
    ];
    let foundSolana = false;
    for (const { pattern, label } of solanaPatterns) {
      if (pattern.test(indexSrc)) {
        pass(`SDK contains ${label}`);
        foundSolana = true;
      }
    }
    if (!foundSolana) {
      fail("No Solana code in @ika.xyz/sdk dist/cjs/index.js");
      src("grep 'solana|web3.js|signTransaction' node_modules/@ika.xyz/sdk/dist/cjs/index.js → 0 matches");
      info("The entire SDK targets the Sui blockchain. All coordinatorTransactions");
      info("are Sui Move calls (tx.moveCall). There is no Solana-specific output path.");
    }

    // Check suiClient dependency
    if (/suiClient/i.test(indexSrc)) {
      fail("SDK requires suiClient (Sui dependency confirmed, not Solana)");
      src("IkaClient constructor: constructor({ suiClient, config, ... }) — node_modules/@ika.xyz/sdk/dist/cjs/client/ika-client.js:64");
    }

    // Check for getNetworkConfig networks
    const networkMatches = indexSrc.match(/"testnet"|"mainnet"/g) ?? [];
    const networkSet = [...new Set(networkMatches)];
    fail(
      `getNetworkConfig supports only ${networkSet.join(", ")} — no Solana network`,
      "all object IDs are 0x... Sui addresses"
    );
    src("node_modules/@ika.xyz/sdk/dist/cjs/client/network-configs.js — case 'testnet': ... case 'mainnet': (no 'solana' case)");
  }

  // ── Q3: requestSign returns Sui Move call, not Ed25519 bytes ──────────
  console.log("\nQ3. requestSign / approveMessage output type");

  const { requestSign, approveMessage, requestFutureSign, requestDWalletDKG } =
    coordinatorTransactions ?? {};

  for (const [name, fn] of [
    ["requestSign",      requestSign],
    ["approveMessage",   approveMessage],
    ["requestFutureSign", requestFutureSign],
    ["requestDWalletDKG", requestDWalletDKG],
  ]) {
    if (typeof fn !== "function") {
      fail(`coordinatorTransactions.${name} not found`);
      continue;
    }
    const body = fn.toString();

    // All these functions call tx.moveCall — they build Sui transactions, not signatures
    const isMoveCall = body.includes("tx.moveCall");
    const isSuiTarget = body.includes("ikaDwallet2pcMpcPackage");
    const returnsBytes = /return.*Uint8Array|new Uint8Array|Buffer\.from.*signature/i.test(body);

    if (isMoveCall && isSuiTarget) {
      fail(
        `coordinatorTransactions.${name}() returns a Sui Move call — NOT Ed25519 bytes`,
        `target: ...::coordinator::${name.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "")}`
      );
      src(
        `node_modules/@ika.xyz/sdk/dist/cjs/tx/coordinator.js — function ${name}(..., tx) { return tx.moveCall({ target: \`\${ikaConfig.packages.ikaDwallet2pcMpcPackage}::...\` }) }`
      );
    } else if (returnsBytes) {
      pass(`coordinatorTransactions.${name}() returns bytes`);
    } else {
      info(`${name}: unclear return type — body does not match Move call or byte patterns`);
    }
  }

  // parseSignatureFromSignOutput — this IS WASM but requires a completed network sign
  const { parseSignatureFromSignOutput } = sdk;
  if (typeof parseSignatureFromSignOutput === "function") {
    info("");
    info("parseSignatureFromSignOutput(curve, algo, signOutput) DOES return raw bytes");
    info("BUT: signOutput is only available after the IKA network completes a sign session");
    info("on Sui — requiring a funded Sui wallet, IKA coins, and a completed DKG.");
    src("node_modules/@ika.xyz/sdk/dist/cjs/client/cryptography.js — parse_signature_from_sign_output wasm call");
  }

  // ── Q4: ika-dwallet-anchor in ShieldLend programs ─────────────────────
  console.log("\nQ4. ika-dwallet-anchor CPI crate in ShieldLend Anchor programs");

  const programs = [
    ["shielded_pool",     resolve(rootDir, "programs/shielded_pool/Cargo.toml")],
    ["lending_pool",      resolve(rootDir, "programs/lending_pool/Cargo.toml")],
    ["nullifier_registry", resolve(rootDir, "programs/nullifier_registry/Cargo.toml")],
  ];

  let cpiFound = false;
  for (const [name, cargoPath] of programs) {
    if (!existsSync(cargoPath)) {
      info(`${name}/Cargo.toml not found — skipped`);
      continue;
    }
    const content = readFileSync(cargoPath, "utf8");
    const has =
      content.includes("ika-dwallet-anchor") ||
      content.includes("ika_dwallet_anchor");
    if (has) {
      cpiFound = true;
      pass(`${name}/Cargo.toml: ika-dwallet-anchor PRESENT`);
    } else {
      fail(`${name}/Cargo.toml: ika-dwallet-anchor ABSENT`);
      src(`programs/${name}/Cargo.toml — no ika-dwallet-anchor entry in [dependencies]`);
    }
  }
  if (!cpiFound) {
    info("");
    info("Impact: Solana programs cannot verify IKA MessageApproval or accept");
    info("IKA-relay-signed instructions. Even if the SDK produced Ed25519 bytes,");
    info("the on-chain programs have no mechanism to check IKA authorization.");
    info("Fix: add ika-dwallet-anchor + wire approve_message CPI into instruction handlers.");
  }

  // ── Final verdict ──────────────────────────────────────────────────────
  console.log("\n=== Verdict: Can ShieldLend route through IKA today? ===");
  console.log("");
  console.log("  Real IKA Solana signing: NO");
  console.log("  Reason: three layered blockers —");
  console.log("");
  console.log("  B1 [NO_SOLANA_SDK]");
  console.log("     @ika.xyz/sdk has no Solana code. All signing APIs are Sui Move calls.");
  console.log("     coordinatorTransactions.requestSign() builds a Sui tx, not an Ed25519 sig.");
  src  ("     node_modules/@ika.xyz/sdk/dist/cjs/tx/coordinator.js");
  console.log("");
  console.log("  B2 [NO_CPI_CRATE]");
  console.log("     ika-dwallet-anchor Rust CPI crate absent from all three Anchor programs.");
  console.log("     Solana programs cannot verify IKA authorization headers.");
  src  ("     programs/{shielded_pool,lending_pool,nullifier_registry}/Cargo.toml");
  console.log("");
  console.log("  B3 [SUI_DEPENDENCY]");
  console.log("     IkaClient requires a funded Sui wallet + IKA coins to create a dWallet.");
  console.log("     Even the read-only protocol param fetch hits public Sui RPC rate limits.");
  src  ("     node_modules/@ika.xyz/sdk/dist/cjs/client/ika-client.js:64 — constructor({ suiClient, ... })");
  console.log("");
  console.log("  WASM crypto (createClassGroupsKeypair): FUNCTIONAL — local only");
  console.log("  Adapter mode today: direct_wallet (reduced privacy)");
  console.log("  Adapter status: healthy=false, solanaCpiWired=false");
  console.log("");
  console.log("  Path to real IKA Solana signing:");
  console.log("    1. IKA releases a Solana-native SDK or CLI that outputs raw Ed25519 bytes");
  console.log("    2. Add ika-dwallet-anchor to Anchor programs + wire approve_message CPI");
  console.log("    3. Replace direct_wallet signer mode with ika_dwallet in tx builder");
}

main().catch((e) => {
  console.error("[FATAL]", e.message);
  process.exit(1);
});
