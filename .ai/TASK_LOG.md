# Task Log — ShieldLend Solana

Append-only. Most recent entry at the bottom.

---

## 2026-04-22 — Architecture + Documentation

- Completed full architecture documentation pass
- Created: `docs/architecture.md`, `docs/PRIVACY_MODEL.md`, `docs/THREAT_MODEL.md`,
  `docs/NOTE_LIFECYCLE.md`, `docs/DESIGN_DECISIONS.md`, `docs/HACKATHON.md`,
  `docs/RESEARCH_REPORT.md`, `README.md`
- Defined all three hackathon tracks (IKA+Encrypt, Colosseum Privacy, Umbra)
- Established technical invariants (commitment formula, ring size, Merkle depth)

---

## 2026-04-29 — Documentation Finalization

- Consolidated `PRIVACY_MODEL.md` + `THREAT_MODEL.md` → `PRIVACY_AND_THREAT_MODEL.md`
- Rewrote `docs/VISUAL_FLOWS.md` with full protocol-by-protocol explanations
- Trimmed README, updated doc links, removed internal EVM/V2A lineage wording
- Synced standalone repo `main` to `bc891b9 docs: consolidate solana architecture docs`

---

## 2026-04-29 — Implementation Pass (same session)

- Scaffolded Anchor workspace: `Anchor.toml`, root `Cargo.toml`
- All three programs: state structs + instruction signatures (fail-closed verifiers)
  - `programs/nullifier_registry` — Active/Locked/Spent state machine, authorized writer list
  - `programs/shielded_pool` — fixed denominations, epoch queue, root ring buffer, exit queue
  - `programs/lending_pool` — LoanAccount, interest rate model, borrow/repay/liquidation
- Updated ZK circuits: `leaf_index` input + new nullifier formula in withdraw + collateral rings
- Added `circuits/repay_ring.circom`
- Frontend: Phantom wallet, real devnet balance, deposit flow, explicit dependency blocking
- Replaced placeholder IDs with generated program IDs
- Added `frontend/src/lib/solanaClient.ts`
- Added Rust unit tests (8 categories) + Anchor test scaffolds
- Added `docs/USER_JOURNEYS_AND_TEST_PLAN.md`, `.env.example`, `scripts/check-env.mjs`
- Verification: `cargo check` pass, typecheck pass, build pass, circom structural pass
- Commit: `dafc627 Implement ShieldLend Solana MVP scaffold`

---

## 2026-05-01 — Worktree Repair + Memory Baseline

- `git worktree repair` completed: registry now points to canonical iCloud path
- Stale `~/shieldlend-solana` archived to `~/Desktop/stale-shieldlend-solana-archive`
- Backup at `~/Desktop/shieldlend-solana-backup-20260501-132151` (872 MB, all source files complete)
- Rebuilt `.ai/` memory files and updated `CLAUDE.md` with full baseline context

---

## 2026-05-01 — Shared Claude Code + Codex Memory Alignment

- Confirmed existing shared-memory structure: `CLAUDE.md`, `AGENTS.md`, and all expected `.ai/` files are present.
- Consolidated durable local context from README/config files, docs, security checklist, existing agent files, `.ai/` memory, and recent git history.
- Updated `CLAUDE.md` with a compact shared-memory pointer and kept `AGENTS.md` as the compact Codex-facing instruction file.
- Updated `.ai/CONTEXT_INDEX.md`, `.ai/DECISIONS.md`, `.ai/CURRENT_TASK.md`, and `.ai/SESSION_HANDOFF.md` with current continuation state, durable decisions, important files, recent commits, blockers, and `Needs confirmation` items.

---

## 2026-05-03–04 — Full Read-Only Audit (Pass 1 + Pass 2)

- Ran discovery pass → wrote `audit-reports/00_AUDIT_BRIEF.md`
- Ran 7 specialist agents in parallel (Pass 1, Opus model) → all 7 reports written in full
- Verified report completeness by reading tail of each file — all had proper endings
- Re-ran 7 specialist agents in parallel (Pass 2, Sonnet 4.6) with cross-check instructions:
  - Each agent independently re-analysed source, read Pass 1 report, merged findings
  - Zero unverified findings; 0 Pass 1 findings retracted
  - 24 new findings added across all 7 reports (several Critical/High)
- No product code modified. No commits made. Audit only.
- Files written: `audit-reports/00–07_*.md` (8 files total)

---

## 2026-05-04 — Final Audit Synthesis

- Read all 8 audit reports (00_AUDIT_BRIEF + 01–07 specialist reviews)
- Resolved 3 cross-report contradictions:
  1. Empty-receipt guard in `magicBlockPrivatePayments` — Pass 2 authoritative: guard exists
  2. `LoanAccount::SPACE` — literal 225 bytes, struct 195 bytes — safe overallocation, not a bug
  3. `per: healthy: true` — 3 independent pass-2 confirmations; confirmed High finding
- Synthesised 43 deduplicated GitHub issues: 16 Critical, 12 High, 11 Medium, 4 Low
- Decision: frontend privacy testing cannot start (8 hard blockers listed)
- Defined Phase 0 static fixes (no CLI/deployment needed) as immediate next action
- Created: `audit-reports/FINAL_AUDIT_REPORT.md`
- No product code modified.

---

## 2026-05-04 — Backend Safety Remediation

- Patched backend-only Anchor invariants on `fix/backend-critical`; no frontend, circuit, deployment, or ZK artifact files changed.
- Fixed `nullifier_registry::spend` so only `Locked -> Spent` is valid; added unit tests for Active rejection, lock/spend, and unlock requirements.
- Fixed `shielded_pool::is_known_root` to reject `[0;32]` and all roots before any deposited index exists; added zero-root/empty-tree tests.
- Added nullifier-registry CPI account surfaces and registry-writer PDAs to `Withdraw`, `Borrow`, and `Repay`.
- Scaffolded fail-closed CPI paths:
  - `withdraw`: `register -> lock -> spend` after Groth16 verifier gate.
  - `borrow`: `lock` after collateral verifier gate.
  - `repay`: `unlock` after repay proof and private-payment verifier gates.
- Constrained `shielded_pool::disburse` to the lending-pool PDA signer.
- Bound `lending_pool::verify_liquidation_reveal` to both loan PDA and ciphertext handle.
- Bound `repay.outstanding_balance` to on-chain accrued amount and reset liquidation state after successful repay.
- Added borrow financial-parameter validation against amount, bucket, max configured interest rate, repayment vault, nullifier hash, and proof signal hash.
- Created `audit-reports/BACKEND_FIX_NOTES.md`.
- Verification: `cargo test --workspace` passed (21 tests); `anchor build` blocked because Anchor CLI was not installed/on PATH.

---

## 2026-05-05 — Convergence Task 2: ZK Constants + Artifact Status

- Verified canonical repo on branch `convergence/zk-constants-artifacts`; initial status was clean.
- Confirmed `anchor keys list` program IDs:
  - `shielded_pool`: `9Bvt3jMawHFRRxpaQTtV5VvFdpZkmAZtvwjTrAX9TAtE`
  - `lending_pool`: `HLtWrvLyc2SE3ERWHaEdY4RG84GxFfHv3Qf4NzJPxaF7`
  - `nullifier_registry`: `E42nSmqvSCuC1EWbmzYqsdLHimBMeuZyir5dB5gE24rF`
- Noted that the task prompt's uppercase `VVF` ShieldedPool id differs from the synced Anchor id's lowercase `VvF`; base58 is case-sensitive, so constants use the Anchor-synced id.
- Derived ShieldedPool BN254 field element: `11254132154452147490799744423140604481167841310631133650094460832786634327021`.
- Updated `circuits/constants.json` and `circuits/constants.circom`; frontend reads the same constant through `frontend/src/lib/circuits.ts`.
- Ran `npm run circuits:compile`; first attempt failed with `invalid output path`, then passed after creating `build/circuits`.
- Ran `node scripts/generate-zk-artifacts.mjs`; generated browser WASM artifacts and hashes, but skipped zkey/vkey because no `.ptau` file exists locally.
- Updated `circuits/CEREMONY.md`, `audit-reports/ZK_GENERATION_NOTES.md`, and `audit-reports/ZK_ARTIFACT_BLOCKERS.md` to reflect current status.
- Remaining blocker: no reviewed BN254 Powers of Tau file, no `.zkey`, no `_vkey.json`, and no live Groth16 verifier integration.

