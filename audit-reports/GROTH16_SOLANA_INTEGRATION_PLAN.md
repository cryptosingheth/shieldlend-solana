# groth16-solana Integration Plan — ShieldLend Solana

**Date**: 2026-05-06
**Branch**: convergence/zk-constants-artifacts
**Status**: C2G-B complete. All three programs deployed. initialize confirmed. store_withdraw_proof confirmed. withdraw hits UnknownRoot as expected (no deposit). Remaining gap: deposit → flush_epoch → full round-trip.

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

## What Is Done (C2F — Proof Account PDA Pattern)

### B6 Resolution: Proof Account Pattern

`WithdrawArgs`, `BorrowArgs`, and `RepayArgs` were slimmed by removing inline proof bytes.
Proof data is written to a PDA in a prior transaction; the main instruction reads from the account.

**Slimmed arg struct sizes:**

| Struct | C2E bytes | C2F bytes | Change |
|---|---|---|---|
| `WithdrawArgs` | ~976 | 144 | −832 |
| `BorrowArgs` | ~1016 | 124 | −892 |
| `RepayArgs` | ~456 | 144 | −312 |

**New instructions:**

| Program | Instruction | Public inputs | Est. tx size |
|---|---|---|---|
| `shielded_pool` | `store_withdraw_proof` | `[[u8;32];19]` | ~1109 bytes ✓ |
| `lending_pool` | `store_collateral_proof` | `[[u8;32];20]` | ~1141 bytes ✓ |
| `lending_pool` | `store_repay_proof` | `[[u8;32];6]` | ~693 bytes ✓ |

**`ProofData` account layout:**

| Program | Field | Bytes |
|---|---|---|
| both | discriminator | 8 |
| both | `authority: Pubkey` | 32 |
| both | `circuit_kind: ProofKind` | 1 |
| both | `proof_a: [u8;64]` | 64 |
| both | `proof_b: [u8;128]` | 128 |
| both | `proof_c: [u8;64]` | 64 |
| lending_pool only | `public_input_count: u8` | 1 |
| shielded_pool | `public_inputs: [[u8;32];19]` | 608 |
| lending_pool | `public_inputs: [[u8;32];20]` | 640 |
| both | `consumed: bool` | 1 |
| both | `bump: u8` | 1 |
| **shielded_pool total** | | **908** |
| **lending_pool total** | | **940** |

**Security properties of the PDA design:**
- `consumed` flag — prevents proof replay across two `withdraw`/`borrow` calls
- `circuit_kind` discriminant (`Withdraw`, `Collateral`, `Repay`) — prevents cross-circuit substitution
- `authority` field + constraint (`proof_data.authority == signer`) — prevents cross-user proof theft
- PDA seeds: `[b"proof-data", authority, proof_nonce]` — per-use nonce prevents PDA reuse

### Updated Frontend (`frontend/src/lib/solanaClient.ts`)

- `WITHDRAW_PROOF_DATA_SPACE = 908`, `LENDING_PROOF_DATA_SPACE = 940`
- `generateProofNonce()` — random 32-byte nonce
- `getWithdrawProofDataPda(authority, proofNonce)` / `getLendingProofDataPda(authority, proofNonce)`
- `buildStoreWithdrawProofInstruction(params)` — builds shielded_pool `store_withdraw_proof`
- `buildStoreCollateralProofInstruction(params)` — builds lending_pool `store_collateral_proof`
- `buildStoreRepayProofInstruction(params)` — builds lending_pool `store_repay_proof`

### New Tests (9 new, total workspace 47)

| Program | Test |
|---|---|
| `shielded_pool` | `proof_data_space_constant_matches_struct_layout` |
| `shielded_pool` | `store_withdraw_proof_stores_expected_payload` |
| `shielded_pool` | `withdraw_proof_with_consumed_proof_fails` |
| `shielded_pool` | `withdraw_proof_with_wrong_kind_fails` |
| `lending_pool` | `collateral_proof_with_consumed_proof_fails` |
| `lending_pool` | `collateral_proof_with_wrong_kind_fails` |
| `lending_pool` | `repay_proof_with_consumed_proof_fails` |
| `lending_pool` | `repay_proof_with_wrong_kind_fails` |
| `lending_pool` | `proof_data_space_constant_matches_struct_layout` |

All 47 workspace tests pass.

