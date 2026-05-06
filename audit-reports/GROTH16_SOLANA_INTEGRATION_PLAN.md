# groth16-solana Integration Plan — ShieldLend Solana

**Date**: 2026-05-06
**Branch**: convergence/zk-constants-artifacts
**Status**: C2E complete. Instruction args wired; DEV/TEST verifier calls live; tx size blocker documented (see B6).

---

## What Is Done (C2D Scaffold)

### Dependency

`groth16-solana = "0.0.3"` added to:
- `programs/shielded_pool/Cargo.toml`
- `programs/lending_pool/Cargo.toml`

Version 0.0.3 is required for Anchor 0.30.1 + solana-program 1.18.x. Version 0.2.0 uses the Solana 2.x SDK (agave) and conflicts with the current workspace.

### vkey Conversion Script

`scripts/convert-vkeys.mjs` converts snarkjs `_vkey.json` files (decimal projective format) to the Solana BN254 big-endian affine byte encoding required by `groth16-solana`:

- G1 affine point: `x_BE (32 bytes) || y_BE (32 bytes)` = 64 bytes
- G2 affine point: `x_c0 || x_c1 || y_c0 || y_c1` (each 32 bytes BE) = 128 bytes
- G1 negation (for `proof_a`): `(x, q − y) mod base_field_prime` — required by groth16-solana
- G2 coordinate reorder: snarkjs stores `[[c1, c0], [c1, c0]]` (c1 first); Solana alt_bn128 / EIP-197 expects `c0 || c1` order

BN254 base field prime: `21888242871839275222246405745257275088696311157297823662689037894645226208583`

### Verifier Modules

Two Rust verifier modules generated and confirmed by `cargo test --workspace`:

**`programs/shielded_pool/src/groth16_verifier.rs`**
- `WITHDRAW_VERIFYING_KEY: Groth16Verifyingkey` — nPublic=19, IC[20]
- `verify_withdraw_groth16(proof_a, proof_b, proof_c, public_inputs: &[[u8;32];19])` → `Result<bool, Groth16Error>`
- Tests: `withdraw_smoke_proof_verifies`, `withdraw_mutated_proof_fails`

**`programs/lending_pool/src/groth16_verifier.rs`**
- `COLLATERAL_VERIFYING_KEY: Groth16Verifyingkey` — nPublic=20, IC[21]
- `REPAY_VERIFYING_KEY: Groth16Verifyingkey` — nPublic=6, IC[7]
- `verify_collateral_groth16(...)` → `Result<bool, Groth16Error>`
- `verify_repay_groth16(...)` → `Result<bool, Groth16Error>`
- Tests: `collateral_smoke_proof_verifies`, `collateral_mutated_proof_fails`, `repay_smoke_proof_verifies`, `repay_mutated_proof_fails`

All six new tests pass. No test regressions. Total workspace tests: 27 (21 prior + 6 new).

## What Is Done (C2E — Verifier Wiring)

### Instruction ABI Extension

`WithdrawArgs`, `BorrowArgs`, and `RepayArgs` now carry full proof bytes and public signal arrays:

| Struct | New fields | Public signals |
|---|---|---|
| `WithdrawArgs` | `proof_a: [u8;64]`, `proof_b: [u8;128]`, `proof_c: [u8;64]` | `public_inputs: [[u8;32];19]` |
| `BorrowArgs` | same proof fields | `public_inputs: [[u8;32];20]` |
| `RepayArgs` | same proof fields | `public_inputs: [[u8;32];6]` |

`collateral_proof_public_signals_hash` and `repay_proof_public_signals_hash` removed.

### Cross-Field Consistency Guards

Each verifier checks that instruction arg fields match the corresponding public signal slots
before calling the pairing function — preventing proof-substitution attacks:

| Function | Guard |
|---|---|
| `verify_withdraw_proof` | `inputs[0] == denomination`, `inputs[17] == nullifier_hash`, `inputs[18] == root` |
| `verify_collateral_proof` | `inputs[16] == collateral_nullifier_hash`, `inputs[18] == borrow_amount`, `inputs[19] == minRatioBps` |
| `verify_repay_proof` | `inputs[0] == nullifier_hash`, `inputs[1] == loanId`, `inputs[2] == outstandingBalance`, `inputs[3] == settlementReceiptHash`, `inputs[5] == receiptBindingHash` |

Note: `inputs[4]` (repaymentVault) is not cross-checked because `verify_repay_proof` does not
have access to the `LoanAccount`. It is explicitly documented as skipped.

### Frontend Additions (`frontend/src/lib/solanaClient.ts`)

- `PROOF_INSTRUCTION_COMPUTE_UNITS = 1_400_000`
- `buildComputeBudgetInstruction()` — returns `ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })`
- `BN254_PRIME` constant
- `bigintToBeBytes32(n: bigint): Uint8Array`
- `SerializedProof` interface (`proof_a/b/c: Uint8Array`, `public_inputs: Uint8Array[]`)
- `serializeProofBytes(result)` — converts snarkjs `fullProve()` output to groth16-solana encoding
  (negates pi_a.y; reorders G2 from snarkjs `[c1,c0]` to Solana `[c0,c1]`)