---

## 2026-05-05 — Status Reconciliation After C1/C2

- Created `docs/IMPLEMENTATION_STATUS.md` as the canonical local implementation ledger.
- Updated README current build status, privacy status, ZK circuits, pre-alpha status, repository structure, and getting-started sections to remove stale claims.
- Recorded known-good validation commands: `cargo fmt --all -- --check`, `cargo test --workspace`, `npm run typecheck:frontend`, `npm run build:frontend`, and `anchor build --no-idl`.
- Explicitly marked not live: IKA relay signer privacy, MagicBlock PER, MagicBlock Private Payments, Umbra stealth exits, Encrypt/FHE oracle/health computation, on-chain Groth16 verification, production trusted setup, full private repayment, and end-to-end private borrow/withdraw.
- Documented blockers: full Anchor IDL generation, missing `.ptau`, missing `.zkey`, missing `_vkey.json`, no proof smoke test, no on-chain verifier, no devnet deployment, missing Private Payments URL, Umbra config not set, IKA relay not wired, and PER not wired.
- Noted local source-truth follow-up: frontend `contracts.ts` still has old program IDs, and `shielded_pool` has a stale internal `LENDING_POOL_PROGRAM_ID` constant. No code changes were made in this docs-only task.

---

## 2026-05-05 — Convergence Task 2A.5: Remaining Program ID Constants

- Re-verified local `anchor keys list` and used its exact case-sensitive values:
  - `shielded_pool`: `9Bvt3jMawHFRRxpaQTtV5VvFdpZkmAZtvwjTrAX9TAtE`
  - `lending_pool`: `HLtWrvLyc2SE3ERWHaEdY4RG84GxFfHv3Qf4NzJPxaF7`
  - `nullifier_registry`: `E42nSmqvSCuC1EWbmzYqsdLHimBMeuZyir5dB5gE24rF`
- Updated `frontend/src/lib/contracts.ts` so frontend program IDs match Anchor local keys.
- Updated `programs/shielded_pool/src/lib.rs` so `LENDING_POOL_PROGRAM_ID` matches the synced `lending_pool` ID used for the lending-pool authority PDA.
- Updated `docs/IMPLEMENTATION_STATUS.md`, `.ai/CURRENT_TASK.md`, `.ai/SESSION_HANDOFF.md`, and `.ai/DECISIONS.md` to remove the stale-constant blocker.
- No deployment, full Anchor IDL generation, zkey/vkey generation, circuit logic change, or privacy overclaim was performed.

---

## 2026-05-05 — Convergence Task 2C: On-Chain Verifier Blocker Analysis

- Inspected all required files: three program `lib.rs` files, three program `Cargo.toml` files,
  workspace `Cargo.toml`, `Cargo.lock`, `circuits/artifact_manifest.json`, `circuits/public_signals.json`,
  three `_vkey.json` files, `frontend/src/lib/circuits.ts`, `frontend/src/lib/protocolAdapters.ts`,
  `audit-reports/ZK_GENERATION_NOTES.md`, `audit-reports/ZK_ARTIFACT_BLOCKERS.md`,
  and `docs/IMPLEMENTATION_STATUS.md`.
- Confirmed `groth16-solana` is absent from all Cargo.toml files and Cargo.lock.
  `ark-bn254` is present only as a transitive dep of `solana-program` 1.18.26 — it is
  a host-side library, not a BPF verifier.
- Confirmed three fail-closed stubs:
  - `verify_withdraw_proof` → `PoolError::Groth16VerifierNotWired` (`shielded_pool/src/lib.rs:170`)
  - `verify_collateral_proof` → `LendingError::Groth16VerifierNotWired` (`lending_pool/src/lib.rs:274`)
  - `verify_repay_proof` → `LendingError::Groth16VerifierNotWired` (`lending_pool/src/lib.rs:278`)
- Mapped public signal order for all three circuits from `public_signals.json`.
- Identified five concrete blockers preventing safe wiring:
  1. `groth16-solana` dep absent — version/API unknown.
  2. Instruction args lack proof bytes — `WithdrawArgs`, `BorrowArgs`, `RepayArgs` carry only
     hashes; need `proof_a/b/c` and full public signal arrays (breaking ABI change).
  3. vkey format conversion unscripted — snarkjs decimal projective format not convertable
     to Solana BN254 big-endian affine bytes without a new utility.
  4. No Rust on-chain test vectors.
  5. Compute budget not handled (~220k–260k CU for BN254 pairing exceeds 200k default).
- Confirmed: Anchor IDL blocker is NOT a prerequisite for verifier wiring.
- Outcome B: wiring blocked. No program code changed. No fake wiring performed.
- Created `audit-reports/ONCHAIN_VERIFIER_BLOCKERS.md`.
- Updated `docs/IMPLEMENTATION_STATUS.md` known-blockers table.
- Validations: `cargo fmt` pass, `cargo test` pass (21 tests), `npm run typecheck:frontend` pass,
  `npm run build:frontend` pass, `anchor build --no-idl` pass.

---

## 2026-05-05 — Convergence Task 2B: DEV/TEST Groth16 Artifacts

- Re-verified tooling: Node 22.14.0, npm 11.8.0, snarkjs 0.7.6, circom 2.2.3.
- Re-ran `npm run circuits:compile`.
- Recorded constraint counts:
  - `withdraw_ring`: 14,019 constraints.
  - `collateral_ring`: 14,277 constraints.
  - `repay_ring`: 1,440 constraints.
- Generated DEV/TEST-only `circuits/keys/dev_pot14_final.ptau` for the largest circuit; SHA-256 `3838aee2feec6518a6eb1198a04c74317652630fbaf5715870fbd1a32deaa18c`; `snarkjs powersoftau verify` passed.
- Ran `node scripts/generate-zk-artifacts.mjs`; generated browser WASM, final zkeys, and `_vkey.json` files for all three circuits.
- Verified each zkey with `snarkjs zkey verify`.
- Ran local deterministic smoke tests for all circuits: witness generation, witness check, proof generation, and Groth16 verification all passed.
- Updated artifact manifest, ceremony notes, ZK audit notes/blockers, implementation ledger, and shared `.ai/` memory.
- No deployment, full Anchor IDL generation, Solana program logic change, production trusted setup claim, or on-chain verifier wiring was performed.

---

## 2026-05-05 — Convergence Task 2D: groth16-solana Dependency/API Spike + Verifier Scaffold

- Confirmed `groth16-solana = "0.0.3"` is the correct version for Anchor 0.30.1 / solana-program 1.18.x. (0.2.0 requires Solana 2.x / agave SDK and conflicts.)
- Added `groth16-solana = "0.0.3"` to `programs/shielded_pool/Cargo.toml` and `programs/lending_pool/Cargo.toml`. `cargo check` passes cleanly.
- Confirmed groth16-solana 0.0.3 API from registry source:
  - `vk_gamme_g2` field name (double-m typo, real in crate source).
  - `verify(&mut self) -> Result<bool, Groth16Error>` (returns bool, not ()).
  - G2 byte order: `x_c0 || x_c1 || y_c0 || y_c1` (Solana alt_bn128 / EIP-197 layout).
- Written `scripts/convert-vkeys.mjs`:
  - G1 negation: `(x, q − y) mod BASE_FIELD_PRIME` for `proof_a`.
  - G2 reorder: snarkjs `[[c1,c0],[c1,c0]]` → Solana `c0||c1||c0||c1`.
  - Reads three `_vkey.json` files and six smoke proof/public files from `build/circuits/smoke/`.
  - Outputs two Rust files with static verifying keys and `pub const` test vectors.
