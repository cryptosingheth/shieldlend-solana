#!/usr/bin/env node
// scripts/convert-vkeys.mjs
//
// Converts snarkjs _vkey.json files to Rust constants for groth16-solana 0.0.3.
// Also converts build/circuits/smoke/ proof files to Rust test vectors.
//
// Usage: node scripts/convert-vkeys.mjs
//
// Outputs:
//   programs/shielded_pool/src/groth16_verifier.rs
//   programs/lending_pool/src/groth16_verifier.rs

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BUILD = join(ROOT, "build", "circuits");
const SMOKE = join(BUILD, "smoke");

// BN254 base field prime (for G1/G2 coordinate arithmetic).
const BASE_FIELD_PRIME =
  21888242871839275222246405745257275088696311157297823662689037894645226208583n;

function bigintTo32BE(value) {
  const hex = value.toString(16).padStart(64, "0");
  if (hex.length !== 64) throw new Error(`value too large: ${value}`);
  return Buffer.from(hex, "hex");
}

// G1 affine point from snarkjs format [x_dec, y_dec, "1"] -> 64 bytes [x_BE || y_BE]
function g1Bytes(point) {
  return Buffer.concat([
    bigintTo32BE(BigInt(point[0])),
    bigintTo32BE(BigInt(point[1])),
  ]);
}

// Negated G1 (for proof_a — groth16-solana requires -pi_a).
// Negation: (x, y) -> (x, p - y) mod base field prime.
function g1NegBytes(point) {
  return Buffer.concat([
    bigintTo32BE(BigInt(point[0])),
    bigintTo32BE(BASE_FIELD_PRIME - BigInt(point[1])),
  ]);
}

// G2 affine point from snarkjs format [[c1, c0], [c1, c0], ["1","0"]] -> 128 bytes.
// snarkjs stores c1 at index [i][0] and c0 at index [i][1].
// Solana alt_bn128 pairing (EIP-197) expects: x_c0 || x_c1 || y_c0 || y_c1 (BE).
function g2Bytes(point) {
  return Buffer.concat([
    bigintTo32BE(BigInt(point[0][1])), // x_c0
    bigintTo32BE(BigInt(point[0][0])), // x_c1
    bigintTo32BE(BigInt(point[1][1])), // y_c0
    bigintTo32BE(BigInt(point[1][0])), // y_c1
  ]);
}

// Format a Buffer as a Rust inline byte array literal with 16 bytes per row.
function rustByteLiteral(buf) {
  const bytes = Array.from(buf).map((b) => `0x${b.toString(16).padStart(2, "0")}`);
  const rows = [];
  for (let i = 0; i < bytes.length; i += 16) {
    rows.push("        " + bytes.slice(i, Math.min(i + 16, bytes.length)).join(", "));
  }
  return `[\n${rows.join(",\n")}\n    ]`;
}

// Convert a vkey JSON to the Rust verifying-key static and IC array.
function vkeyToRust(vkeyPath, circuitName, constName, nPublic) {
  const vkey = JSON.parse(readFileSync(vkeyPath, "utf8"));
  const ic = vkey.IC.map(g1Bytes);
  const icLen = ic.length; // nPublic + 1

  let lines = [];
  lines.push(`// DEV/TEST verifying key for ${circuitName}.`);
  lines.push(`// Generated from dev_pot14_final.ptau — NOT a production trusted setup.`);
  lines.push(`// Regenerate with: node scripts/convert-vkeys.mjs`);
  lines.push(`#[rustfmt::skip]`);
  lines.push(`static ${constName}_IC: [[u8; 64]; ${icLen}] = [`);
  for (let i = 0; i < ic.length; i++) {
    lines.push(`    // IC[${i}]`);
    lines.push(`    ${rustByteLiteral(ic[i]).trim()},`);
  }
  lines.push(`];`);
  lines.push(``);
  lines.push(`#[rustfmt::skip]`);
  lines.push(`pub static ${constName}: Groth16Verifyingkey<'static> = Groth16Verifyingkey {`);
  lines.push(`    nr_pubinputs: ${nPublic},`);
  lines.push(`    vk_alpha_g1: ${rustByteLiteral(g1Bytes(vkey.vk_alpha_1)).trim()},`);
  lines.push(`    vk_beta_g2:  ${rustByteLiteral(g2Bytes(vkey.vk_beta_2)).trim()},`);
  // Field name is spelled "vk_gamme_g2" (double-m) in groth16-solana 0.0.3.
  lines.push(`    vk_gamme_g2: ${rustByteLiteral(g2Bytes(vkey.vk_gamma_2)).trim()},`);
  lines.push(`    vk_delta_g2: ${rustByteLiteral(g2Bytes(vkey.vk_delta_2)).trim()},`);
  lines.push(`    vk_ic: &${constName}_IC,`);
  lines.push(`};`);
  return lines.join("\n");
}

