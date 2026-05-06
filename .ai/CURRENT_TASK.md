# Current Task

## Status: C2G-B in progress — shielded_pool + nullifier_registry deployed to devnet; store_withdraw_proof smoke test confirmed; lending_pool blocked by insufficient SOL.

## Active Objective

Convergence Task 2G-B: Devnet deployment and first runtime validation.

- `nullifier_registry` deployed: `E42nSmqvSCuC1EWbmzYqsdLHimBMeuZyir5dB5gE24rF` (slot 460526750)
- `shielded_pool` deployed: `9Bvt3jMawHFRRxpaQTtV5VvFdpZkmAZtvwjTrAX9TAtE` (slot 460526822)
- `lending_pool`: NOT deployed — needs ~1.29 more SOL on devnet
- `store_withdraw_proof` smoke tx: CONFIRMED (sig `66Bmcz54i18vB7GD6Mx44FRyJ86Ci7q7BdNxjBo6PRKG6gjuD2XEzdJVXpj1MG2c7zYDq9LeEzWJSLf7TERtHYSQ`)

## Current Local Truth

1. Solana CLI and Anchor CLI 0.30.1 are available.
2. `Anchor.toml`, all three program `declare_id!` values, frontend `PROGRAM_IDS`, and
   ShieldedPool's internal `LENDING_POOL_PROGRAM_ID` match `anchor keys list`.
3. `anchor build --no-idl` passes — SBF artifacts generated. **Zero stack-frame error diagnostics.**
4. Full Anchor IDL generation remains blocked by Anchor/proc-macro2 compatibility.
5. All three circuits compile; DEV/TEST browser WASM, zkey, and vkey artifacts are generated.
6. `groth16-solana = "0.0.3"` in both program Cargo.toml files.
7. DEV/TEST verifier **wired** to all three instruction handlers via proof account PDA:
   - `store_withdraw_proof` → `withdraw`: proof_data PDA with SPACE=908
   - `store_collateral_proof` → `borrow`: proof_data PDA with SPACE=940
   - `store_repay_proof` → `repay`: proof_data PDA with SPACE=940, public_input_count=6
   - All three handlers: consumed/kind/authority guards + cross-field consistency checks
8. B7 stack-frame mitigation (C2G-A) applied:
   - `lending_pool::Borrow.proof_data` → `Box<Account<'info, ProofData>>`
   - `lending_pool::Repay.proof_data` → `Box<Account<'info, ProofData>>`
   - `shielded_pool::Withdraw.proof_data` → `Box<Account<'info, ProofData>>`
   - `shielded_pool::Withdraw.state` → `Box<Account<'info, ShieldedPoolState>>`
9. `frontend/src/lib/solanaClient.ts` — all proof-store instruction builders added.
10. 47 Rust unit tests pass (38 prior + 9 C2F — proof account pattern tests).
11. IKA, MagicBlock PER, MagicBlock Private Payments, Umbra, Encrypt/FHE not wired.
12. `nullifier_registry` deployed to devnet (slot 460526750).
13. `shielded_pool` deployed to devnet (slot 460526822).
14. `lending_pool` NOT deployed — insufficient devnet SOL (~1.29 more needed).
15. `store_withdraw_proof` smoke tx confirmed on devnet.
16. `scripts/devnet-smoke.mjs` written and verified.

## Active Wallet

- Wallet: `HDyzXccSkhSymx6ezTHAhF32dFhJMMYPLZhPDnXiTY6V`
- Balance: 1.18485432 SOL on devnet (after deploying 2 programs + smoke tx)
- Cluster: devnet configured

## Post-C2F Transaction Sizes (unchanged)

| Instruction | Est. tx size |
|---|---|
| `store_withdraw_proof` | ~1109 bytes ✓ |
| `store_collateral_proof` | ~1141 bytes ✓ |
| `store_repay_proof` | ~693 bytes ✓ |
| `withdraw` | ~524 bytes ✓ |
| `borrow` | ~536 bytes ✓ |
| `repay` | ~556 bytes ✓ |

## Known Blockers

- `lending_pool` deployment: ~1.29 more devnet SOL needed. Options: wait for airdrop rate limit reset, use `devnet-pow mine`, or fund from another wallet.
- Prior resolved: B6 (tx MTU) → C2F; B7 (BPF stack frame) → C2G-A.

## Immediate Next Actions

1. **Fund devnet wallet** — acquire ~1.29 SOL (airdrop, PoW faucet, or transfer) and deploy `lending_pool`.
2. **Initialize shielded_pool** — run `initialize` instruction to create pool state PDA before any deposit/withdraw.
3. **Integration test** — end-to-end: snarkjs fullProve → `store_*_proof` tx → `withdraw`/`borrow`/`repay` tx.
4. **Privacy rails** — wire IKA, MagicBlock, Umbra, Encrypt after all programs deployed.

## Relevant Files

| File | Role |
|---|---|
| `programs/shielded_pool/src/lib.rs` | `ProofData`, `StoreWithdrawProof`, `Withdraw` (Box<Account> — C2G-A) |
| `programs/lending_pool/src/lib.rs` | `ProofData`, `Borrow`/`Repay` (Box<Account> — C2G-A) |
| `programs/shielded_pool/src/groth16_verifier.rs` | Withdraw verifier module |
| `programs/lending_pool/src/groth16_verifier.rs` | Collateral + repay verifier module |
| `frontend/src/lib/solanaClient.ts` | All proof-store builders, PDA helpers, nonce generator |
| `audit-reports/ONCHAIN_VERIFIER_BLOCKERS.md` | B6: resolved; B7: resolved (C2G-A) |
| `audit-reports/GROTH16_SOLANA_INTEGRATION_PLAN.md` | Full C2D–C2G-A integration plan |

## Hard Constraints

- Do not push without explicit instruction
- Do not run full `anchor build` with IDL unless explicitly scoped
- Do not deploy without explicit instruction
- Do not claim production trusted setup from the DEV/TEST `.ptau`
- Do not claim on-chain privacy until deployed and integration-tested
