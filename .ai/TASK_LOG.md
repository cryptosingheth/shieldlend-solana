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