- Ran `node scripts/convert-vkeys.mjs`; generated:
  - `programs/shielded_pool/src/groth16_verifier.rs`
  - `programs/lending_pool/src/groth16_verifier.rs`
- Added `pub mod groth16_verifier;` to both `lib.rs` files.
- Created `audit-reports/GROTH16_SOLANA_INTEGRATION_PLAN.md`.
- Updated `docs/IMPLEMENTATION_STATUS.md`: resolved 3 of 5 C2C blockers; 2 remain (ABI extension, compute budget).
- Validations: `cargo fmt` pass, `cargo test --workspace` pass (27 tests; +6 Groth16 smoke), `npm run typecheck:frontend` pass, `npm run build:frontend` pass, `anchor build --no-idl` pass.
- No instruction handler behavior changed. No fake wiring. Fail-closed stubs preserved.

---

## 2026-05-06 — Convergence Task 2E: Groth16 Verifier ABI Extension + Handler Wiring

- Extended `WithdrawArgs` with `proof_a: [u8;64]`, `proof_b: [u8;128]`, `proof_c: [u8;64]`, `public_inputs: [[u8;32];19]`.
- Extended `BorrowArgs` with same proof fields + `public_inputs: [[u8;32];20]`; removed `collateral_proof_public_signals_hash`.
- Extended `RepayArgs` with same proof fields + `public_inputs: [[u8;32];6]`; removed `repay_proof_public_signals_hash`.
- Replaced `verify_withdraw_proof` fail-closed stub with real call:
  - Cross-checks `inputs[0] == denomination` (BE u256), `inputs[17] == nullifier_hash`, `inputs[18] == root`.
  - Calls `groth16_verifier::verify_withdraw_groth16(...)`.
- Replaced `verify_collateral_proof` fail-closed stub with real call:
  - Cross-checks `inputs[16] == collateral_nullifier_hash`, `inputs[18] == borrow_amount`, `inputs[19] == minRatioBps` (u16 → BE u256).
  - Calls `groth16_verifier::verify_collateral_groth16(...)`.
- Replaced `verify_repay_proof` fail-closed stub with real call:
  - Cross-checks `inputs[0..3,5]` against args fields. Signal[4] (repaymentVault) explicitly skipped.
  - Calls `groth16_verifier::verify_repay_groth16(...)`.
- Changed `#[cfg(test)] mod tests` to `#[cfg(test)] pub(crate) mod tests` in both `groth16_verifier.rs` files to expose smoke constants to lib test modules.
- Added `frontend/src/lib/solanaClient.ts`: `buildComputeBudgetInstruction()`, `serializeProofBytes()`, `BN254_PRIME`, `bigintToBeBytes32()`, `SerializedProof` interface.
- Added 14 new Rust unit tests (4 per circuit: valid/empty/mutated/mismatched nullifier).
- Discovered new blocker B6: `WithdrawArgs` ~976 bytes; with tx overhead ~1388 bytes > 1232-byte MTU. Documented in `audit-reports/ONCHAIN_VERIFIER_BLOCKERS.md` B6. Rust tests unaffected.
- Updated: `GROTH16_SOLANA_INTEGRATION_PLAN.md`, `ONCHAIN_VERIFIER_BLOCKERS.md`, `docs/IMPLEMENTATION_STATUS.md`, `.ai/CURRENT_TASK.md`, `.ai/SESSION_HANDOFF.md`, `.ai/DECISIONS.md`.
- Validations: `cargo fmt` pass, `cargo test --workspace` pass (38 tests), `tsc --noEmit` pass, `npm run build` pass, `anchor build --no-idl` blocked (cargo-build-sbf missing — pre-existing).
- Commit: `feat: wire dev groth16 verifier paths`

---

## 2026-05-06 — Convergence Task 2F: Proof Account PDA Pattern (B6 MTU Fix)

- Resolved B6: `WithdrawArgs` inline was ~976 bytes → tx ~1388 bytes > 1232-byte Solana MTU.
- Implemented proof account PDA pattern for all three instruction flows.
- `programs/shielded_pool/src/lib.rs`:
  - Added `ProofData` account (SPACE=908): authority, circuit_kind, proof_a/b/c, public_inputs(19), consumed, bump.
  - Added `StoreWithdrawProof` context and `store_withdraw_proof` instruction (tx ~1109 bytes).
  - Slimmed `WithdrawArgs`: removed 6 proof fields, added `proof_nonce: [u8;32]` → 144 bytes (tx ~524 bytes).
  - Updated `Withdraw` context: `proof_data` account with consumed/kind/authority constraints.
  - Updated `verify_withdraw_proof(args, proof)` — reads from ProofData, marks consumed.
  - Added `PoolError::{ProofAccountOwnerMismatch, ProofAccountConsumed, WrongProofKind}`.
  - Added `Debug` derive to `ProofKind` enum.
- `programs/lending_pool/src/lib.rs`:
  - Added `ProofData` account (SPACE=940): same + `public_input_count: u8` + 20-slot inputs.
  - Added `StoreLendingProof` context, `store_collateral_proof` (tx ~1141 bytes), `store_repay_proof` (tx ~693 bytes).
  - Slimmed `BorrowArgs` → 124 bytes, `RepayArgs` → 144 bytes.
  - Updated `Borrow`/`Repay` contexts with proof_data account constraints.
  - Updated `verify_collateral_proof(args, proof)` and `verify_repay_proof(args, proof)`.
  - Added `LendingError::{ProofAccountOwnerMismatch, ProofAccountConsumed, WrongProofKind}`.
  - Added `Debug` derive to `LendingProofKind` enum.
- `frontend/src/lib/solanaClient.ts`:
  - Added proof account constants, PDA helpers, `generateProofNonce()`.
  - Added `buildStoreWithdrawProofInstruction()`, `buildStoreCollateralProofInstruction()`, `buildStoreRepayProofInstruction()`.
- Discovered new non-fatal B7: BPF stack-frame warnings for `Borrow::try_accounts` (6016 bytes) and `Repay::try_accounts` (5248 bytes). Build succeeds. Mitigation: `Box<Account>` if runtime overflow occurs.
- Updated: `GROTH16_SOLANA_INTEGRATION_PLAN.md`, `ONCHAIN_VERIFIER_BLOCKERS.md`, `docs/IMPLEMENTATION_STATUS.md`, `.ai/CURRENT_TASK.md`, `.ai/SESSION_HANDOFF.md`, `.ai/DECISIONS.md`.
- Validations: `cargo fmt` pass, `cargo test --workspace` pass (47 tests), `tsc --noEmit` pass, `npm run build` pass, `anchor build --no-idl` pass (B7 warnings, non-fatal).
- Commit: `feat: add proof account flow for groth16 payloads`

---

## 2026-05-06 — Convergence Task 2G-A: B7 Stack-Frame Mitigation Preflight

- Inspected B7 warnings from C2F: `Borrow::try_accounts` (6016 bytes), `Repay::try_accounts` (5248 bytes) in lending_pool.
- Discovered additional pre-existing B7 warnings in shielded_pool (not documented in C2F):
  - `Withdraw::try_accounts`: 6464-byte frame
  - `__private::__global::withdraw` entry point: 4544-byte frame
- Applied `Box<Account<'info, ProofData>>` to `Borrow.proof_data` and `Repay.proof_data` in `lending_pool`.
- Applied `Box<Account<'info, ProofData>>` and `Box<Account<'info, ShieldedPoolState>>` to `Withdraw` context in `shielded_pool`.
- `ShieldedPoolState` required boxing because `historical_roots: [[u8;32]; 30]` (960 bytes) still contributes to the stack frame even though Vec fields are heap-allocated.
- All Anchor constraints, field accesses, mutations, and deref coercions verified to work identically with Box<Account>.
- Result: zero stack-frame "Error:" diagnostics in `anchor build --no-idl`.
- Validations: `cargo fmt` pass, `cargo test --workspace` pass (47 tests), `tsc --noEmit` pass, `npm run build` pass, `anchor build --no-idl` pass (zero B7 warnings).
- Updated: `ONCHAIN_VERIFIER_BLOCKERS.md`, `GROTH16_SOLANA_INTEGRATION_PLAN.md`, `docs/IMPLEMENTATION_STATUS.md`, `.ai/CURRENT_TASK.md`, `.ai/SESSION_HANDOFF.md`, `.ai/DECISIONS.md`.
- Commit: `fix: reduce proof account stack usage`

