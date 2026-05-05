# groth16-solana Integration Plan — ShieldLend Solana

**Date**: 2026-05-05
**Branch**: convergence/zk-constants-artifacts
**Status**: Scaffold complete. Verifier wiring to instruction handlers is blocked pending ABI extension.

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

### Blocker 1: Instruction arg structs lack proof bytes

`WithdrawArgs`, `BorrowArgs`, and `RepayArgs` carry only 32-byte hashes of public signals:

```rust
// shielded_pool/src/lib.rs — WithdrawArgs (current)
pub struct WithdrawArgs {
    pub nullifier_hash: [u8; 32],
    pub root: [u8; 32],
    pub denomination: u64,
    pub recipient: Pubkey,
}

// lending_pool/src/lib.rs — BorrowArgs (current)
pub struct BorrowArgs {
    pub collateral_proof_public_signals_hash: [u8; 32],
    ...
}
```

To wire the verifier, each struct needs full proof bytes and all public signals:

```rust
// WithdrawArgs — required additions (breaking ABI change):
pub proof_a: [u8; 64],     // negated pi_a
pub proof_b: [u8; 128],    // pi_b
pub proof_c: [u8; 64],     // pi_c
pub public_signals: [[u8; 32]; 19],   // all 19 public signals BE

// BorrowArgs:
pub proof_a: [u8; 64],
pub proof_b: [u8; 128],
pub proof_c: [u8; 64],
pub public_signals: [[u8; 32]; 20],

// RepayArgs:
pub proof_a: [u8; 64],
pub proof_b: [u8; 128],
pub proof_c: [u8; 64],
pub public_signals: [[u8; 32]; 6],
```

This is a breaking ABI change that must be coordinated with the frontend client.

### Blocker 2: Zero-root guard must be in place

`is_known_root()` must reject `[0;32]` before groth16 is live. This is already fixed in `fix/backend-critical` (shielded_pool/src/lib.rs line ~280). Confirm it is merged before wiring.

### Blocker 3: Nullifier state machine must use strict guard

`nullifier_registry::spend` must require `status == Locked` (not just `!= Spent`). This is already fixed in `fix/backend-critical`. Confirm it is merged before wiring.

### Blocker 4: Compute budget

BN254 Groth16 pairing for nPublic=19/20 requires approximately 220k–260k CU. The default Solana transaction compute budget is 200k CU. Clients must prepend:

```typescript
ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })
```

This must be documented in client code and enforced at the integration layer.

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
