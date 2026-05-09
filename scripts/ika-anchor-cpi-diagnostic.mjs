#!/usr/bin/env node
// Source-backed diagnostic for the IKA Solana Anchor CPI path.
//
// This script does not submit a transaction. It verifies local compile-level
// wiring and reports the external IKA state required before a real
// approve_message CPI can be attempted.

import { createRequire } from "module";
import { existsSync, readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const frontendRequire = createRequire(resolve(rootDir, "frontend/package.json"));

const IKA_PROGRAM_ID =
  process.env.IKA_PROGRAM_ID ?? "87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY";
const LENDING_POOL_PROGRAM_ID =
  process.env.LENDING_POOL_PROGRAM_ID ?? "HLtWrvLyc2SE3ERWHaEdY4RG84GxFfHv3Qf4NzJPxaF7";
const CPI_AUTHORITY_SEED = "__ika_cpi_authority";

const requiredExternalState = [
  ["IKA_COORDINATOR", "DWalletCoordinator PDA for the current IKA epoch"],
  ["IKA_DWALLET", "dWallet account whose authority is the lending_pool CPI authority PDA"],
  ["IKA_MESSAGE_APPROVAL", "empty/writable MessageApproval PDA to be created by IKA"],
  ["IKA_LOAN_ACCOUNT", "active ShieldLend loan PDA with future_sign_authorized=true"],
  ["IKA_MESSAGE_DIGEST", "32-byte message digest to approve"],
  ["IKA_USER_PUBKEY", "32-byte user public key expected by the IKA signing flow"],
];

function ok(msg) {
  console.log(`[OK]   ${msg}`);
}

function warn(msg) {
  console.log(`[MISS] ${msg}`);
}

function info(msg) {
  console.log(`       ${msg}`);
}

function has(path, needle) {
  return existsSync(path) && readFileSync(path, "utf8").includes(needle);
}

function deriveCpiAuthority() {
  try {
    const { PublicKey } = frontendRequire("@solana/web3.js");
    const [pda, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from(CPI_AUTHORITY_SEED)],
      new PublicKey(LENDING_POOL_PROGRAM_ID)
    );
    return { pda: pda.toBase58(), bump };
  } catch (error) {
    return { error: String(error?.message ?? error) };
  }
}

console.log("=== IKA Anchor CPI Diagnostic ===");
console.log(`Source docs : https://solana-pre-alpha.ika.xyz/frameworks/anchor.html`);
console.log(`Source repo : https://github.com/dwallet-labs/ika-pre-alpha`);
console.log(`Date        : ${new Date().toISOString()}\n`);

console.log("1. Official source facts");
ok(`IKA pre-alpha Solana program ID: ${IKA_PROGRAM_ID}`);
ok(`CPI authority seed: b"${CPI_AUTHORITY_SEED}"`);
ok("approve_message instruction discriminator: 8");
ok("Official pre-alpha warning: single mock signer, not production distributed MPC");
info("The official ika-dwallet-anchor crate currently targets anchor-lang = \"1\".");
info("ShieldLend uses a local source-equivalent compatibility crate for Anchor 0.32.1.");

console.log("\n2. Local compile-level wiring");
const crateCargo = resolve(rootDir, "crates/ika-dwallet-anchor/Cargo.toml");
const crateLib = resolve(rootDir, "crates/ika-dwallet-anchor/src/lib.rs");
const lendingCargo = resolve(rootDir, "programs/lending_pool/Cargo.toml");
const lendingLib = resolve(rootDir, "programs/lending_pool/src/lib.rs");

const cratePresent = existsSync(crateCargo) && existsSync(crateLib);
const dependencyPresent = has(lendingCargo, "ika-dwallet-anchor");
const instructionPresent = has(lendingLib, "approve_ika_borrow_message");
const programIdPresent = has(lendingLib, IKA_PROGRAM_ID);
const seedPresent = has(lendingLib, "CPI_AUTHORITY_SEED");

cratePresent ? ok("local ika-dwallet-anchor compatibility crate present") : warn("local ika-dwallet-anchor compatibility crate missing");
dependencyPresent ? ok("lending_pool depends on ika-dwallet-anchor") : warn("lending_pool dependency missing");
instructionPresent ? ok("lending_pool::approve_ika_borrow_message present") : warn("approve_ika_borrow_message instruction missing");
programIdPresent ? ok("lending_pool pins the official IKA program ID") : warn("official IKA program ID not found in lending_pool");
seedPresent ? ok("lending_pool uses the official CPI authority seed") : warn("CPI authority seed not found in lending_pool");

const cpiAuthority = deriveCpiAuthority();
if (cpiAuthority.error) {
  warn(`could not derive CPI authority PDA: ${cpiAuthority.error}`);
} else {
  ok(`lending_pool IKA CPI authority PDA: ${cpiAuthority.pda} (bump ${cpiAuthority.bump})`);
}

console.log("\n3. External state needed for a real devnet CPI tx");
let missing = 0;
for (const [key, description] of requiredExternalState) {
  if (process.env[key]) {
    ok(`${key}: provided`);
  } else {
    missing += 1;
    warn(`${key}: missing`);
    info(description);
  }
}

console.log("\n4. Verdict");
if (cratePresent && dependencyPresent && instructionPresent && programIdPresent && seedPresent) {
  ok("Compile-level IKA Anchor CPI wiring is present.");
} else {
  warn("Compile-level IKA Anchor CPI wiring is incomplete.");
}

if (missing > 0) {
  warn("No live IKA approve_message transaction was submitted.");
  info("Reason: required IKA dWallet/coordinator/message approval/loan state was not supplied.");
  info("This is blocked external state, not a local relay-signing success.");
} else {
  warn("All external-state env vars are present, but this diagnostic is non-submitting by design.");
  info("Use a dedicated transaction submitter only after confirming the dWallet authority has been transferred to the CPI authority PDA.");
}