// Convert smoke proof + public signals to Rust test vector constants.
function smokeVectorsToRust(proofPath, publicPath, circuitName, prefix, nPublic) {
  const proof = JSON.parse(readFileSync(proofPath, "utf8"));
  const signals = JSON.parse(readFileSync(publicPath, "utf8"));

  const proofA = g1NegBytes(proof.pi_a);
  const proofB = g2Bytes(proof.pi_b);
  const proofC = g1Bytes(proof.pi_c);
  const pubSignals = signals.map((s) => bigintTo32BE(BigInt(s)));

  let lines = [];
  lines.push(`// DEV/TEST smoke proof vectors for ${circuitName}.`);
  lines.push(`// proof_a is the NEGATED pi_a (required by groth16-solana).`);
  lines.push(`// Regenerate with: node scripts/convert-vkeys.mjs`);
  lines.push(`#[rustfmt::skip]`);
  lines.push(`pub const ${prefix}_PROOF_A: [u8; 64] = ${rustByteLiteral(proofA).trim()};`);
  lines.push(`#[rustfmt::skip]`);
  lines.push(`pub const ${prefix}_PROOF_B: [u8; 128] = ${rustByteLiteral(proofB).trim()};`);
  lines.push(`#[rustfmt::skip]`);
  lines.push(`pub const ${prefix}_PROOF_C: [u8; 64] = ${rustByteLiteral(proofC).trim()};`);
  lines.push(`#[rustfmt::skip]`);
  lines.push(`pub const ${prefix}_PUBLIC_SIGNALS: [[u8; 32]; ${nPublic}] = [`);
  for (let i = 0; i < pubSignals.length; i++) {
    lines.push(`    // signal[${i}]`);
    lines.push(`    ${rustByteLiteral(pubSignals[i]).trim()},`);
  }
  lines.push(`];`);
  return lines.join("\n");
}

// ── shielded_pool: withdraw verifier ─────────────────────────────────────────

const withdrawVkey = vkeyToRust(
  join(BUILD, "withdraw_ring_vkey.json"),
  "withdraw_ring",
  "WITHDRAW_VERIFYING_KEY",
  19
);
const withdrawSmoke = smokeVectorsToRust(
  join(SMOKE, "withdraw_proof.json"),
  join(SMOKE, "withdraw_public.json"),
  "withdraw_ring",
  "WITHDRAW_SMOKE",
  19
);

