# Current Task

## Status: C2D complete — groth16-solana scaffold and smoke tests passing.

## Active Objective

Converge Tasks 2C and 2D are complete. The on-chain verifier scaffold is in place but
not yet wired to instruction handlers. Next task is extending instruction arg structs
with proof bytes (breaking ABI change) and replacing the fail-closed stubs.

## Current Local Truth

1. Solana CLI and Anchor CLI 0.30.1 are available.
2. `Anchor.toml`, all three program `declare_id!` values, frontend `PROGRAM_IDS`, and
   ShieldedPool's internal `LENDING_POOL_PROGRAM_ID` match `anchor keys list`.
3. `anchor build --no-idl` passes and `.so` artifacts exist in `target/deploy/`.
4. Full Anchor IDL generation remains blocked by Anchor/proc-macro2 compatibility.
5. All three circuits compile; DEV/TEST browser WASM, zkey, and vkey artifacts are
   generated and hashed.
6. Local DEV/TEST witness generation, witness checks, proof generation, and Groth16
   verification pass for all three circuits.
7. `groth16-solana = "0.0.3"` is in both program Cargo.toml files.
8. `programs/shielded_pool/src/groth16_verifier.rs` — withdraw verifying key, smoke tests.
9. `programs/lending_pool/src/groth16_verifier.rs` — collateral + repay verifying keys, smoke tests.
10. 6 new Groth16 smoke tests pass. Total workspace: 27 tests.
11. On-chain Groth16 verification is still **not wired** — `Groth16VerifierNotWired` stubs remain.
12. IKA, MagicBlock PER, MagicBlock Private Payments, Umbra, Encrypt/FHE not wired.
13. No devnet deployment.

## Remaining On-Chain Verifier Blockers (2 of 5 from C2C remain)

1. Instruction args lack proof bytes — `WithdrawArgs`, `BorrowArgs`, `RepayArgs` need
   `proof_a: [u8; 64]`, `proof_b: [u8; 128]`, `proof_c: [u8; 64]`, and full public signal
   arrays. Breaking ABI change coordinated with frontend.
2. Compute budget not handled in client — must prepend `set_compute_unit_limit(1_400_000)`.

(Resolved: dep absent, vkey script missing, no Rust test vectors.)

## Immediate Next Actions

1. Confirm `fix/backend-critical` is merged (zero-root guard, nullifier state machine).
2. Extend instruction arg structs with proof bytes.
3. Update frontend proof submission to pass full proof bytes.
4. Replace fail-closed stubs with `groth16_verifier::verify_*()` calls.
5. Add compute budget to client.
6. Localnet integration test with real proof.

## Relevant Files

| File | Role |
|---|---|
| `programs/shielded_pool/src/groth16_verifier.rs` | Withdraw verifier module (new) |
| `programs/lending_pool/src/groth16_verifier.rs` | Collateral + repay verifier module (new) |
| `scripts/convert-vkeys.mjs` | vkey JSON → Rust byte constants (new) |
| `audit-reports/GROTH16_SOLANA_INTEGRATION_PLAN.md` | Full C2D integration plan (new) |
| `audit-reports/ONCHAIN_VERIFIER_BLOCKERS.md` | C2C blocker analysis |
| `docs/IMPLEMENTATION_STATUS.md` | Canonical implementation ledger |
| `programs/shielded_pool/src/lib.rs:170` | `verify_withdraw_proof` — still fail-closed |
| `programs/lending_pool/src/lib.rs:274` | `verify_collateral_proof` — still fail-closed |
| `programs/lending_pool/src/lib.rs:278` | `verify_repay_proof` — still fail-closed |

## Hard Constraints

- Do not push without explicit instruction
- Do not run full `anchor build` with IDL unless explicitly scoped
- Do not deploy
- Do not fake Groth16 verification
- Do not claim production trusted setup from the DEV/TEST `.ptau`
- Preserve fail-closed behavior in all three verifier stubs until real wiring is done
