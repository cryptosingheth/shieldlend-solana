# Architecture & Design Decisions — ShieldLend Solana

Durable decisions only. See `docs/DESIGN_DECISIONS.md` for full ADR entries.

---

## Workspace / Path

**Decision**: Canonical repo is `/Users/opinderpreetsingh/Projects/shieldlend-solana`; remote is `origin → https://github.com/cryptosingheth/shieldlend-solana.git`. Old iCloud/Codex Workspace copies are archived.
**Why**: Repo freshly cloned to Projects/ on 2026-05-03; old worktree at iCloud/Codex Workspace path is stale.
**How to apply**: Always open/run from `/Users/opinderpreetsingh/Projects/shieldlend-solana`. Do not use old iCloud paths or recreate `~/shieldlend-solana`.

---

## Repo Structure

**Decision**: Three separate Anchor programs (`shielded_pool`, `lending_pool`, `nullifier_registry`)
**Why**: `lending_pool` holds NO SOL — all SOL custody is in `shielded_pool`. Clean CPI boundary.
Nullifier registry is shared by both; separate program avoids circular CPI dependencies.
**How to apply**: Never move SOL custody logic into `lending_pool`. All SOL transfers go through `shielded_pool`.

---

## ZK Circuit Choice

**Decision**: Groth16 + BN254 via `groth16-solana` (on-chain verification, atomic)
**Why**: BN254 native syscalls available on Solana; <200k CU per proof verification.
Remote verification rejected — must be atomic on-chain to prevent TOCTOU attacks.
**How to apply**: All proof verification calls go through `groth16-solana`. Never use a remote service.

---

## On-Chain Verifier Wiring Prerequisites (C2C)

**Decision**: Do not wire `groth16-solana` until five prerequisites are cleared in order.
**Why**: C2C analysis confirmed that instruction arg structs lack proof bytes (breaking ABI change
required), the vkey conversion script is missing, no Rust test vectors exist, and compute budget
handling is absent. Adding a stub `return Ok(())` or partial wiring would silently break the
fail-closed security guarantee.
**How to apply**:
1. Research and pin `groth16-solana` crate version/API.
2. Write vkey conversion script (snarkjs JSON → Solana BN254 big-endian affine bytes).
3. Extend `WithdrawArgs`, `BorrowArgs`, `RepayArgs` with `proof_a/b/c` and public signal arrays.
4. Implement verifier calls only after steps 1–3 are complete and test vectors are available.
5. Add compute budget constant and document client-side `set_compute_unit_limit` requirement.
Evidence: `audit-reports/ONCHAIN_VERIFIER_BLOCKERS.md`.

---

## Smart Contract Framework

**Decision**: Use plain Anchor, not Bolt.
**Why**: MagicBlock PER/VRF macros work with plain Anchor, and Bolt's ECS model adds unnecessary complexity for financial PDA/account state machines.
**How to apply**: Keep programs as standard Anchor programs unless a concrete MagicBlock requirement forces otherwise.

---

## Lending Model

**Decision**: Fork/adapt Kamino klend-style lending mechanics and the 11-point poly-linear interest model rather than porting Aave v3 or inventing a flat rate.
**Why**: Kamino is Solana-native, Anchor-compatible, and more granular for utilization-based rates.
**How to apply**: Preserve explicit rate/accounting invariants and avoid simplifying to a flat or two-slope model without a new ADR.

---

## Commitment Formula (locked, do not change)

```
commitment     = Poseidon(secret, nullifier, denomination)
nullifierHash  = Poseidon(nullifier, leaf_index, SHIELDED_POOL_PROGRAM_ID)
```
`leaf_index` prevents cross-position replay. `SHIELDED_POOL_PROGRAM_ID` is a compile-time
domain separator preventing cross-app replay.
**How to apply**: Both inputs must match this formula in circuits AND on-chain verifier. Breaking
either silently invalidates all existing notes.

---

## Ring Size

**Decision**: K=16 (progressive fallback to K=8 below 50 deposits)
**Why**: Meaningful anonymity set. Progressive scaling avoids empty-ring failure at launch.
**How to apply**: Circuit compiled for K=16. Fallback logic in deposit queue.

---

## Merkle Tree

**Decision**: Depth-24 Poseidon Merkle tree (supports 16M leaves)
**Why**: Matches EVM reference design; Poseidon is ZK-friendly and cheaper than SHA256 in-circuit.
**How to apply**: `ROOT_HISTORY_SIZE = 30` (rolling window of retained roots for withdrawal validity).