const shieldedPoolVerifier = `// programs/shielded_pool/src/groth16_verifier.rs
//
// DEV/TEST on-chain Groth16 verifier helper for withdraw_ring.
// NOT called from any instruction handler yet — fail-closed behavior is preserved.
// Wire into verify_withdraw_proof() only after extending WithdrawArgs with proof bytes.
//
// Compute budget note: BN254 Groth16 for withdraw_ring (nPublic=19) requires
// approximately 220k–260k CU. Callers must prepend ComputeBudgetProgram::
// set_compute_unit_limit(1_400_000) before this instruction.

use groth16_solana::groth16::{Groth16Verifier, Groth16Verifyingkey};

${withdrawVkey}

/// Verify a withdraw_ring Groth16 proof.
///
/// # Arguments
/// - \`proof_a\`: 64-byte BN254 G1 point, **negated** (caller must negate pi_a).
/// - \`proof_b\`: 128-byte BN254 G2 point (pi_b, no negation).
/// - \`proof_c\`: 64-byte BN254 G1 point (pi_c, no negation).
/// - \`public_inputs\`: 19 × 32-byte big-endian field elements in public_signals.json order.
///
/// All byte arrays are big-endian as required by Solana alt_bn128 syscalls.
pub fn verify_withdraw_groth16(
    proof_a: &[u8; 64],
    proof_b: &[u8; 128],
    proof_c: &[u8; 64],
    public_inputs: &[[u8; 32]; 19],
) -> Result<bool, groth16_solana::errors::Groth16Error> {
    let mut verifier = Groth16Verifier::new(
        proof_a,
        proof_b,
        proof_c,
        public_inputs,
        &WITHDRAW_VERIFYING_KEY,
    )?;
    verifier.verify()
}

#[cfg(test)]
mod tests {
    use super::*;

${withdrawSmoke.split("\n").map((l) => "    " + l).join("\n")}

    #[test]
    fn withdraw_smoke_proof_verifies() {
        verify_withdraw_groth16(
            &WITHDRAW_SMOKE_PROOF_A,
            &WITHDRAW_SMOKE_PROOF_B,
            &WITHDRAW_SMOKE_PROOF_C,
            &WITHDRAW_SMOKE_PUBLIC_SIGNALS,
        )
        .expect("smoke proof must verify");
    }

    #[test]
    fn withdraw_mutated_proof_fails() {
        let mut bad_a = WITHDRAW_SMOKE_PROOF_A;
        bad_a[32] ^= 0xff; // flip a byte in the Y coordinate
        assert!(
            verify_withdraw_groth16(
                &bad_a,
                &WITHDRAW_SMOKE_PROOF_B,
                &WITHDRAW_SMOKE_PROOF_C,
                &WITHDRAW_SMOKE_PUBLIC_SIGNALS,
            )
            .is_err(),
            "mutated proof must not verify"
        );
    }
}
`;

// ── lending_pool: collateral + repay verifiers ────────────────────────────────

const collateralVkey = vkeyToRust(
  join(BUILD, "collateral_ring_vkey.json"),
  "collateral_ring",
  "COLLATERAL_VERIFYING_KEY",
  20
);
const collateralSmoke = smokeVectorsToRust(
  join(SMOKE, "collateral_proof.json"),
  join(SMOKE, "collateral_public.json"),
  "collateral_ring",
  "COLLATERAL_SMOKE",
  20
);

const repayVkey = vkeyToRust(
  join(BUILD, "repay_ring_vkey.json"),
  "repay_ring",
  "REPAY_VERIFYING_KEY",
  6
);
const repaySmoke = smokeVectorsToRust(
  join(SMOKE, "repay_proof.json"),
  join(SMOKE, "repay_public.json"),
  "repay_ring",
  "REPAY_SMOKE",
  6
);

