# Session Handoff — ShieldLend Solana (convergence/privacy-rails-integration)

## Task Objective

Merge IKA Anchor CPI approval hardening (`live/ika-anchor-cpi`) and Encrypt Anchor Option B demo rail (`live/encrypt-anchor`) into `convergence/privacy-rails-integration`.

- **IKA**: `approve_ika_borrow_message` CPI confirmed on devnet. Remaining gap: gRPC presign BCS schema mismatch (category b — cannot resolve without IKA pre-alpha Rust source).
- **Encrypt**: Option B (`vendor/encrypt-anchor-anchor032`) compile-wires `request_liquidation_reveal_via_encrypt` / `verify_liquidation_reveal_via_encrypt`. gRPC CreateInput live. No on-chain FHE proven.

---

## Session Outcome — Encrypt Option B Hardening (2026-05-10, live/encrypt-anchor)

Full validation suite passed on `live/encrypt-anchor` at commit `7a2118b feat: harden encrypt anchor demo rail`:

| Check | Result |
|---|---|
| `cargo fmt --all -- --check` | PASS |
| `cargo test --workspace` | PASS — 52 tests |
| `anchor build --no-idl` | PASS (SBF warnings only) |
| `npm run typecheck:frontend` | PASS |
| `npm run build:frontend` | PASS |
| `npm run demo:status` | PASS — all ok (branch warn fixed) |
| `npm run check:encrypt -- --live` | PASS — ciphertext `TEKonURJhM41WBgKhgJYfyHzmnpnQ3tdgJBSnS62zRi` |
| `npm run check:encrypt-anchor -- --live` | PASS — upstream blocked confirmed; local fork compiles |
| `node scripts/encrypt-health-smoke.mjs --live` | PASS — 3 ciphertext handles returned |

Encrypt devnet state (2026-05-10):
- 2 active network keys: disc=2 `f00f3465...` (real), disc=7 `5555...` (sentinel)
- Latest health_ratio ciphertext: `TEKonURJhM41WBgKhgJYfyHzmnpnQ3tdgJBSnS62zRi`
- Latest health-smoke inputs: collateral `AfVVxyXvMcd5Gia36rRjFUbhwdx7GsDMty6XTuDGQ2Hw`, debt `GarhsLbtNa5EKB4GvUac7fZvAidTW3MaSyxFjK5a7q6F`, threshold `2wF4v3ZhXCN1vbisMGsngiDTPUUfSJuQiixNstC97MtD`

Do not claim on-chain Encrypt/FHE health verification. The current state is client/gRPC live plus a reproducible upstream Anchor CPI blocker and a local compile-wired compatibility fork. No live Encrypt decryption round-trip through LendingPool is proven.

---

## Session Outcome — IKA Anchor CPI Hardening (2026-05-11)

### What was done

1. **Diagnosed `DeclaredProgramIdMismatch`**: Redeployed lending_pool binary with correct `declare_id!`.
   - Deploy tx: `65gpwCK6qwyvu1BHzn16G6jTfdvC44FZCnEYaVUi7PtZPmGkoj8hDfNzNSsqXmQNTtUVLmeJL4dHwy9B7z45bL1`

2. **Diagnosed `UnauthorizedWriter`**: Added `ensureRegistryWriterAuthorized()` to smoke script.

3. **Confirmed `approve_ika_borrow_message` CPI on devnet — TWICE**:
   - Approval tx 1: `m5trvfdGc2AtqXh4chLoKdo5cXfCCL7mE3EB7tKHynGdDN5RV12SzpkQX2DgzAFiwzcLtYdQSgBJ1cPPbbj9WBF`
   - Approval tx 2: `3AHThchU8EAjQ2aYsbrDy212JJvHPE3ajtLx2ZLKVBxJnfSHnRTTUeZxX2en2zz4UGmUuzMjU3sgbV5J9bkKZbk2`
   - `MessageApproval` PDAs created on-chain both times.

4. **Script hardening**: `SOLANA_RPC_URL` env override, `withRetry()` wrapper, randomized DKG session nonce, real DKG attestation in presign, three-case authority handler.

5. **Remaining gRPC gap**: `PresignForDWallet` fails with gRPC code 3 `invalid signed_request_data: unexpected end of input`. Root cause: local BCS schema for `SignedRequestData { PresignForDWallet }` does not match IKA pre-alpha coordinator's current schema. Cannot resolve without IKA pre-alpha Rust BCS source.

6. **Commit**: `e1770ec feat: confirm IKA approve_ika_borrow_message CPI on devnet`

---

## Deployed Programs (Devnet)

| Program | Program ID |
|---|---|
| `nullifier_registry` | `E42nSmqvSCuC1EWbmzYqsdLHimBMeuZyir5dB5gE24rF` |
| `shielded_pool` | `9Bvt3jMawHFRRxpaQTtV5VvFdpZkmAZtvwjTrAX9TAtE` |
| `lending_pool` | `J2yn42PLSiRvGEGj24Uj2q4QeGHZa1sbgzs5foLK81qn` |

`lending_pool` was redeployed in the IKA session (fix: DeclaredProgramIdMismatch). Binary has correct `declare_id!`.

## Active Wallet

`HDyzXccSkhSymx6ezTHAhF32dFhJMMYPLZhPDnXiTY6V` — Solana devnet (~20.6 SOL)

## registry_writer PDA

`3BkCT5ACdAyWNvo6Cv9RDq8BbHav1wuavH7N3X8NbUwF` — permanently added to `nullifier_registry::authorized_programs` in IKA session.

---

## Confirmed Integration State

### C2H / Groth16