---

## Fixed Denominations

**Decision**: 0.1 SOL, 1 SOL, 10 SOL only
**Why**: Denomination is a PUBLIC output of the withdraw proof. Variable amounts would require
a separate amount-hiding circuit and break LTV determinism. Deferred post-MVP.
**How to apply**: `require_valid_denomination()` guard in `shielded_pool::deposit`. Do not remove.

---

## Stealth Addresses

**Decision**: All outputs via Umbra SDK — no custom ECDH implementation
**Why**: Umbra is the most mature Solana stealth address library (mainnet alpha Feb 2026).
Custom ECDH has high deanonymization bug risk.
**How to apply**: `frontend/lib/umbra.ts` wraps the SDK. Never bypass it with a custom implementation.

---

## Deposit And Withdrawal Submission

**Decision**: User-facing deposit/withdraw/borrow/repay operations route through IKA relay paths, with MagicBlock PER batching for deposits and exits.
**Why**: IKA removes single server private-key risk; PER addresses timing and exit-classification correlation.
**How to apply**: Do not add a server-private-key relay. Keep withdrawal and borrow disbursement exits on the unified relay → PER → stealth path.

---

## Relay Signing

**Decision**: IKA dWallet `approve_message()` CPI — no fallback to a server private key
**Why**: Single server key is a centralization and custody risk. IKA provides 2PC-MPC.
Pre-alpha: use real adapter first; labeled fallback only if unavailable.
**How to apply**: `lending_pool::borrow` disbursement CPI goes through IKA. If IKA unavailable,
reduce privacy claims visibly in the UI.

---

## Repayment Privacy

**Decision**: MagicBlock Private Payments for Full Privacy mode; ZK input alone is insufficient
**Why**: On-chain ZK proof does not hide repayment transfer graph. Private Payments hides
transfer amount and graph. Degraded mode does not claim repayment privacy.
**How to apply**: UI must show "Degraded" mode when Private Payments rail is unavailable.
Never claim repayment amount privacy without it.

---

## Borrow Amount Visibility

**Decision**: Borrow amount public or bucketed for MVP
**Why**: LTV, interest, liquidation all require deterministic accounting. Encrypted settlement
deferred. Do not claim full borrow amount privacy until implemented.
**How to apply**: Do not add privacy claims for borrow amount in UI or docs without the full
Encrypt FHE + private settlement design.

---

## Liquidation (MVP)

**Decision**: Full liquidation only, minimum borrow size, reserve accounting, stale-oracle pause,
2-slot breach confirmation before liquidation executes
**Why**: Conservative posture for hackathon MVP. Partial liquidation deferred.
**How to apply**: `lending_pool::liquidate` checks `confirmed_liquidatable` flag set only after
breach confirmation. FutureSign consent captured at borrow time.

---

## Randomness And Dummy Commitments

**Decision**: Dummy commitments use MagicBlock VRF plus PER/TEE private entropy, not block hashes or public-only dummy preimages.
**Why**: Block/slot hashes are biasable and public-only dummy formulas reveal or classify dummy leaves.
**How to apply**: Never use `Poseidon(0, 0, denomination)` or any fully public dummy formula.

---

## Deposit Confirmation UX

**Decision**: Use `@solana/web3.js` `onAccountChange()` on `ShieldedPoolState.merkle_root` for post-flush confirmation.
**Why**: It avoids a trusted backend/automation service for frontend deposit confirmation.
**How to apply**: Prefer standard RPC account subscriptions before adding a dedicated notification service.

---

## Frontend Note Vault

**Decision**: AES-256-GCM encrypted local note storage; no plaintext fallback in normal save path
**Why**: Notes contain secrets and nullifiers. Plaintext fallback leaks privacy.
Vault key derived from wallet-signed message.
**How to apply**: `frontend/src/lib/noteStorage.ts`. Do not add a plaintext save path.

---

## Demo State

**Decision**: No seeded demo notes or fake history
**Why**: Fake state confused evaluators and misrepresented protocol readiness.
**How to apply**: All screens show real wallet/RPC state or explicit dependency-blocked messaging.

---

## Protocol Pre-Alpha Handling

**Decision**: Use real adapters first; fail closed; never claim production privacy from stubs
**Why**: IKA has single mock signer; Encrypt has plaintext on-chain storage. Overstating
privacy properties is a credibility risk.
**How to apply**: Each adapter has a `status` field (`FullPrivacy` / `Degraded` / `Unavailable`).
UI must reflect degraded mode clearly.