const lendingPoolVerifier = `// programs/lending_pool/src/groth16_verifier.rs
//
// DEV/TEST on-chain Groth16 verifier helpers for collateral_ring and repay_ring.
// NOT called from any instruction handler yet — fail-closed behavior is preserved.
// Wire into verify_collateral_proof() and verify_repay_proof() only after extending
// BorrowArgs and RepayArgs with proof bytes.
//
// Compute budget note: BN254 Groth16 for collateral_ring (nPublic=20) requires
// approximately 220k–260k CU. repay_ring (nPublic=6) is cheaper (~80k CU).
// Callers must prepend ComputeBudgetProgram::set_compute_unit_limit(1_400_000)
// before any instruction that calls these verifiers.

use groth16_solana::groth16::{Groth16Verifier, Groth16Verifyingkey};

${collateralVkey}

${repayVkey}

/// Verify a collateral_ring Groth16 proof.
///
/// # Arguments
/// - \`proof_a\`: 64-byte G1, **negated** (caller must negate pi_a).
/// - \`proof_b\`: 128-byte G2 (pi_b, no negation).
/// - \`proof_c\`: 64-byte G1 (pi_c, no negation).
/// - \`public_inputs\`: 20 × 32-byte BE field elements in public_signals.json order.
pub fn verify_collateral_groth16(
    proof_a: &[u8; 64],
    proof_b: &[u8; 128],
    proof_c: &[u8; 64],
    public_inputs: &[[u8; 32]; 20],
) -> Result<bool, groth16_solana::errors::Groth16Error> {
    let mut verifier = Groth16Verifier::new(
        proof_a,
        proof_b,
        proof_c,
        public_inputs,
        &COLLATERAL_VERIFYING_KEY,
    )?;
    verifier.verify()
}

/// Verify a repay_ring Groth16 proof.
///
/// # Arguments
/// - \`proof_a\`: 64-byte G1, **negated** (caller must negate pi_a).
/// - \`proof_b\`: 128-byte G2 (pi_b, no negation).
/// - \`proof_c\`: 64-byte G1 (pi_c, no negation).
/// - \`public_inputs\`: 6 × 32-byte BE field elements in public_signals.json order.
pub fn verify_repay_groth16(
    proof_a: &[u8; 64],
    proof_b: &[u8; 128],
    proof_c: &[u8; 64],
    public_inputs: &[[u8; 32]; 6],
) -> Result<bool, groth16_solana::errors::Groth16Error> {
    let mut verifier = Groth16Verifier::new(
        proof_a,
        proof_b,
        proof_c,
        public_inputs,
        &REPAY_VERIFYING_KEY,
    )?;
    verifier.verify()
}

#[cfg(test)]
mod tests {
    use super::*;

${collateralSmoke.split("\n").map((l) => "    " + l).join("\n")}

${repaySmoke.split("\n").map((l) => "    " + l).join("\n")}

    #[test]
    fn collateral_smoke_proof_verifies() {
        verify_collateral_groth16(
            &COLLATERAL_SMOKE_PROOF_A,
            &COLLATERAL_SMOKE_PROOF_B,
            &COLLATERAL_SMOKE_PROOF_C,
            &COLLATERAL_SMOKE_PUBLIC_SIGNALS,
        )
        .expect("smoke proof must verify");
    }

    #[test]
    fn collateral_mutated_proof_fails() {
        let mut bad_a = COLLATERAL_SMOKE_PROOF_A;
        bad_a[32] ^= 0xff;
        assert!(
            verify_collateral_groth16(
                &bad_a,
                &COLLATERAL_SMOKE_PROOF_B,
                &COLLATERAL_SMOKE_PROOF_C,
                &COLLATERAL_SMOKE_PUBLIC_SIGNALS,
            )
            .is_err()
        );
    }

    #[test]
    fn repay_smoke_proof_verifies() {
        verify_repay_groth16(
            &REPAY_SMOKE_PROOF_A,
            &REPAY_SMOKE_PROOF_B,
            &REPAY_SMOKE_PROOF_C,
            &REPAY_SMOKE_PUBLIC_SIGNALS,
        )
        .expect("smoke proof must verify");
    }

    #[test]
    fn repay_mutated_proof_fails() {
        let mut bad_a = REPAY_SMOKE_PROOF_A;
        bad_a[32] ^= 0xff;
        assert!(
            verify_repay_groth16(
                &bad_a,
                &REPAY_SMOKE_PROOF_B,
                &REPAY_SMOKE_PROOF_C,
                &REPAY_SMOKE_PUBLIC_SIGNALS,
            )
            .is_err()
        );
    }
}
`;

// Write the generated files
writeFileSync(
  join(ROOT, "programs", "shielded_pool", "src", "groth16_verifier.rs"),
  shieldedPoolVerifier
);
writeFileSync(
  join(ROOT, "programs", "lending_pool", "src", "groth16_verifier.rs"),
  lendingPoolVerifier
);

console.log("vkey conversion complete.");
console.log("Generated:");
console.log("  programs/shielded_pool/src/groth16_verifier.rs");
console.log("  programs/lending_pool/src/groth16_verifier.rs");