---

## C2G-B — Devnet Deployment and Smoke Test (2026-05-06)

**Branch**: convergence/zk-constants-artifacts
**Objective**: Deploy three programs to devnet; run store_withdraw_proof smoke test.

### Steps Completed

1. Pre-deploy checks:
   - `cargo fmt --all -- --check` — passed
   - `cargo test --workspace` — passed, 47 tests
   - `npm run typecheck:frontend` — passed
   - `npm run build:frontend` — passed
   - `anchor build --no-idl` — passed, zero stack-frame errors

2. Deployed `nullifier_registry`:
   - ID: `E42nSmqvSCuC1EWbmzYqsdLHimBMeuZyir5dB5gE24rF`
   - Slot: 460526750
   - Cost: ~1.619 SOL

3. Deployed `shielded_pool`:
   - ID: `9Bvt3jMawHFRRxpaQTtV5VvFdpZkmAZtvwjTrAX9TAtE`
   - Slot: 460526822
   - Cost: ~2.182 SOL

4. `lending_pool` deployment **failed** — insufficient SOL.
   - Required: ~2.48 SOL; balance remaining: 1.19 SOL.
   - Three `solana airdrop` attempts: all rate-limited.

5. Wrote `scripts/devnet-smoke.mjs`:
   - Builds and sends `store_withdraw_proof` to devnet
   - Uses DEV/TEST smoke vectors from `groth16_verifier.rs`
   - Generates fresh random `proof_nonce` per run (avoids PDA re-init collision)

6. Smoke test confirmed:
   - Signature: `66Bmcz54i18vB7GD6Mx44FRyJ86Ci7q7BdNxjBo6PRKG6gjuD2XEzdJVXpj1MG2c7zYDq9LeEzWJSLf7TERtHYSQ`
   - Instruction data: 904 bytes

### Wallet After

- Balance: 1.18485432 SOL

### Next

- Fund devnet wallet (~1.29 SOL) and deploy `lending_pool`.
- Initialize `shielded_pool` state PDA.
- End-to-end integration test.

---

## C2G-B (continued) — lending_pool deploy + e2e smoke (2026-05-06)

**Branch**: convergence/zk-constants-artifacts
**Objective**: Complete C2G-B: deploy lending_pool, verify all IDs, initialize, e2e smoke.

### Steps Completed

1. Deployed `lending_pool`:
   - ID: `HLtWrvLyc2SE3ERWHaEdY4RG84GxFfHv3Qf4NzJPxaF7`
   - Sig: `KNmLmqDJ...`

2. Verified all three program IDs match Anchor.toml + declare_id! + anchor keys list.

3. Ran `node scripts/devnet-e2e.mjs`:
   - `nullifier_registry::initialize` — skipped (already done prev session)
   - `shielded_pool::initialize` — FAILED: Anchor init realloc limit (SPACE=14500 > 10240)

4. Bug fix: reduced MAX_EPOCH_COMMITMENTS and MAX_EXIT_QUEUE 128→8 (SPACE: 14500→1900 bytes).
   - cargo test --workspace: 47 tests pass
   - anchor build --no-idl: zero stack-frame errors

5. Upgraded shielded_pool on devnet (sig `4tv5kxR9...`).

6. Re-ran `node scripts/devnet-e2e.mjs`:
   - `shielded_pool::initialize` — CONFIRMED (sig `QMVjEr1d...`)
   - `store_withdraw_proof` — CONFIRMED (sig `5YRBBhwJ...`)
   - `withdraw` — EXPECTED FAIL: UnknownRoot (6007) at lib.rs:140

### Result

C2G-B complete. All three programs deployed and verified. initialize + store_proof + UnknownRoot guard confirmed on devnet. The withdraw UnknownRoot failure is correct behavior — a real deposit→flush_epoch cycle is required before withdraw can proceed past the root check.

### Wallet After

Balance: 3.670413760 SOL

---

## 2026-05-07 — Convergence Task 2H: Full Round-Trip Devnet Proof Smoke Test

**Branch**: convergence/zk-constants-artifacts
**Objective**: Deposit real commitment, flush epoch, store proof, execute withdraw with on-chain Groth16 verification.

### Steps Completed

1. Pre-flight validations:
   - `cargo fmt --all -- --check` — PASS
   - `cargo test --workspace` — PASS (47 tests)
   - `npm run typecheck:frontend` — PASS
   - `npm run build:frontend` — PASS
   - `anchor build --no-idl` — PASS (zero stack-frame error diagnostics)

2. Wrote `scripts/devnet-fullround.mjs`:
   - Step 0a: detect/fix `nullifier_registry::authorized_programs` (PDA addresses vs program IDs)
   - Step 0b: detect existing pool state to enable idempotent re-runs
   - Step 1: `deposit` smoke commitment (0.1 SOL, leaf_index=0)
   - Step 2: `flush_epoch` with precomputed smoke root
   - Step 3: `store_withdraw_proof` (fresh random proof_nonce)
   - Step 4: `withdraw` with 1,400,000 CU budget

3. Discovered `UnauthorizedWriter` bug:
   - Root cause: `nullifier_registry::assert_authorized` checks `writer.key()` (registry_writer PDA), not program ID.
   - `authorized_programs` was initialized with program IDs → all `register`/`lock`/`spend` CPIs fail.
   - Fix: called `update_authorized_programs` with correct PDA addresses.
   - shielded_pool registry_writer: `E4kXXwght9DYxDnAwcmtbcJ5cV2Azjn98eNJJa2q5Szf`
   - lending_pool registry_writer: `CHCEx9fzSVQVxC9kAQ6K4tRgajjbcwNA2tg1LtbjqoCk`
   - Fix sig: `5nqg3EDxMi6My224DV43xmqjbfzMWuCr5njQAkBFkzNwTkRKY9xQ8jjqGdRRoRPaUYfJWeF8UhsWkM48VPAnQcCK`

4. Full round-trip confirmed on devnet:
   - `deposit`: `3dsEYbRR7o66HYErueU6Fdzt1dSEhX6mpRm2XSZArzzWib7kbjnETUgw6dAfZBsXfw45nQuH8gbSGKfZEvNkGRtu`
   - `flush_epoch`: `2GXQhThHoHB7hBmZXWHxP9VCm2eU3e19NoRCaj8L5a2p6L7yUkv4vCH4yM4cUqMyY23xhqV51fsts5Wu8bsTgqBL`
   - `store_withdraw_proof`: `5vd2RnQJwCmqQ9YmNSFUA5dxZWRNmGudmMurGVgXtcgm1MKHP8LZJBi6EVra4vBinXqoX2b9tBidTYXxzW1JNBed`
   - `withdraw` (Groth16 PASS): `3s7zqUmuTLmYCMKW6JtH27easQetAUZP6DUhuKAXzL5b27wfMPRL5nx6eRX64C59kRQ7LmfBsii18TJBpQi2FDhd`

5. On-chain Groth16 BN254 verification: **198,502 CU consumed, pairing PASSED**.

6. Updated all documentation:
   - `docs/IMPLEMENTATION_STATUS.md`
   - `audit-reports/ONCHAIN_VERIFIER_BLOCKERS.md`
   - `audit-reports/GROTH16_SOLANA_INTEGRATION_PLAN.md`
   - `.ai/CURRENT_TASK.md`, `.ai/SESSION_HANDOFF.md`, `.ai/DECISIONS.md`, `.ai/TASK_LOG.md`

### Wallet After