---

## Program IDs (synced with Anchor keys)

| Program | Program ID |
|---|---|
| shielded_pool | `9Bvt3jMawHFRRxpaQTtV5VvFdpZkmAZtvwjTrAX9TAtE` |
| lending_pool | `HLtWrvLyc2SE3ERWHaEdY4RG84GxFfHv3Qf4NzJPxaF7` |
| nullifier_registry | `E42nSmqvSCuC1EWbmzYqsdLHimBMeuZyir5dB5gE24rF` |

Confirmed by `anchor keys list`, `Anchor.toml`, and each program's `declare_id!` during Convergence Task 2 on 2026-05-05. C2A.5 also aligned `frontend/src/lib/contracts.ts` and ShieldedPool's internal `LENDING_POOL_PROGRAM_ID` to these local Anchor keys.

## Needs confirmation

- Deployment status remains separate from local program-id sync. Do not claim deployed program readiness without localnet/devnet deployment verification.

## ZK Artifact Posture

**Decision**: C2B-generated Groth16 artifacts are DEV/TEST-only, even though local witness/proof/verification smoke tests pass.
**Why**: The current Powers of Tau was generated locally as a one-person dev setup at `circuits/keys/dev_pot14_final.ptau`, not from a reviewed production ceremony.
**How to apply**: Browser proving may use these artifacts for local/dev testing. Do not claim production trusted setup, on-chain verification, or live privacy until reviewed ceremony material and `groth16-solana` integration are complete.

---

## Groth16 Instruction ABI Design (C2E)

**Decision**: Instruction arg structs (`WithdrawArgs`, `BorrowArgs`, `RepayArgs`) carry full proof bytes
(`proof_a: [u8;64]`, `proof_b: [u8;128]`, `proof_c: [u8;64]`) and full public signal arrays
(`public_inputs: [[u8;32];N]`). The old `*_proof_public_signals_hash` fields are removed.
**Why**: On-chain Groth16 verification requires the actual proof points and all public signals
as instruction data. A 32-byte hash is not verifiable by the pairing check.
**How to apply**: Any future instruction that calls a verifier must include full proof bytes.
Do not reintroduce hash-only stubs.

---

## Cross-Field Consistency Guards (C2E)

**Decision**: Every verifier call checks that instruction arg fields match the corresponding
public signal slots before calling the pairing function.
**Why**: Without this, a caller can submit a valid proof for nullifier hash H while claiming
a different hash H' in the instruction args — spending a different nullifier than the proof
authorizes (proof-substitution attack).
**How to apply**: Each `verify_*_proof()` function must contain a guard for every field that
appears in both args and public signals. Currently skipped: `repay public_inputs[4]`
(repaymentVault) — handler does not have loan account access at that call site. Document when added.

---

## Transaction MTU Blocker (B6, C2E)

**Decision**: The `WithdrawArgs` struct totals ~976 bytes in instruction data; with tx overhead
the full transaction ≈ ~1388 bytes > 1232-byte Solana MTU. On-chain withdraw is blocked.
**Why**: Discovered during C2E ABI extension. Rust unit tests are unaffected (no tx size limit).
**How to apply**: Implement proof account pattern before deploying `withdraw`. Write
`proof_a/b/c/public_inputs` to a PDA in a separate transaction; handler reads from the account.
Do not attempt to land the current ABI in a devnet transaction — it will be rejected at the RPC layer.

---

## Implementation Status Ledger

## Proof Account PDA Pattern (C2F)

**Decision**: Proof bytes (`proof_a/b/c + public_inputs`) are written to a PDA in a prior transaction; the main instruction reads from the account. Arg structs carry only a 32-byte `proof_nonce` to seed the PDA.
**Why**: `WithdrawArgs` inline was ~976 bytes → tx ~1388 bytes, exceeding the 1232-byte Solana MTU. The PDA pattern reduces `WithdrawArgs` to 144 bytes (tx ~524 bytes), `BorrowArgs` to 124 bytes.
**Security properties of PDA design:**
- `consumed: bool` — prevents proof replay across two transactions
- `circuit_kind` discriminant — prevents cross-circuit proof substitution
- `authority` binding + constraint — prevents cross-user proof theft
- Per-use `proof_nonce` seed — prevents PDA reuse
**How to apply**: Always generate a fresh nonce per operation (`generateProofNonce()`). Send `store_*_proof` in Tx 1 and `withdraw`/`borrow`/`repay` in Tx 2 using the same nonce. Do not reuse a nonce across two different proof operations.