- Full devnet round-trip via `devnet-fullround.mjs`: deposit → flush_epoch → store_withdraw_proof → withdraw.
- On-chain Groth16 BN254: PASSED — 198,502 CU; nullifier consumed; CPI succeeded.
- Trusted setup: DEV/TEST pot14 only — NOT production.
- Roundtrip script Phase 1: FAILED with `0x0` (nullifier/root consumed from earlier run).

### Umbra Rail

- `@umbra-privacy/sdk@4.0.0`. Devnet program: `DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ`.
- Funded devnet wSOL deposit/withdraw: 7 confirmed tx signatures.
- wSOL Umbra settlement adapter (Phase 2): CONFIRMED live.
- ShieldLend C2H payout: still native SOL direct `stealth_address`; flush_exits fail-closed.
- `SKIP_C2H=1` mode available for Umbra-only demo runs.

### Encrypt Rail

- gRPC `encrypt.v1.EncryptService/CreateInput` live on pre-alpha devnet.
- Endpoint: `pre-alpha-dev-1.encrypt.ika-network.net:443`.
- Latest health_ratio ciphertext: `TEKonURJhM41WBgKhgJYfyHzmnpnQ3tdgJBSnS62zRi`.
- Anchor 0.32.1 present; official `encrypt-anchor` CPI blocked by `solana_account_info` 3.1.x vs 2.3.x crate-family mismatch.
- Local vendor fork (`vendor/encrypt-anchor-anchor032`) compile-wires `request_liquidation_reveal_via_encrypt` and `verify_liquidation_reveal_via_encrypt` in `lending_pool`.
- No live on-chain Encrypt/FHE decryption round-trip proven.

### MagicBlock Rail

- `@magicblock-labs/ephemeral-rollups-sdk@0.8.8`.
- TEE RPC HTTP 200; Router RPC HTTP 200.
- PER sidecar: 17/17 smoke pass; 13/13 SDK functions verified.
- Anchor 0.32.1 present; Rust PER macros not yet wired.
- Private Payments public API: wSOL deposit/withdraw CONFIRMED; private-transfer ephemeral path BLOCKED.
- TDX attestation: challenge mismatch SDK 0.8.8 vs devnet TEE.

### IKA Rail

- `@ika.xyz/sdk@0.4.0` + WASM loaded.
- SDK/capability probe confirmed; WASM `createClassGroupsKeypair(ED25519)` runs locally.
- `approve_ika_borrow_message` CPI CONFIRMED on devnet (2026-05-11) — two tx signatures.
- gRPC `PresignForDWallet` blocked: BCS schema mismatch with pre-alpha coordinator.
- Direct wallet fallback: labelled "reduced privacy".

Devnet signatures (MagicBlock Private Payments, 2026-05-09):

| Step | Signature |
|---|---|
| wSOL wrap | `2q5FC6r6HpR2FmKt9nfB1ZjHEYEgAszzBCe73NVxiCeyoYDhd3dePdHVLuJetsWmbWYW2svstPNUpjEf9ZwPPhuP` |
| MagicBlock deposit | `UtqpXCERPPZoP1HNPXzj1Frmh7MtqXGiE66GMnpZvvrziNQL1YrWVzFfShYB4EU4HAnofmdeJXNhjb1C96XPFct` |
| MagicBlock withdraw | `4FXm5NYmEf9gTXdGWGUiHB7BzEEXTaAB1WW6GhDS6QN4XKmEtH9Cw9hkRBAsqxHST2M9En39MTwfbLqNV5c9WRpP` |
| Private-transfer base-RPC fallback | `2BA9bAEk78cxfDHDqDDHaGs6CsbYdSXn17hGEV7DHitWm873CNSecigThUvqwJEa9oX6q8btGKfPAmrC2MnvtV1s` |

---

## Validation State (IKA session 2026-05-11)

| Command | Result |
|---|---|
| `cargo test --workspace` | PASS — 47 tests (28 lending_pool, 6 nullifier_registry, 14 shielded_pool) |
| `anchor build --no-idl` | PASS — SBF warnings only |
| `npm run typecheck:frontend` | PASS |
| `npm run build:frontend` | PASS |
| `npm run demo:status` | PASS — all checks green |
| `node scripts/ika-anchor-approval-smoke.mjs` | PARTIAL — approval CPI confirmed; gRPC presign blocked |

---

## Final Status: PARTIAL

- **LIVE**: `approve_ika_borrow_message` CPI confirmed on devnet (two tx signatures)
- **LIVE**: Encrypt gRPC CreateInput live; local Anchor 0.32 fork compile-wires request/reveal path in `lending_pool`
- **BLOCKED (b)**: IKA gRPC `PresignForDWallet` BCS schema mismatch with pre-alpha coordinator
- **BLOCKED**: Encrypt on-chain FHE — upstream AccountInfo crate-family mismatch; local fork compile-wired only

---

## Do Not Claim

- Production ZK trusted setup (DEV/TEST pot14 only)
- Production privacy
- IKA relay signing active end-to-end (approval CPI confirmed; gRPC presign/sign blocked)
- MagicBlock PER Rust macros wired
- MagicBlock Private Payments private transfer via ephemeral/router
- MagicBlock TDX attestation verified
- Umbra native SOL payout
- Encrypt on-chain FHE active
- C2H confirmed by roundtrip script (Phase 1 FAILED with `0x0`)

---

## Next Actions

1. Push `convergence/privacy-rails-integration` to remote.
2. Create PR against `main`.
3. Fill C2H devnet tx signatures into `docs/SUBMISSION_CHECKLIST.md`.
4. Record demo scenes (especially Scene 5/6 for IKA and Scene 7 for Encrypt).

Safe to `/clear` after this handoff.