Balance: 3.554668080 SOL (net cost ≈ 0.108515 SOL including 0.1 SOL deposited into pool)

### Commit

`chore: validate full devnet withdraw proof roundtrip`

---

## 2026-05-08 — Encrypt Pre-Alpha Privacy Rail

**Branch**: `rail/encrypt`
**Objective**: Wire real Encrypt pre-alpha integration where safe without breaking C2H or overstating privacy.

### Steps Completed

1. Researched current Encrypt docs and Superteam track.
   - Docs require `encrypt-anchor` with `anchor-lang = "0.32"`.
   - This repo remains on Anchor `0.30.1`, so program-side wiring was deferred.
   - Docs preserve pre-alpha disclaimer: no production encryption guarantee; data may be plaintext/public.

2. Implemented client/sidecar Encrypt adapter:
   - `frontend/src/lib/privacyRails/encrypt.ts`
   - Uses documented gRPC API `encrypt.v1.EncryptService/CreateInput` via `@grpc/grpc-js`.
   - Discovers active devnet network encryption keys from Encrypt program accounts.
   - Submits non-sensitive health-ratio test input when explicitly requested.

3. Added `scripts/check-encrypt.mjs` and `npm run check:encrypt`.
   - `npm run check:encrypt -- --live` discovered active keys and returned ciphertext id `7Ss3kGMQAVXGRSuU1CuggFjMgDjtssiUhZqNmMh5NugW`.
   - Exact SDK package in lockfile: `@encrypt.xyz/pre-alpha-solana-client@0.1.0`.
   - Exact API used: `encrypt.v1.EncryptService/CreateInput`.

4. Added frontend/API status surface:
   - `/api/integrations/encrypt/status`
   - `/api/integrations/encrypt/liquidation-reveal`
   - Encrypt pre-alpha status panel on the Positions screen.

5. Updated claim boundaries:
   - `README.md`
   - `docs/HACKATHON.md`
   - `docs/PRIVACY_AND_THREAT_MODEL.md`
   - `.ai/CURRENT_TASK.md`
   - `.ai/SESSION_HANDOFF.md`
   - `.ai/DECISIONS.md`

### Validations

- `npm run check:encrypt -- --live` — PASS
- `npm run typecheck:frontend` — PASS
- `npm run build:frontend` — PASS with existing `web-worker`/`ffjavascript` warning
- `cargo test --workspace` — PASS, 47 tests; existing Anchor cfg warnings
- `anchor build --no-idl` — PASS with existing Anchor/SBF warnings

### Result

Encrypt pre-alpha developer tooling is live at the adapter/client layer. Program-side FHE remains fail-closed by design until Anchor compatibility is resolved.

---

## 2026-05-08 — Encrypt Live-Hardening

**Branch**: `rail/encrypt`
**Objective**: Move Encrypt from client-probe-only toward the strongest safe live integration without breaking C2H.

### Steps Completed

1. Re-checked official Encrypt docs and upstream examples.
   - Docs installation page still lists `encrypt-anchor` with `anchor-lang = "0.32"`.
   - Current upstream `encrypt-pre-alpha` examples use `encrypt_anchor::EncryptContext`.
   - Current upstream workspace resolves `encrypt-anchor` against newer Anchor/Solana account crates.

2. Tested an isolated Anchor 0.32 sidecar in `/private/tmp/encrypt-anchor-feasibility`.
   - Graph-only code compiled.
   - Actual `EncryptContext` CPI code failed with duplicate `solana_account_info::AccountInfo` and `anchor_lang::Error` types.
   - Result: no sidecar added; program-side Encrypt remains fail-closed.

3. Added live-hardening smoke coverage:
   - `scripts/encrypt-health-smoke.mjs`
   - `npm run smoke:encrypt-health`
   - Models non-sensitive collateral, debt, and liquidation-threshold inputs bound to a test loan PDA.

4. Documented blocker and migration path:
   - `docs/ENCRYPT_LIVE_HARDENING.md`
   - Updated `docs/HACKATHON.md` and `docs/PRIVACY_AND_THREAT_MODEL.md`.

### Validations

- `npm run check:encrypt -- --live` — PASS
- `node scripts/encrypt-health-smoke.mjs --live` — PASS
- `npm run typecheck:frontend` — PASS after rerun; first attempt raced with `next build` while `.next/types` was being regenerated
- `npm run build:frontend` — PASS with existing `web-worker`/`ffjavascript` warning
- `cargo test --workspace` — PASS, 47 tests; existing Anchor cfg warnings
- `anchor build --no-idl` — PASS with existing Anchor/SBF warnings

Latest live-hardening CreateInput IDs:
- health ratio: `5VZ8BhpSWqDCAXMMb4ESVGsQRKb6X9dDgD1xGLydCA6y`
- collateral: `8CtojVRaXkWnCB6pN6wq5jxEvkdmAe5BhfTsm5pBLZsc`
- debt: `25EK8vDYPXB6kaT6EZEmz6gwjpu1SNKt57zn1cnYR1xw`
- liquidation threshold: `2iA8vWgBaA8cKo6eGsQQMdZUgHyNNB3spSc93Sj6Fhos`

---

## 2026-05-08 — Umbra Solana Privacy Rail Implementation

**Branch**: rail/umbra
**Objective**: Install and wire the official Umbra Solana SDK as a real fail-closed privacy rail without breaking C2H.

### Steps Completed

1. Researched authoritative Umbra sources:
   - Superteam Umbra Side Track listing
   - Umbra SDK docs and LLM docs index
   - npm registry package metadata

2. Installed official SDK:
   - `@umbra-privacy/sdk@4.0.0`
   - Confirmed devnet program ID: `DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ`
   - Confirmed mainnet program ID: `UMBRAD2ishebJTcgCLkTkNUx1v3GyoAgpTRPeWoLykh`

3. Added Umbra adapter and scripts:
   - `frontend/src/lib/privacyRails/umbra.ts`
   - `scripts/check-umbra.mjs`
   - `scripts/umbra-smoke.mjs`

4. Wired frontend:
   - Withdraw screen now supports Direct vs Umbra destination mode.
   - Direct mode preserves C2H `stealth_address` and labels it lower privacy.
   - Umbra mode is blocked for current native SOL exits until a supported SPL/Token-2022 mint route exists.
   - Added Umbra status panel.

5. Updated docs and env:
   - `.env.example`
   - `README.md`
   - `docs/HACKATHON.md`
   - `docs/PRIVACY_AND_THREAT_MODEL.md`

### Blockers / Non-Claims

- Umbra docs support SPL/Token-2022 balances; current ShieldLend C2H withdrawal releases native SOL lamports.
- Real Umbra route needs wSOL or another supported SPL/Token-2022 exit leg.
- `@umbra-privacy/web-zk-prover@2.0.1` peers `@umbra-privacy/sdk@2.0.3`; it was not force-installed beside SDK 4.0.0.
- No Umbra private transfer success is claimed; no funded devnet Umbra token action was submitted.

### Validations

- `npm run typecheck:frontend` — PASS
- `npm run build:frontend` — PASS, with existing `web-worker`/`ffjavascript` warning
- `npm run check:umbra` — PASS with network access; devnet indexer and relayer health both 200
- `npm run smoke:umbra` — PASS with network access; client init and devnet query worked; no token action submitted
- `cargo test --workspace` — PASS, 47 tests
- `anchor build --no-idl` — PASS, with existing Anchor cfg/LTO/undefined-syscall warnings

---

## 2026-05-08 — Umbra Live-Hardening Funded Devnet wSOL Flow

**Branch**: rail/umbra
**Objective**: Make Umbra live enough for hackathon by submitting a funded devnet SPL/wSOL SDK flow and keeping ShieldLend payout claims honest.

### Completed

