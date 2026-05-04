# Current Task

## Status: Backend remediation pass complete.

## Active Objective

Continue post-backend remediation from `audit-reports/FINAL_AUDIT_REPORT.md` without overstating privacy readiness. Backend Anchor invariants and CPI scaffolding have been patched on `fix/backend-critical`; frontend and circuit fixes remain separate work.

## Completed In Backend Pass

1. `nullifier_registry::spend` now requires `Locked -> Spent`.
2. `shielded_pool::is_known_root` rejects `[0;32]` and all roots before `next_index > 0`.
3. `lending_pool::verify_liquidation_reveal` binds ciphertext handle and loan PDA.
4. `lending_pool::repay` binds `outstanding_balance` to on-chain accrued amount and resets liquidation state.
5. `Withdraw`, `Borrow`, and `Repay` contexts now carry nullifier-registry accounts and registry-writer PDAs.
6. `withdraw`, `borrow`, and `repay` have nullifier-registry CPI scaffolding placed after existing fail-closed verifier gates.
7. `shielded_pool::disburse` now requires the lending-pool PDA signer.
8. `audit-reports/BACKEND_FIX_NOTES.md` records scope, tests, and blockers.

## Immediate Next Actions

1. Install/enable Anchor CLI and run `anchor build`.
2. Integration-test CPI signer/account constraints with local validator or deployed localnet programs.
3. Keep frontend and circuit fixes as separate scoped passes:
   - `frontend/src/lib/circuits.ts` commitment parameter order.
   - `frontend/src/lib/protocolAdapters.ts` PER health default.
   - `circuits/collateral_ring.circom` numeric range checks.
   - README privacy-claim downgrade if explicitly authorized.

## Relevant Files

| File | Role |
|---|---|
| `audit-reports/FINAL_AUDIT_REPORT.md` | Single source of truth for all 43 issues; sections 4, 10, 11 |
| `programs/nullifier_registry/src/lib.rs` | Phase 0 fix #1 |
| `programs/shielded_pool/src/lib.rs` | Phase 0 fix #2 |
| `programs/lending_pool/src/lib.rs` | Phase 0 fix #3 |
| `audit-reports/BACKEND_FIX_NOTES.md` | Backend pass notes and verification |

## Hard Constraints

- Do not start frontend privacy testing until blockers in `FINAL_AUDIT_REPORT.md` Section 1 are cleared
- Do not push without explicit instruction
- Do not claim depositor-hidden, K=16, IKA FutureSign, PER batching, or double-spend prevention publicly
- Preserve fail-closed behavior until real Groth16, IKA, Encrypt, MagicBlock, and Umbra integrations are wired and tested