## What Remains Blocked

**Blockers 1–6 from C2C/C2E are all resolved.** (B1 dep: done. B2 ABI: done. B3 vkey script: done. B4 test vectors: done. B5 compute budget: done. B6 tx MTU: done.)

**B7 — RESOLVED (C2G-A):** `Box<Account<'info, ProofData>>` applied to `Borrow` and `Repay` in `lending_pool`; `Box<Account<'info, ProofData>>` and `Box<Account<'info, ShieldedPoolState>>` applied to `Withdraw` in `shielded_pool`. All stack-frame "Error:" diagnostics eliminated. See `audit-reports/ONCHAIN_VERIFIER_BLOCKERS.md` B7.

## What Is Done (C2G-A — B7 Stack-Frame Mitigation)

All BPF stack-frame "Error:" diagnostics eliminated from `anchor build --no-idl`.

**Changed files:**

- `programs/lending_pool/src/lib.rs`
  - `Borrow` context: `proof_data: Account<'info, ProofData>` → `Box<Account<'info, ProofData>>`
  - `Repay` context: `proof_data: Account<'info, ProofData>` → `Box<Account<'info, ProofData>>`

- `programs/shielded_pool/src/lib.rs`
  - `Withdraw` context: `proof_data: Account<'info, ProofData>` → `Box<Account<'info, ProofData>>`
  - `Withdraw` context: `state: Account<'info, ShieldedPoolState>` → `Box<Account<'info, ShieldedPoolState>>`

**Validations (C2G-A):**
- `cargo fmt --all -- --check` — passed
- `cargo test --workspace` — passed, **47 tests** (no regressions)
- `npm run typecheck:frontend` — passed
- `npm run build:frontend` — passed
- `anchor build --no-idl` — passed; **zero stack-frame error diagnostics**

---

## What Is Done (C2G-B — Devnet Deployment and Smoke Test)

**shielded_pool deployed to devnet:**
- Program ID: `9Bvt3jMawHFRRxpaQTtV5VvFdpZkmAZtvwjTrAX9TAtE` (matches `declare_id!` and `Anchor.toml`)
- Deploy slot: 460526822

**nullifier_registry deployed to devnet:**
- Program ID: `E42nSmqvSCuC1EWbmzYqsdLHimBMeuZyir5dB5gE24rF` (matches `declare_id!` and `Anchor.toml`)
- Deploy slot: 460526750

**store_withdraw_proof smoke test confirmed:**
- Script: `scripts/devnet-smoke.mjs`
- Instruction data: 904 bytes (8 discriminator + 32 nonce + 64 proof_a + 128 proof_b + 64 proof_c + 608 public_inputs)
- Signature: `66Bmcz54i18vB7GD6Mx44FRyJ86Ci7q7BdNxjBo6PRKG6gjuD2XEzdJVXpj1MG2c7zYDq9LeEzWJSLf7TERtHYSQ`
- Result: CONFIRMED on devnet

**lending_pool deployed:** sig `KNmLmqDJ...` (after wallet refill to 6.18 SOL).

**shielded_pool Vec-capacity upgrade:** `MAX_EPOCH_COMMITMENTS` / `MAX_EXIT_QUEUE` 128→8; SPACE 14500→1900 bytes. Required because Anchor `init` realloc limit is 10240 bytes.

**End-to-end smoke (`scripts/devnet-e2e.mjs`) result:**
- `nullifier_registry::initialize` — confirmed (registry-config PDA `E3eLfrrp...`)
- `shielded_pool::initialize` — confirmed (pool-state PDA `8MhWYz9a...`)
- `store_withdraw_proof` — confirmed (proof-data PDA seeded with random nonce)
- `withdraw` — failed with `UnknownRoot` error 6007 at `lib.rs:140` — EXPECTED

---

## Recommended Wiring Sequence

1. Generate a real withdrawal proof with snarkjs fullProve (withdraw_ring circuit).
2. Deposit the matching commitment into shielded_pool.
3. Call flush_epoch to insert commitment into the Merkle tree and update current_root.
4. Call store_withdraw_proof with the snarkjs proof output.
5. Call withdraw with the now-known root — all guards should pass and the Groth16 verifier should run on-chain.
6. Wire privacy rails (IKA, MagicBlock, Umbra, Encrypt) after round-trip confirmed.

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
