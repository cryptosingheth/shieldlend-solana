# Backend Fix Notes

Date: 2026-05-04
Branch: fix/backend-critical

## Scope

Backend-only remediation for critical/static Anchor program findings from `FINAL_AUDIT_REPORT.md`.

No frontend files, circuit files, deployment scripts, or ZK artifacts were changed.

## Fixed

- `nullifier_registry::spend` now requires `Locked -> Spent`; direct `Active -> Spent` is rejected.
- `shielded_pool::is_known_root` rejects `[0; 32]` and rejects all roots before any deposited index exists.
- `lending_pool::verify_liquidation_reveal` binds reveal args to both the current loan PDA and `loan.liq_ciphertext_handle`.
- `lending_pool::repay` binds caller-supplied `outstanding_balance` to the on-chain accrued amount exactly, then clears liquidation state after successful repayment.
- `lending_pool::borrow` validates bounded financial inputs: borrow amount, borrow bucket, interest rate against the configured model ceiling, repayment vault, nullifier hash, and proof signal hash.
- `Withdraw`, `Borrow`, and `Repay` account contexts now carry nullifier registry accounts and registry-writer PDAs for CPI wiring.
- `withdraw` scaffolds nullifier registry CPI as `register -> lock -> spend` after the fail-closed Groth16 verifier gate.
- `borrow` scaffolds nullifier registry `lock` CPI after the fail-closed collateral verifier gate.
- `repay` scaffolds nullifier registry `unlock` CPI after fail-closed proof and payment receipt gates.
- `shielded_pool::disburse` now requires the caller to be the configured lending-pool PDA signer.

## Preserved Fail-Closed Behavior

- Groth16 verification remains unwired and still returns errors.
- MagicBlock private payment verification remains unwired and still returns errors.
- Encrypt reveal verification remains unwired and still returns errors.
- The new CPI calls are placed after existing verifier gates, so they do not create successful unsafe flows while real verifiers are absent.

## Tests

Passing:

- `cargo test --workspace`

Covered in Rust unit tests:

- `Active -> Spent` rejection.
- `Active -> Locked -> Spent` valid path.
- `unlock` requires `Locked`.
- zero-root and empty-tree root rejection.
- liquidation ciphertext handle mismatch rejection.
- liquidation loan PDA mismatch rejection.
- repayment liquidation-state reset helper.
- interest accrual same-slot principal preservation.
- borrow financial-parameter bounds.
- fail-closed verifier stubs remain errors.

## Blockers

- `anchor build` was not run because the Anchor CLI is not installed or not on `PATH` in this environment.
- Full integration testing of Anchor account constraints and CPI signer behavior still requires Anchor/Solana tooling and deployed/local-validator programs.
- Real Groth16, IKA, Encrypt, MagicBlock, and Umbra integrations remain unwired by design in this pass.