- Added `scripts/umbra-funded-smoke.mjs` and `scripts/umbra-wsol-smoke.mjs`.
- Added `npm run smoke:umbra-funded`.
- Added frontend funded-flow status fields and `/api/integrations/umbra/status`.
- Updated `docs/HACKATHON.md` and `docs/IMPLEMENTATION_STATUS.md`.
- Confirmed funded devnet wSOL flow:
  - Mint: `So11111111111111111111111111111111111111112`
  - Amount: `1000000` base units (`0.001` wSOL)
  - wSOL wrap + SyncNative: `cyQG7Bw7Skuu2QCMu8Gvmx5JSfbcSwGGD3utoRq7jm3iAkxKHCgKjXeGxjBBGL3ZWYYe1JTqykdAQFj5thw85As`
  - Umbra deposit queue/callback: `SZeGJ9FMkhiAnz2hq9oeWSgX1pccrE5rCqgZWjUMd4pu7ZzaHrNM9K6aaMxqqNfZ1cYHWSvwYYAp5gJwhtTovyx` / `2nPcvgkfXhYWuAAxHfhjH8WCi4afguYbhqu3uYdpYgEH1As5jB8R2evfiUWXmFekz1CXfhB1HwHosiQKYGjCxMVL`
  - Umbra withdraw queue/callback: `yVdTJQi8DxnRyB1BBW2zkTenm7WhxXAqztXqoAsqUdnEdKhqUBQrWACbMeLkdEGkCuGbPGKVYfGAVzRLLeHg5u` / `31UinqaCswx1kNJGpZbGoFgr6AH8nrBfLMEhgm1z3FNgJdAtbjDsPxvbv3iC7r6i7DpR5t3YvUyMcpHUeD4HnVau`

### Claim Boundary

- Umbra SDK-side wSOL encrypted-balance deposit and withdrawal are live on devnet.
- Existing C2H withdraw still uses native SOL direct `stealth_address`.
- ShieldLend payout route still needs native SOL -> wSOL/SPL settlement wiring before claiming Umbra-routed withdrawals.
- Umbra mixer/UTXO path was not claimed; compatible prover remains unresolved for SDK 4.0.0.

---

## 2026-05-08 — MagicBlock PER TypeScript Rail Integration (rail/magicblock)

### Branch

`rail/magicblock` (base: `origin/convergence/zk-constants-artifacts`)

### Objective

Implement MagicBlock as a real privacy rail (not a docs/status placeholder). Research, implement, validate.

### What was done

1. Researched MagicBlock PER docs (`docs.magicblock.gg`), SDK exports, and real API behavior.
2. Confirmed: Anchor 0.32.1 required for Rust macros; workspace uses 0.30.1. Rust macros deferred.
3. Installed `@magicblock-labs/ephemeral-rollups-sdk@0.8.8` in frontend workspace.
4. Created `frontend/src/lib/privacyRails/magicblock.ts` — full TypeScript adapter.
5. Created `scripts/check-magicblock.mjs` — live CLI check (runs real TEE RPC call).
6. Updated `frontend/src/lib/protocolAdapters.ts` — per-rail comment with TEE status.
7. Updated `.env.example` (root + frontend) with all MagicBlock env vars and comments.
8. Updated `docs/HACKATHON.md` and `docs/IMPLEMENTATION_STATUS.md`.

### Live check output

- TEE RPC (`https://devnet-tee.magicblock.app`): **HTTP 200** — `{"jsonrpc":"2.0","result":"ok","id":1}`
- Router RPC (`https://devnet-router.magicblock.app`): **HTTP 200**
- Permission Program ID: `ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1` (verified vs SDK)
- Delegation Program ID: `DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh` (verified vs SDK)
- SDK functions: 13/13 present
- TDX attestation: exception `challenge must decode to 64 bytes` (challenge format delta in SDK vs TEE)
- Private Payments: URL not set (requires Discord access)

### Blockers documented

- TDX attestation challenge encoding mismatch (SDK 0.8.8 vs current devnet TEE)
- Rust PER macros require Anchor 0.32.1 (current 0.30.1)
- Private Payments URL requires Discord access
- VRF: no module in SDK 0.8.x

### Validations passed

---

## 2026-05-08 — IKA dWallet Privacy Rail (rail/ika branch)

**Branch**: rail/ika
**Objective**: Implement IKA dWallet rail or strict capability probe + exact blocker.

### Research Findings (verified 2026-05-08)

- `@ika.xyz/sdk ^0.3.1` is in `frontend/package.json`; installed at root via npm workspaces.
- SDK exports: `IkaClient`, `coordinatorTransactions` (DKG, sign, FutureSign), 4 curves (Ed25519, SECP256K1, Ristretto, SECP256R1).
- Endpoint: `https://pre-alpha-dev-1.ika.ika-network.net:443` (gRPC, auth via user signature).
- **BLOCKER 1**: Single mock signer — not real distributed MPC. Source: https://solana-pre-alpha.ika.xyz/
- **BLOCKER 2**: `ika-dwallet-anchor` Rust CPI crate absent from both Anchor programs — Solana relay not wired.
- **Architecture**: TypeScript SDK manages Sui-side dWallet lifecycle; Solana relay is a Rust CPI concern.

### Files Created

- `frontend/src/lib/privacyRails/ika.ts` — capability probe, `IkaCapabilityReport` type, `buildSignerContext()`, signer mode types
- `scripts/check-ika.mjs` — local probe: SDK availability, CPI presence, exact blockers, capability matrix

### Files Updated

- `frontend/src/lib/protocolAdapters.ts` — IKA rail `healthy: false`, updated role to "pre-alpha / mock signer — CPI not wired"; re-exported `SignerMode` type
- `frontend/src/app/page.tsx` — WhatWorksTodayPanel IKA entry updated; deposit signer mode warning updated
- `.env.example` — removed `NEXT_PUBLIC_IKA_ENABLED=true` (was misleading); added accurate comment
- `package.json` — added `check:ika` script
- `node_modules/@ika.xyz/sdk` — installed at root via `npm install @ika.xyz/sdk@0.3.1`

### Validations (all pass)

- `npm run typecheck:frontend` — PASS
- `npm run build:frontend` — PASS
- `cargo test --workspace` — PASS (47 tests)
- `anchor build --no-idl` — PASS (zero errors)

### Commit

`feat: integrate MagicBlock privacy rails`

---

## 2026-05-08 — MagicBlock PER Live Integration Path (rail/magicblock, Session 2)

### Branch

`rail/magicblock`

### Objective

Build the strongest real MagicBlock PER path possible without breaking ShieldLend C2H.
Add an isolated sidecar example with the full Permission/Delegation/Commit lifecycle.

### What was done

1. Inventoried full SDK 0.8.8 export surface (85 exports vs 13 previously known).
   Key additions: `createDelegateInstruction`, `createCommitInstruction`,
   `ConnectionMagicRouter`, `delegationRecordPdaFromDelegatedAccount`, `getPermissionStatus`,
   `waitUntilPermissionActive`, and a full set of delegation/commit PDAs.
2. Created `examples/magicblock-per-sidecar/` — standalone TypeScript sidecar (NOT in workspace):
   - `src/accounts.ts` — 4 ShieldLend intent account types + `PerPdaBundle` (8 PDAs per account)
   - `src/lifecycle.ts` — `buildSetupInstructions`, `buildCommitAndUndelegateInstructions`,
     `buildCommitOnlyInstructions`, `buildFullLifecycle`
   - `src/shieldlend.ts` — 4 use-case bundles: private deposit intent, proof intent,
     queued withdrawal intent, batched deposit counter
   - `src/index.ts` — demo entry point; derives all PDAs, builds all ixs, hits live RPCs
3. Created `scripts/magicblock-per-smoke.mjs` — 12-section live smoke test.
4. Added `check:magicblock`, `smoke:magicblock`, `typecheck:sidecar` to root `package.json`.

### Live smoke output (2026-05-08)

- 17 pass, 3 warn (expected), 0 fail
- TEE RPC: HTTP 200, Router RPC: HTTP 200
- ConnectionMagicRouter.getDelegationStatus: `isDelegated=false` (correct — account not on devnet)
- getPermissionStatus: `{authorizedUsers:null}` (correct — permission account not created)
- TDX attestation: `challenge must decode to 64 bytes` (known SDK 0.8.8 delta — warn)
- Private Payments URL: not set (blocker — requires Discord)
- Rust macros: blocked on Anchor 0.32.1