---

## BPF Stack Frame Warning (B7, C2F → RESOLVED C2G-A)

**Decision**: Apply `Box<Account<'info, T>>` proactively to all contexts with large ProofData or ShieldedPoolState accounts before devnet deployment. Do not defer to runtime.
**Why**: C2G-A preflight revealed that `Withdraw::try_accounts` in shielded_pool also exceeded the 4096-byte BPF limit (6464-byte frame), as did the `withdraw` entry point (4544 bytes). These were pre-existing alongside the C2F-reported lending_pool warnings. Deferring to devnet would waste SOL on deployments that could crash on the first proof verification instruction.
**Resolution**: `Box<Account<'info, ProofData>>` on `Borrow.proof_data`, `Repay.proof_data`, `Withdraw.proof_data`; `Box<Account<'info, ShieldedPoolState>>` on `Withdraw.state`. `ShieldedPoolState` requires boxing because its `historical_roots: [[u8;32]; 30]` (960 bytes fixed array) still contributes to the frame even though Vec contents are heap-allocated.
**How to apply**: When adding a new account context that includes ProofData or any account struct with large fixed-size arrays, default to `Box<Account<'info, T>>`. All Anchor constraints, field accesses, and mutations work identically through Rust's Deref/DerefMut coercion chain.

---

## Implementation Status Ledger

**Decision**: `docs/IMPLEMENTATION_STATUS.md` is the canonical local source for current implementation readiness and privacy claim boundaries.
**Why**: README and older docs can drift from local build/artifact state; a compact ledger prevents stale claims after convergence tasks.
**How to apply**: Update the ledger whenever build readiness, artifacts, deployment status, external rails, or privacy claims change. Do not claim live privacy from target-architecture docs.

---

## Audit-Confirmed Risk Decisions (2026-05-04)

**Decision**: Do not begin any protocol integration (groth16, PER, IKA, Encrypt, Umbra) until `audit-reports/FINAL_AUDIT_REPORT.md` is reviewed and a prioritised fix list is agreed.
**Why**: Pass 2 audit found Critical issues (nullifier state machine bypass, missing CPI wiring, unconstrained Disburse signer, missing ProtocolMode transition instructions) that must be fixed before any new integration work lands on top of them.
**How to apply**: Implementation work starts after FINAL_AUDIT_REPORT.md is reviewed. Critical findings first, then High, then integration work.

---

**Decision**: `nullifier_registry::spend` guard must be changed from `require!(status != Spent)` to `require!(status == Locked)` before any integration testing.
**Why**: Current guard allows Active → Spent skip, bypassing the collateral Locked state entirely. This is the most critical state-machine bug in the current scaffold.
**How to apply**: Fix this first before wiring any CPI from shielded_pool or lending_pool into the registry.

---

**Decision**: `[0;32]` zero-root must be excluded from `is_known_root()` before groth16 is wired.
**Why**: All roots default to zero on fresh init, making `[0;32]` always a valid root. Once groth16 is live, an empty-tree proof would drain a fresh pool.
**How to apply**: Add `if root == [0;32] { return false; }` guard in `is_known_root()` before wiring the verifier.

---

## groth16-solana API (pinned, C2D)

**Decision**: Use `groth16-solana = "0.0.3"` in both on-chain programs. Do not use 0.2.0 or later.
**Why**: The current workspace uses Anchor 0.30.1 + solana-program 1.18.x. Version 0.2.0 requires the Solana 2.x / agave SDK, which creates an incompatible dependency tree.
**How to apply**: Keep `groth16-solana = "0.0.3"` pinned. When upgrading to Solana 2.x toolchain, re-evaluate the crate version at that time.

**Decision**: The `vk_gamme_g2` field name in `Groth16Verifyingkey` (double-m, in 0.0.3) is intentional in the crate source.
**Why**: It is a known typo in the published crate. Future versions may fix it. Using the wrong spelling (`vk_gamma_g2`) will cause a compile error against 0.0.3.
**How to apply**: Generated `groth16_verifier.rs` files already use the correct spelling. Do not "fix" the double-m.

