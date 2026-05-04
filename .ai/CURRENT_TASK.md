# Current Task

## Status: Audit complete. Remediation planning phase.

## Active Objective

Execute Phase 0 static fixes from `audit-reports/FINAL_AUDIT_REPORT.md` Section 10. These require no CLI tools, no deployment, and no ZK artifacts — they are pure code changes that unblock everything else.

## Immediate Next Actions (Phase 0 — in order)

1. `nullifier_registry/src/lib.rs:78–86` — change `spend()` guard to require `status == Locked`
2. `programs/shielded_pool/src/lib.rs:240–243` — `is_known_root` must reject `[0;32]`
3. `programs/lending_pool/src/lib.rs:88–107` — add `require!(args.ciphertext_handle == loan.liq_ciphertext_handle)` to `verify_liquidation_reveal`
4. `frontend/src/lib/circuits.ts:79–85` — fix `computeCommitment` parameter order: `(secret, nullifier, amountLamports)`; update call site at line ~110
5. `frontend/src/lib/protocolAdapters.ts:13` — change `per: healthy: true` to `Boolean(process.env.NEXT_PUBLIC_PER_ENABLED) ?? false`
6. `circuits/collateral_ring.circom:98–106` — add `Num2Bits(64)` for `borrowed`/`denomination`, `Num2Bits(16)` for `minRatioBps`
7. `README.md` — downgrade 13 privacy "✓" claims to accurate state

## Relevant Files

| File | Role |
|---|---|
| `audit-reports/FINAL_AUDIT_REPORT.md` | Single source of truth for all 43 issues; sections 4, 10, 11 |
| `programs/nullifier_registry/src/lib.rs` | Phase 0 fix #1 |
| `programs/shielded_pool/src/lib.rs` | Phase 0 fix #2 |
| `programs/lending_pool/src/lib.rs` | Phase 0 fix #3 |
| `frontend/src/lib/circuits.ts` | Phase 0 fix #4 |
| `frontend/src/lib/protocolAdapters.ts` | Phase 0 fix #5 |
| `circuits/collateral_ring.circom` | Phase 0 fix #6 |

## Hard Constraints

- Do not start frontend privacy testing until blockers in `FINAL_AUDIT_REPORT.md` Section 1 are cleared
- Do not push without explicit instruction
- Do not claim depositor-hidden, K=16, IKA FutureSign, PER batching, or double-spend prevention publicly
