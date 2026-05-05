# Session Handoff — ShieldLend Solana

## Task Objective

Convergence Tasks 2C + 2D: analyze on-chain Groth16 verifier blockers (C2C), then complete
the groth16-solana dependency/API spike and minimum verifier integration scaffold (C2D).

## Current Status

**C2D complete. groth16-solana scaffold is in place and all tests pass.**

- `groth16-solana = "0.0.3"` added to both program Cargo.toml files.
- `scripts/convert-vkeys.mjs` written and executed — converts snarkjs vkey JSON to Rust
  big-endian affine byte constants.
- `programs/shielded_pool/src/groth16_verifier.rs` generated — WITHDRAW verifying key,
  `verify_withdraw_groth16()`, smoke test vectors, 2 unit tests.
- `programs/lending_pool/src/groth16_verifier.rs` generated — COLLATERAL + REPAY verifying
  keys, two verify functions, smoke test vectors, 4 unit tests.
- `pub mod groth16_verifier;` added to both program `lib.rs` files.
- `audit-reports/GROTH16_SOLANA_INTEGRATION_PLAN.md` written.
- `docs/IMPLEMENTATION_STATUS.md` updated (resolved 3 of 5 C2C blockers; 2 remain).

## Files Changed (C2D)

- `programs/shielded_pool/Cargo.toml` — added `groth16-solana = "0.0.3"`
- `programs/lending_pool/Cargo.toml` — added `groth16-solana = "0.0.3"`
- `programs/shielded_pool/src/groth16_verifier.rs` — created
- `programs/lending_pool/src/groth16_verifier.rs` — created
- `programs/shielded_pool/src/lib.rs` — added `pub mod groth16_verifier;`
- `programs/lending_pool/src/lib.rs` — added `pub mod groth16_verifier;`
- `scripts/convert-vkeys.mjs` — created
- `audit-reports/GROTH16_SOLANA_INTEGRATION_PLAN.md` — created
- `audit-reports/ONCHAIN_VERIFIER_BLOCKERS.md` — created (C2C)
- `docs/IMPLEMENTATION_STATUS.md` — updated

## Verification (C2D)

- `cargo fmt --all -- --check` — passed
- `cargo test --workspace` — passed, **27 tests** (21 prior + 6 new Groth16 smoke tests)
  - `withdraw_smoke_proof_verifies` ✓
  - `withdraw_mutated_proof_fails` ✓
  - `collateral_smoke_proof_verifies` ✓
  - `collateral_mutated_proof_fails` ✓
  - `repay_smoke_proof_verifies` ✓
  - `repay_mutated_proof_fails` ✓
- `npm run typecheck:frontend` — passed
- `npm run build:frontend` — passed
- `anchor build --no-idl` — passed

## Remaining Blockers (on-chain verifier wiring)

1. **Instruction args lack proof bytes** — `WithdrawArgs`, `BorrowArgs`, `RepayArgs` carry
   only 32-byte hashes; need `proof_a/b/c` and full public signal arrays. This is a breaking
   ABI change coordinated with frontend.
2. **Compute budget not handled in client** — callers must prepend
   `ComputeBudgetProgram::set_compute_unit_limit(1_400_000)`.
3. Production trusted setup still missing — DEV/TEST `.ptau` only.
4. Full Anchor IDL generation still blocked by proc-macro2 compatibility.
5. No devnet deployment.
6. External privacy rails not wired.

## Do Not Claim Publicly Until Implemented

- Production ZK proof artifacts are live.
- On-chain Groth16 verification is wired or live.
- Production trusted setup is complete.
- Any privacy rail (IKA, MagicBlock, Umbra, Encrypt) is active.

## Next Steps (in order)

1. Confirm `fix/backend-critical` (zero-root guard + nullifier state machine fix) is merged.
2. Extend `WithdrawArgs`, `BorrowArgs`, `RepayArgs` with proof bytes + public signal arrays.
3. Update frontend to pass proof bytes from snarkjs `fullProve()` output.
4. Replace `Groth16VerifierNotWired` stubs with calls to `groth16_verifier::verify_*()`.
5. Add `ComputeBudgetProgram::set_compute_unit_limit` to client transaction builders.
6. Run Anchor localnet integration test with a real proof end-to-end.