### Validations passed

- `npm run typecheck:frontend` — PASS
- `npm run build:frontend` — PASS
- `cargo test --workspace` — PASS (47 tests)
- `anchor build --no-idl` (with PATH fix) — PASS
- `examples/magicblock-per-sidecar` typecheck — PASS (0 errors)

### Commit

`feat: add MagicBlock PER live integration path`

---

### IKA Solana Path (from IKA rail)

**Does NOT work today.** Solana CPI is not wired; mock signer only. Signer mode is `direct_wallet` (reduced privacy). The SDK probe correctly reports all blockers with source-backed evidence.

---

## 2026-05-08 — IKA Live-Hardening

### Objective

Attempt to make IKA genuinely live for ShieldLend or prove exact Solana blockers with source evidence.

### Findings

- **SDK bumped** to `@ika.xyz/sdk@0.4.0` (latest; was ^0.3.1). 44 exports confirmed.
- **WASM functional**: `createClassGroupsKeypair(ED25519)` runs locally — encKey 261B, decKey 194B.
- **B1 [NO_SOLANA_SDK]**: `@ika.xyz/sdk` contains no Solana code. All `coordinatorTransactions` functions (`requestSign`, `approveMessage`, `requestFutureSign`, `requestDWalletDKG`) call `tx.moveCall` against Sui Move targets (`ikaDwallet2pcMpcPackage::coordinator::*`). Zero matches for `solana|web3.js|signTransaction` in `dist/cjs/index.js`. Source: `node_modules/@ika.xyz/sdk/dist/cjs/tx/coordinator.js`.
- **B2 [NO_CPI_CRATE]**: `ika-dwallet-anchor` absent from all three Anchor programs' `Cargo.toml`. Source: `programs/{shielded_pool,lending_pool,nullifier_registry}/Cargo.toml`.
- **B3 [SUI_DEPENDENCY]**: `IkaClient` constructor requires `suiClient` (Sui JSON-RPC). Source: `node_modules/@ika.xyz/sdk/dist/cjs/client/ika-client.js:64`.
- `parseSignatureFromSignOutput` does produce raw bytes from WASM, but only after a completed IKA network sign session on Sui (funded Sui wallet + IKA coins required).
- `getNetworkConfig` supports only `testnet` and `mainnet` (Sui). No Solana network case.

### Files Created

- `scripts/ika-live-sign-smoke.mjs` — local-only Solana-focused probe: SDK load, WASM run, source-backed blocker evidence for B1/B2/B3.

### Files Updated

- `frontend/package.json` — `@ika.xyz/sdk` version bumped `^0.3.1` → `^0.4.0`
- `package-lock.json` — lock updated for @ika.xyz/sdk 0.4.0 + @ika.xyz/ika-wasm 0.2.1 dependencies

### Validations (all pass)

- `node scripts/check-ika.mjs` — exits 0 (SDK available; blockers documented)
- `node scripts/ika-live-sign-smoke.mjs` — exits 0 (all findings confirmed with source evidence)
- `npm run typecheck:frontend` — PASS
- `npm run build:frontend` — PASS
- `cargo test --workspace` — PASS (47 tests)
- `anchor build --no-idl` — PASS

### IKA Solana Path

**Still blocked.** `requestSign` is a Sui Move call, not an Ed25519 byte output. No Solana SDK exists in `@ika.xyz/sdk`. CPI crate absent. Adapter stays `direct_wallet` / reduced-privacy until IKA releases a Solana-native signing path and CPI crate is wired.

---

## 2026-05-08 — Hackathon Demo and Submission Package

### Objective

Create final hackathon demo/submission package based on `convergence/privacy-rails-integration` (commit `93375d4`).

### Files Added

- `docs/DEMO_SCRIPT.md` — step-by-step demo walkthrough, commands, honest framing script for judges
- `docs/SUBMISSION_CHECKLIST.md` — GitHub, tx signatures, video scenes, screenshots, env vars, claim boundary
- `scripts/demo-status.mjs` — self-verifying manifest: git/artifacts/program IDs/rail scripts/live checks/claim boundary

### Files Updated

- `docs/HACKATHON.md` — replaced design-intent doc with submission-focused version: one-liner, confirmed rail status table, Umbra tx signatures, claim boundary, blocker table
- `package.json` — added `demo:status` script
- `README.md` — updated date/branch ref; split privacy rail rows; added doc links to HACKATHON.md and DEMO_SCRIPT.md

### Validations (all pass)

- `node scripts/demo-status.mjs` — exits 0; all checks green; correct claim boundary printed
- `npm run typecheck:frontend` — PASS

---

## 2026-05-08 — wSOL Umbra Payout Path (branch: live/wsol-umbra-e2e)

### Objective

Move Umbra from "separate funded wSOL smoke" to a ShieldLend-compatible wSOL/SPL payout path with a two-step post-withdraw settlement adapter. Native SOL C2H path preserved.

### Files Added/Changed

| File | Action |
|---|---|
| `scripts/devnet-wsol-umbra-roundtrip.mjs` | New — two-step devnet adapter: C2H phase (skip if nullifier consumed) + wSOL wrap + Umbra deposit/withdraw; embedded claim boundary |
| `frontend/src/lib/privacyRails/umbra.ts` | Updated — added `wsol_umbra_adapter` mode, `WsolUmbraPayoutPath` interface, `getWsolUmbraPayoutPath()`, updated `planUmbraDestinationRoute()` |
| `frontend/src/app/page.tsx` | Updated — Withdraw: third mode button, `WsolUmbraAdapterPanel` with step 1/2/3 + confirmed/not-live panels |
| `package.json` | Updated — added `smoke:wsol-umbra-roundtrip` script |
| `docs/UMBRA_WSOL_PAYOUT.md` | New — full design doc, claim boundary table, safe/unsafe wording, UI modes |
| `docs/HACKATHON.md` | Updated — Umbra row and blocker table |
| `docs/SUBMISSION_CHECKLIST.md` | Updated — Scene 3b and Scene 8 |
| `docs/IMPLEMENTATION_STATUS.md` | Updated — Umbra payout rows and Known Blockers |
| `README.md` | Updated — Umbra row in status table |

### Key Decision

Implemented as a "post-withdraw Umbra settlement adapter" (not native protocol-level Umbra payout) because flush_exits is fail-closed (PER adapter requires Anchor 0.32.1). The wrap step uses fresh wallet SOL in the demo to simulate the hypothetical post-flush payout amount. This is honestly labeled throughout.

### Validations

- `npm run typecheck:frontend` — pending
- `npm run build:frontend` — pending
- `cargo test --workspace` — pending
- `anchor build --no-idl` — pending
- `npm run demo:status` — pending
- `npm run build:frontend` — PASS

---

## 2026-05-08 — Anchor 0.32.1 Workspace Upgrade

**Objective**: Upgrade workspace from Anchor 0.30.1 → 0.32.1 for MagicBlock PER and Encrypt Anchor compatibility while preserving the C2H Groth16 withdraw proof path.

**Changes**: `Anchor.toml` pinned `anchor_version = "0.32.1"`; root `Cargo.toml` `anchor-lang = "0.32.1"`; `@coral-xyz/anchor = "^0.32.1"` in `package.json`; `Cargo.lock` + `package-lock.json` refreshed; `docs/ANCHOR_032_UPGRADE.md` created; status docs updated.

**Validations**: `anchor-cli 0.32.1`; `cargo fmt` PASS; `cargo test` 47 tests; `anchor build --no-idl` PASS (SBF syscall warnings — redeploy validation item); typecheck PASS; build PASS.

**Notes**: Anchor 0.32.1 compatibility present; PER macros and Encrypt CPI still not wired; no redeploy performed.

---

## 2026-05-09 — wSOL Umbra Reconciliation

