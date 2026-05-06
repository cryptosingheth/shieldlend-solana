# Current Task

## Status: C2E complete — DEV/TEST Groth16 verifier wired to all three instruction handlers.

## Active Objective

Convergence Task 2E is complete. The verifier is wired. The next task is resolving the
transaction MTU blocker (B6) before on-chain execution of the withdraw instruction is possible.

## Current Local Truth

1. Solana CLI and Anchor CLI 0.30.1 are available.
2. `Anchor.toml`, all three program `declare_id!` values, frontend `PROGRAM_IDS`, and
   ShieldedPool's internal `LENDING_POOL_PROGRAM_ID` match `anchor keys list`.
3. `anchor build --no-idl` blocked — `cargo-build-sbf` not installed. All other validations pass.
4. Full Anchor IDL generation remains blocked by Anchor/proc-macro2 compatibility.
5. All three circuits compile; DEV/TEST browser WASM, zkey, and vkey artifacts are generated.
6. `groth16-solana = "0.0.3"` in both program Cargo.toml files.
7. DEV/TEST verifier **wired** to all three instruction handlers:
   - `verify_withdraw_proof` — cross-checks `inputs[0]==denomination`, `inputs[17]==nullifier_hash`, `inputs[18]==root`
   - `verify_collateral_proof` — cross-checks `inputs[16]==nullifier_hash`, `inputs[18]==borrow_amount`, `inputs[19]==minRatioBps`
   - `verify_repay_proof` — cross-checks `inputs[0..3,5]` against args fields
8. `frontend/src/lib/solanaClient.ts` — `buildComputeBudgetInstruction()` and `serializeProofBytes()` added.
9. 38 Rust unit tests pass (21 prior + 6 C2D + 14 C2E — 4×3 verifier handler tests + 2 smoke from C2D).
10. IKA, MagicBlock PER, MagicBlock Private Payments, Umbra, Encrypt/FHE not wired.
11. No devnet deployment.

## Open Blocker (B6)

`WithdrawArgs` serialized: ~976 bytes. With tx overhead (~412 bytes) total is ~1388 bytes —
exceeds Solana 1232-byte MTU. On-chain `withdraw` execution blocked.

Resolution: proof account pattern — write proof bytes to a PDA first; handler reads from account.
`BorrowArgs` also marginal. `RepayArgs` well within limit.

See `audit-reports/ONCHAIN_VERIFIER_BLOCKERS.md` B6.

## Immediate Next Actions

1. Design proof account pattern (PDA layout, `write_proof` instruction, GC mechanism).
2. Implement proof account loader in `verify_withdraw_proof` and `verify_collateral_proof`.
3. Update frontend to submit a `write_proof` transaction before `withdraw`/`borrow`.
4. Anchor localnet integration test with a real proof end-to-end.

## Relevant Files

| File | Role |
|---|---|
| `programs/shielded_pool/src/lib.rs` | `WithdrawArgs` + `verify_withdraw_proof` (wired, C2E) |
| `programs/lending_pool/src/lib.rs` | `BorrowArgs`, `RepayArgs`, `verify_collateral_proof`, `verify_repay_proof` (wired, C2E) |
| `programs/shielded_pool/src/groth16_verifier.rs` | Withdraw verifier module |
| `programs/lending_pool/src/groth16_verifier.rs` | Collateral + repay verifier module |
| `frontend/src/lib/solanaClient.ts` | `buildComputeBudgetInstruction`, `serializeProofBytes` (C2E) |
| `audit-reports/ONCHAIN_VERIFIER_BLOCKERS.md` | B6: tx MTU blocker detail |
| `audit-reports/GROTH16_SOLANA_INTEGRATION_PLAN.md` | Full integration plan (C2D+C2E) |

## Hard Constraints

- Do not push without explicit instruction
- Do not run full `anchor build` with IDL unless explicitly scoped
- Do not deploy
- Do not claim production trusted setup from the DEV/TEST `.ptau`
- Do not claim on-chain privacy until proof account pattern is implemented and deployed
