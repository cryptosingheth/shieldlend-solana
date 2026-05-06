# Current Task

## Status: C2F complete — Proof account PDA pattern implemented; B6 tx MTU blocker resolved.

## Active Objective

Convergence Task 2F is complete. All six instruction transactions fit within the 1232-byte MTU.
The next task is devnet deployment preparation or an integration test with a real proof end-to-end.

## Current Local Truth

1. Solana CLI and Anchor CLI 0.30.1 are available.
2. `Anchor.toml`, all three program `declare_id!` values, frontend `PROGRAM_IDS`, and
   ShieldedPool's internal `LENDING_POOL_PROGRAM_ID` match `anchor keys list`.
3. `anchor build --no-idl` passes — SBF artifacts generated. New B7 stack-frame warnings
   for `Borrow::try_accounts` and `Repay::try_accounts` (non-fatal; monitor on devnet).
4. Full Anchor IDL generation remains blocked by Anchor/proc-macro2 compatibility.
5. All three circuits compile; DEV/TEST browser WASM, zkey, and vkey artifacts are generated.
6. `groth16-solana = "0.0.3"` in both program Cargo.toml files.
7. DEV/TEST verifier **wired** to all three instruction handlers via proof account PDA:
   - `store_withdraw_proof` → `withdraw`: proof_data PDA with SPACE=908
   - `store_collateral_proof` → `borrow`: proof_data PDA with SPACE=940
   - `store_repay_proof` → `repay`: proof_data PDA with SPACE=940, public_input_count=6
   - All three handlers: consumed/kind/authority guards + cross-field consistency checks
8. `frontend/src/lib/solanaClient.ts` — all proof-store instruction builders added:
   - `buildStoreWithdrawProofInstruction()`, `buildStoreCollateralProofInstruction()`, `buildStoreRepayProofInstruction()`
   - `generateProofNonce()`, `getWithdrawProofDataPda()`, `getLendingProofDataPda()`
9. 47 Rust unit tests pass (38 prior + 9 C2F — proof account pattern tests).
10. IKA, MagicBlock PER, MagicBlock Private Payments, Umbra, Encrypt/FHE not wired.
11. No devnet deployment.

## Post-C2F Transaction Sizes

| Instruction | Est. tx size |
|---|---|
| `store_withdraw_proof` | ~1109 bytes ✓ |
| `store_collateral_proof` | ~1141 bytes ✓ |
| `store_repay_proof` | ~693 bytes ✓ |
| `withdraw` | ~524 bytes ✓ |
| `borrow` | ~536 bytes ✓ |
| `repay` | ~556 bytes ✓ |

## Open Blocker (B7)

BPF stack frame warnings in `cargo-build-sbf`:
- `Borrow::try_accounts`: frame 6016 bytes (exceeds 4096-byte BPF limit)
- `Repay::try_accounts`: frame 5248 bytes

Build succeeds; runtime impact unknown until devnet test. Mitigation: use `Box<Account<'info, ProofData>>` in the context, or split the large validation logic into helper calls.

See `audit-reports/ONCHAIN_VERIFIER_BLOCKERS.md` B7.

## Immediate Next Actions

1. **Devnet deployment** — deploy three programs; verify transactions land.
2. **B7 mitigation** — test `borrow`/`repay` on localnet; if stack overflow occurs, switch to `Box<Account>` pattern in `Borrow` and `Repay` contexts.
3. **Integration test** — end-to-end: generate real proof → `store_*_proof` tx → `withdraw`/`borrow`/`repay` tx.
4. **Privacy rails** — wire IKA, MagicBlock, Umbra, Encrypt after deployment confirmed.

## Relevant Files

| File | Role |
|---|---|
| `programs/shielded_pool/src/lib.rs` | `ProofData`, `StoreWithdrawProof`, slim `WithdrawArgs`, updated `verify_withdraw_proof` (C2F) |
| `programs/lending_pool/src/lib.rs` | `ProofData`, `store_collateral/repay_proof`, slim `BorrowArgs`/`RepayArgs` (C2F) |
| `programs/shielded_pool/src/groth16_verifier.rs` | Withdraw verifier module |
| `programs/lending_pool/src/groth16_verifier.rs` | Collateral + repay verifier module |
| `frontend/src/lib/solanaClient.ts` | All proof-store builders, PDA helpers, nonce generator (C2F) |
| `audit-reports/ONCHAIN_VERIFIER_BLOCKERS.md` | B6: resolved; B7: BPF stack warning |
| `audit-reports/GROTH16_SOLANA_INTEGRATION_PLAN.md` | Full C2D–C2F integration plan |

## Hard Constraints

- Do not push without explicit instruction
- Do not run full `anchor build` with IDL unless explicitly scoped
- Do not deploy
- Do not claim production trusted setup from the DEV/TEST `.ptau`
- Do not claim on-chain privacy until deployed and integration-tested