**Decision**: `proof_a` must be passed as the **negated** G1 point: `(x, q − y) mod BN254_BASE_FIELD_PRIME`.
**Why**: `groth16-solana` applies the negation convention required for on-chain Groth16 verification using the Solana alt_bn128 syscall (EIP-197 compatible). Passing the un-negated `pi_a` from snarkjs will produce a pairing mismatch.
**How to apply**: `scripts/convert-vkeys.mjs::g1NegBytes()` handles this. The conversion script must be re-run whenever circuits or keys change.

**Decision**: G2 points from snarkjs must be reordered from `[[c1,c0],[c1,c0]]` to `[c0||c1||c0||c1]` BE before passing to `groth16-solana`.
**Why**: snarkjs stores the c1 coefficient at index [i][0] and c0 at [i][1]. Solana alt_bn128 / EIP-197 expects x_c0 first. Passing in snarkjs order will produce a pairing mismatch.
**How to apply**: `scripts/convert-vkeys.mjs::g2Bytes()` handles this. Re-run the script when circuits or keys change.

---

## Devnet Deployment Strategy (C2G-B)

**Decision**: Deploy programs one at a time using `anchor deploy --program-name <name> --provider.cluster devnet`. Do not rely on `anchor deploy` (all programs) when SOL balance is marginal.
**Why**: Each program requires a buffer account sized to the `.so` binary for rent-exempt storage. Deploying smallest-first preserves balance and produces clearer error attribution if SOL runs out mid-sequence.
**How to apply**: Deploy order: `nullifier_registry` (smallest) → `shielded_pool` → `lending_pool` (largest). Stop if balance is insufficient and document exact shortfall. Never deploy without checking `solana balance` first.

---

## Devnet Smoke Test Pattern (C2G-B)

**Decision**: Smoke test uses `scripts/devnet-smoke.mjs` with the DEV/TEST proof vectors from `groth16_verifier.rs`. A fresh random `proof_nonce` per run ensures the PDA init succeeds even on repeated runs.
**Why**: The `store_*_proof` instructions use `init` on the proof_data PDA. Re-using the same nonce on a second run would fail with "account already in use." Randomized nonces avoid this and mirror real-world usage.
**How to apply**: Always generate a fresh `randomBytes(32)` nonce when calling `store_*_proof`. Never hardcode a nonce in production paths.

---

## Nullifier Registry Authorization: PDA Address, Not Program ID (C2H)

**Decision**: `nullifier_registry::authorized_programs` must contain registry_writer **PDA addresses**, not program IDs.
**Why**: `assert_authorized` in `nullifier_registry` checks `writer.key()`. When a program signs a CPI using `invoke_signed` with seeds `[b"registry-writer", &[bump]]`, the account appearing as signer in the callee is the PDA derived from those seeds — not the caller's program ID. Setting `authorized_programs` to program IDs causes `UnauthorizedWriter` on every `register`/`lock`/`spend` CPI call.
- shielded_pool registry_writer: `E4kXXwght9DYxDnAwcmtbcJ5cV2Azjn98eNJJa2q5Szf` (seeds `[b"registry-writer"]`, program `9Bvt3jMa...`)
- lending_pool registry_writer: `CHCEx9fzSVQVxC9kAQ6K4tRgajjbcwNA2tg1LtbjqoCk` (seeds `[b"registry-writer"]`, program `HLtWrvLy...`)
**How to apply**: When calling `initialize` or `update_authorized_programs` on `nullifier_registry`, always pass the registry_writer PDA addresses. `devnet-fullround.mjs` Step 0a computes these automatically and updates the config if wrong.

---

## ShieldedPoolState Vec Capacity (C2G-B devnet fix)

**Decision**: Reduce `MAX_EPOCH_COMMITMENTS` and `MAX_EXIT_QUEUE` from 128 to 8 for devnet. `ShieldedPoolState::SPACE` goes from ~14500 bytes to 1900 bytes.
**Why**: Solana's CPI realloc limit is 10240 bytes per call. Anchor's `init` constraint uses `create_account` + internal `realloc` to initialize accounts. With SPACE=14500, the realloc step fails with "Account data size realloc limited to 10240 in inner instructions". The 128-slot pre-allocation design is incompatible with Anchor's init on current devnet.
**How to apply**: Production path must use `space = BASE_SPACE` (fixed fields only, empty Vecs) at init + explicit `realloc` constraints on `Deposit` and `FlushEpoch` contexts to grow the account as commitments are added. For devnet smoke testing, cap=8 is sufficient.