### New Tests (14 new, total workspace 38)

| Program | Test |
|---|---|
| `shielded_pool` | `withdraw_proof_with_valid_smoke_vector_passes` |
| `shielded_pool` | `withdraw_proof_with_empty_proof_fails` |
| `shielded_pool` | `withdraw_proof_with_mutated_proof_fails` |
| `shielded_pool` | `withdraw_proof_with_mismatched_nullifier_fails` |
| `lending_pool` | `collateral_proof_with_valid_smoke_vector_passes` |
| `lending_pool` | `collateral_proof_with_empty_proof_fails` |
| `lending_pool` | `collateral_proof_with_mutated_proof_fails` |
| `lending_pool` | `collateral_proof_with_mismatched_nullifier_fails` |
| `lending_pool` | `repay_proof_with_valid_smoke_vector_passes` |
| `lending_pool` | `repay_proof_with_empty_proof_fails` |
| `lending_pool` | `repay_proof_with_mutated_proof_fails` |
| `lending_pool` | `repay_proof_with_mismatched_nullifier_fails` |

All 38 workspace tests pass.

### API Notes (groth16-solana 0.0.3)

```rust
// Struct field name has intentional double-m typo in 0.0.3:
pub struct Groth16Verifyingkey<'a> {
    pub nr_pubinputs: usize,
    pub vk_alpha_g1:  [u8; 64],
    pub vk_beta_g2:   [u8; 128],
    pub vk_gamme_g2:  [u8; 128],  // <- NOT vk_gamma_g2
    pub vk_delta_g2:  [u8; 128],
    pub vk_ic:        &'a [[u8; 64]],
}

// verify() takes &mut self and returns bool (not ()):
let mut verifier = Groth16Verifier::new(proof_a, proof_b, proof_c, public_inputs, &VK)?;
let ok: bool = verifier.verify()?;
```

---

## What Remains Blocked

### Blocker 6 (new, C2E): Transaction MTU — withdraw instruction exceeds 1232-byte Solana limit

**`WithdrawArgs` serialized size**: ~976 bytes (32+32+8+32+8+64+128+64+608 for 19 public inputs).

Full transaction: 8-byte discriminator + 976-byte args + ~300 bytes overhead (signature 64, 8–9 account keys at 32 each, blockhash 32, instruction framing) ≈ **~1284 bytes > 1232-byte MTU**.

This does not affect Rust unit tests (no transaction overhead). It blocks on-chain execution of the `withdraw` instruction in its current form.

**Resolution options (not yet implemented):**
1. Proof account pattern — write proof bytes to a separate PDA before calling withdraw; handler reads from account.
2. `remaining_accounts` + proof loader — pass proof account index in args; handler reads from account slice.
3. Split transaction — not safe for atomic nullifier spending; do not use.

`BorrowArgs` (~1016 bytes args) and `RepayArgs` (~456 bytes args) also need evaluation;
repay is well within limit, borrow is marginal.

**Blockers 1–5 from C2C are resolved.** (B1 dep: done. B2 ABI extension: done. B3 vkey script: done. B4 test vectors: done. B5 compute budget: done.)

---

## Recommended Wiring Sequence

1. Merge `fix/backend-critical` fixes (zero-root guard, nullifier state machine).
2. Extend `WithdrawArgs` / `BorrowArgs` / `RepayArgs` with proof bytes and public signal arrays.
3. Update frontend to construct and pass proof bytes from snarkjs `fullProve()` output.
4. Replace the `Groth16VerifierNotWired` stubs in `verify_withdraw_proof`, `verify_collateral_proof`, `verify_repay_proof` with calls to the verifier module functions.
5. Add `ComputeBudgetProgram::set_compute_unit_limit` to client transaction builders.
6. Run Anchor localnet test with a real proof end-to-end.

---

## Public Signal Ordering (groth16-solana `public_inputs` parameter order)

### withdraw_ring (nPublic=19)

```
[0]     denomination          (u64 as BE u256)
[1..16] ring[0..15]           (16 commitment hashes)
[17]    nullifierHash
[18]    root
```

### collateral_ring (nPublic=20)

```
[0..15] ring[0..15]
[16]    nullifierHash
[17]    root
[18]    borrowed              (u64 as BE u256)
[19]    minRatioBps           (u64 as BE u256)
```

### repay_ring (nPublic=6)

```
[0]     nullifierHash
[1]     loanId
[2]     outstandingBalance
[3]     settlementReceiptHash
[4]     repaymentVault
[5]     receiptBindingHash
```

---

## Artifact Posture

All verifying keys and smoke test vectors in these modules were generated from `circuits/keys/dev_pot14_final.ptau` — a single-party dev setup, not a reviewed production ceremony. These are DEV/TEST-only artifacts. Do not claim production trusted setup, on-chain privacy, or live verification until reviewed ceremony material is in place.