**Objective**: Reconcile roundtrip script with live smoke result — Phase 1 C2H FAILED with `0x0`; Phase 2 (wSOL Umbra) CONFIRMED.

**Changes**: `scripts/devnet-wsol-umbra-roundtrip.mjs` — `SKIP_C2H` flag; `c2hStatus` on all returns; `extractErrorCode()`; `FAILED` classification; conditional claim boundary. `docs/UMBRA_WSOL_PAYOUT.md` — live smoke result; SKIP_C2H docs; claim boundary corrected.

**Validations**: typecheck PASS; build PASS; `cargo test` PASS.

---

## 2026-05-09 — MagicBlock Private Payments Live SPL API

**Objective**: Move MagicBlock Private Payments from placeholder routes to the public SPL API on devnet. Harden with blockhash diagnosis for private-transfer ephemeral submit failure.

**Files added**: `scripts/magicblock-private-payments-live.mjs`, `docs/MAGICBLOCK_PRIVATE_PAYMENTS.md`.

**Files updated**: `frontend/src/lib/privacyRails/magicblock.ts` (typed `/v1/spl` client), `scripts/check-magicblock.mjs` (public API probes), `docs/HACKATHON.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/SUBMISSION_CHECKLIST.md`, `package.json` (added `tweetnacl`).

**Live results**: Health / challenge / login / mint-check / balance / builders all 200. wSOL deposit CONFIRMED. wSOL withdraw CONFIRMED. Private-transfer `sendTo=ephemeral` builder 200; router `Blockhash not found`; TEE rejects writable accounts; base devnet accepts refreshed tx only. `/v1/mcp` 404.

**Devnet signatures**: wSOL wrap `2q5FC6r6...`, MagicBlock deposit `UtqpXCER...`, MagicBlock withdraw `4FXm5NYm...`, private-transfer base-RPC fallback `2BA9bAEk...`.

**Validations**: typecheck PASS; build PASS; `cargo test` PASS; `check-magicblock.mjs` PASS; `magicblock-private-payments-live.mjs --dry-run` PASS.

**Claim boundary**: Private Payments public API deposit/withdraw are live on devnet. Private transfer via intended ephemeral/router RPC is NOT confirmed.

---

## 2026-05-09 — IKA Anchor CPI Compile Wiring

**Branch**: `live/ika-anchor-cpi`

**Objective**: Replace the stale "IKA Solana signing blocked by SDK architecture" status with the most accurate implementation possible from official IKA Solana pre-alpha Anchor docs/source.

**Official source findings**:
- `ika-dwallet-anchor` exists in `dwallet-labs/ika-pre-alpha`.
- Pre-alpha Solana program ID: `87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY`.
- CPI authority PDA seed: `b"__ika_cpi_authority"`.
- `DWalletContext::approve_message(...)` builds instruction discriminator `8` with coordinator, MessageApproval, dWallet, caller program, CPI authority, payer, system program, message digest, metadata digest, user pubkey, signature scheme, and MessageApproval bump.
- Official crate/docs target Anchor v1 / `anchor-lang = "1"`, while ShieldLend is Anchor 0.32.1.

**Implementation**:
- Added local source-equivalent `crates/ika-dwallet-anchor` crate using ShieldLend's workspace `anchor-lang = "0.32.1"`.
- Added `ika-dwallet-anchor` dependency to `programs/lending_pool`.
- Added `lending_pool::approve_ika_borrow_message` with active-loan and `future_sign_authorized` guards, official IKA program ID check, official CPI authority seed, and `DWalletContext::approve_message` call.
- Added `scripts/ika-anchor-cpi-diagnostic.mjs` and updated IKA probes/status/UI/docs to distinguish compile-wired CPI from live relay signing.

**Blocked live tx**:
- No real devnet `approve_message` transaction was submitted.
- Required external state was not available: IKA coordinator PDA, dWallet account controlled by the LendingPool CPI authority PDA, writable MessageApproval PDA, active ShieldLend loan with `future_sign_authorized=true`, message digest, and user pubkey.
- IKA pre-alpha still uses a single mock signer; do not claim production MPC or production privacy.

**Validations**:
- `npm install` — PASS (installed locked workspace dependencies)
- `cargo fmt --all -- --check` — PASS
- `cargo test --workspace` — PASS (48 tests)
- `anchor build --no-idl` — PASS with existing Anchor cfg and SBF syscall warnings
- `npm run typecheck:frontend` — PASS
- `npm run build:frontend` — PASS with existing `ffjavascript` dynamic worker warning
- `npm run demo:status` — PASS; branch warning only because this task branch is `live/ika-anchor-cpi`
- `npm run check:ika` — PASS; reports CPI compile-wired and no live tx
- `npm run check:ika-cpi` — PASS; reports missing external IKA state
- `node scripts/ika-live-sign-smoke.mjs` — PASS; local-only, reports SDK/Sui limits and compile-level CPI status

**Claim boundary**: IKA Anchor CPI is compile-wired in `lending_pool`. IKA relay signing is not live, no IKA devnet approval tx signature exists, and direct wallet remains reduced privacy.

---

## 2026-05-09 — IKA devnet approval smoke reached deployment blocker

**Branch**: `live/ika-anchor-cpi`

**What the new smoke proved**:
- `scripts/ika-anchor-approval-smoke.mjs` generated a fresh collateral proof from the checked-in DEV/TEST artifacts.
- The script temporarily authorized the local wallet in `nullifier_registry`, registered a fresh nullifier, then restored the original authorized-program list.
- `lending_pool::borrow` succeeded on devnet with a fresh loan PDA and `future_sign_authorized=true`.
- IKA TLS gRPC DKG succeeded against `pre-alpha-dev-1.ika.ika-network.net:443`.
- The resulting IKA dWallet PDA was committed on Solana devnet and its authority was transferred to the LendingPool CPI authority PDA.

**What is still blocked**:
- The approval CPI did not land because deployed devnet `lending_pool` program `HLtWrvLyc2SE3ERWHaEdY4RG84GxFfHv3Qf4NzJPxaF7` returned Anchor `InstructionFallbackNotFound` (`0x65`) for `approve_ika_borrow_message`.
- 2026-05-10: traced `scripts/ika-anchor-approval-smoke.mjs` to a local fallback `process.env.LENDING_POOL_PROGRAM_ID ?? "<hardcoded id>"`; it does not read `Anchor.toml`.
- 2026-05-10: user-provided redeploy ID `J2yn42PLSiRvGEj24Uj2q4QeGHZa1sgbzSfoLK81qn` failed `new PublicKey(...)`. Derived the actual deploy-artifact pubkey from `target/deploy/lending_pool-keypair.json` via `solana address -k`: `J2yn42PLSiRvGEGj24Uj2q4QeGHZa1sbgzs5foLK81qn`.
- 2026-05-10: updated active runtime/config/demo/status surfaces to the redeployed `lending_pool` ID, including `Anchor.toml`, program `declare_id!`, `shielded_pool` cross-program constant, frontend runtime constants, and package-exposed devnet scripts.
- 2026-05-10: reran `node scripts/ika-anchor-approval-smoke.mjs`; output now prints `Lending  : J2yn42PLSiRvGEGj24Uj2q4QeGHZa1sbgzs5foLK81qn`, but the run stops earlier at Solana RPC `getBalance` fetch failure before any approval attempt.
- This is now a deployment blocker on our side, not a missing-IKA-state blocker.

**Claim boundary**:
- Accurate: real IKA pre-alpha devnet DKG, on-chain dWallet creation, and authority transfer to ShieldLend CPI authority.
- Not accurate: live IKA approval / relay signing from ShieldLend until `lending_pool` is redeployed and the CPI step succeeds.
2026-05-11T08:04:48Z | IKA approval CPI confirmed on devnet | approve_ika_borrow_message × 2 | tx1: m5trvfdGc2...WBF | tx2: 3AHThchU8E...bk2 | remaining: gRPC presign BCS mismatch (category b)
