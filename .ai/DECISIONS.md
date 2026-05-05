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

Confirmed by `anchor keys list`, `Anchor.toml`, and each program's `declare_id!` during Convergence Task 2 on 2026-05-05.

## Needs confirmation

- Deployment status remains separate from local program-id sync. Do not claim deployed program readiness without localnet/devnet deployment verification.

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
