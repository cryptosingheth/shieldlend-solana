# Session Handoff — ShieldLend Solana

## Task Objective

Convergence Task 2F: resolve the Solana transaction MTU blocker (B6) by implementing
the proof account PDA pattern.

## Current Status

**C2F complete. Proof account pattern implemented. B6 resolved. 47 tests pass.**

## Files Changed (C2F)

- `programs/shielded_pool/src/lib.rs`
  - Added `PROOF_DATA_SEED: &[u8] = b"proof-data"`
  - Added `ProofKind` enum (now `#[derive(..., Debug)]`)
  - Added `ProofData` account (SPACE = 908)
  - Added `StoreWithdrawProof` context and `store_withdraw_proof` instruction
  - Slimmed `WithdrawArgs`: removed 6 proof fields, added `proof_nonce: [u8;32]` → 144 bytes
  - Updated `Withdraw` context with `proof_data` account (consumed/kind/authority constraints)
  - Updated `verify_withdraw_proof(args: &WithdrawArgs, proof: &ProofData)` — checks !consumed, kind, empty proof, cross-field guards, Groth16 call
  - `withdraw` marks `proof_data.consumed = true` after verification
  - Added 3 new `PoolError` variants: `ProofAccountOwnerMismatch`, `ProofAccountConsumed`, `WrongProofKind`
  - Added 4 new tests: `proof_data_space_constant_matches_struct_layout`, `store_withdraw_proof_stores_expected_payload`, `withdraw_proof_with_consumed_proof_fails`, `withdraw_proof_with_wrong_kind_fails`

- `programs/lending_pool/src/lib.rs`
  - Added `LendingProofKind` enum (now `#[derive(..., Debug)]`)
  - Added `ProofData` account with `public_input_count: u8` (SPACE = 940)
  - Added `StoreLendingProof` context (shared)
  - Added `store_collateral_proof` (takes `[[u8;32];20]`, sets `public_input_count=20`)
  - Added `store_repay_proof` (takes `[[u8;32];6]`, pads to 20, sets `public_input_count=6`)
  - Slimmed `BorrowArgs`: removed proof fields, added `proof_nonce` → 124 bytes
  - Slimmed `RepayArgs`: removed proof fields, added `proof_nonce` → 144 bytes
  - Updated `Borrow` context: `proof_data` constrained to `LendingProofKind::Collateral`
  - Updated `Repay` context: `proof_data` constrained to `LendingProofKind::Repay`
  - Updated `verify_collateral_proof(args, proof)` and `verify_repay_proof(args, proof)` — 2-param signatures
  - `borrow` and `repay` mark `proof_data.consumed = true` after verification
  - Added 3 new `LendingError` variants
  - Added 5 new tests: consumed/wrong_kind tests for collateral and repay + space constant

- `frontend/src/lib/solanaClient.ts`
  - Added `WITHDRAW_PROOF_DATA_SPACE = 908`, `LENDING_PROOF_DATA_SPACE = 940`
  - Added `generateProofNonce()` — crypto.getRandomValues(32)
  - Added `getWithdrawProofDataPda(authority, proofNonce)` — shielded_pool PDA
  - Added `getLendingProofDataPda(authority, proofNonce)` — lending_pool PDA
  - Added `buildStoreWithdrawProofInstruction(params)` — 904-byte instruction data
  - Added `buildStoreCollateralProofInstruction(params)` — 936-byte instruction data
  - Added `buildStoreRepayProofInstruction(params)` — 488-byte instruction data

- `audit-reports/ONCHAIN_VERIFIER_BLOCKERS.md` — B6 marked resolved; added post-C2F size table; added B7 (BPF stack warning)
- `audit-reports/GROTH16_SOLANA_INTEGRATION_PLAN.md` — C2F complete section added; B6 resolved; B7 noted
- `docs/IMPLEMENTATION_STATUS.md` — updated verifier status, test count (47), blocker table

## Verification (C2F)

- `cargo fmt --all -- --check` — passed
- `cargo test --workspace` — passed, **47 tests** (38 prior + 9 new C2F)
  - `proof_data_space_constant_matches_struct_layout` ✓ (shielded_pool)
  - `store_withdraw_proof_stores_expected_payload` ✓
  - `withdraw_proof_with_consumed_proof_fails` ✓
  - `withdraw_proof_with_wrong_kind_fails` ✓
  - `collateral_proof_with_consumed_proof_fails` ✓
  - `collateral_proof_with_wrong_kind_fails` ✓
  - `repay_proof_with_consumed_proof_fails` ✓
  - `repay_proof_with_wrong_kind_fails` ✓
  - `proof_data_space_constant_matches_struct_layout` ✓ (lending_pool)
- `tsc --noEmit` — passed
- `npm run build` — passed (pre-existing ffjavascript warning only)
- `anchor build --no-idl` — passed (new B7 stack-frame warnings for Borrow/Repay — non-fatal)

## Post-C2F Transaction Sizes (all within 1232-byte MTU)

| Instruction | Est. tx size |
|---|---|
| `store_withdraw_proof` | ~1109 bytes |
| `store_collateral_proof` | ~1141 bytes |
| `store_repay_proof` | ~693 bytes |
| `withdraw` | ~524 bytes |
| `borrow` | ~536 bytes |
| `repay` | ~556 bytes |

## Open Blocker (B7)

BPF stack frame warnings (non-fatal at build time):
- `Borrow::try_accounts`: 6016-byte frame exceeds 4096-byte BPF limit by 1920 bytes
- `Repay::try_accounts`: 5248-byte frame exceeds limit by 1152 bytes

Build succeeds. Runtime impact unknown until devnet test. Likely safe because Anchor's
`Account::try_accounts` heap-allocates via Borsh. If stack overflow occurs on devnet,
mitigation is `Box<Account<'info, ProofData>>` in the context.

Full detail: `audit-reports/ONCHAIN_VERIFIER_BLOCKERS.md` B7.

## Remaining Work

1. **Devnet deployment** — deploy three programs to Solana devnet.
2. **B7 validation** — test `borrow`/`repay` on localnet/devnet; apply `Box<Account>` if overflow.
3. **Integration test** — end-to-end: snarkjs fullProve → `store_*_proof` tx → `withdraw`/`borrow`/`repay` tx.
4. **Privacy rails** — IKA, MagicBlock PER/PrivatePayments, Umbra, Encrypt still not wired.

## Do Not Claim Publicly Until Implemented

- On-chain Groth16 verification is live (not deployed; B7 unvalidated).
- Production ZK proof artifacts are live (DEV/TEST `.ptau` only).
- Production trusted setup is complete.
- Any privacy rail (IKA, MagicBlock, Umbra, Encrypt) is active.
