# Session Handoff — ShieldLend Solana (live/ika-anchor-cpi)

## Task Objective

IKA Anchor CPI approval hardening pass — make `approve_ika_borrow_message` CPI land on devnet.

---

## Session Outcome (2026-05-11)

### What was done

1. **Diagnosed `DeclaredProgramIdMismatch`**: The binary deployed at `J2yn42PLSiRvGEGj24Uj2q4QeGHZa1sbgzs5foLK81qn` was compiled with an older `declare_id!`. Fixed by redeploying the freshly-built binary:
   - Deploy tx: `65gpwCK6qwyvu1BHzn16G6jTfdvC44FZCnEYaVUi7PtZPmGkoj8hDfNzNSsqXmQNTtUVLmeJL4dHwy9B7z45bL1`

2. **Diagnosed `UnauthorizedWriter`**: `lending_pool::borrow` calls `nullifier_registry::lock` via the `registry_writer` PDA (`3BkCT5ACdAyWNvo6Cv9RDq8BbHav1wuavH7N3X8NbUwF`), which was not in the authorized list. Fixed by adding `ensureRegistryWriterAuthorized()` to the smoke script.

3. **Confirmed `approve_ika_borrow_message` CPI on devnet — TWICE**:
   - Approval tx 1: `m5trvfdGc2AtqXh4chLoKdo5cXfCCL7mE3EB7tKHynGdDN5RV12SzpkQX2DgzAFiwzcLtYdQSgBJ1cPPbbj9WBF`
   - Approval tx 2: `3AHThchU8EAjQ2aYsbrDy212JJvHPE3ajtLx2ZLKVBxJnfSHnRTTUeZxX2en2zz4UGmUuzMjU3sgbV5J9bkKZbk2`
   - `MessageApproval` PDAs created on-chain both times.

4. **Script hardening improvements**:
   - `SOLANA_RPC_URL` env override support (falls back to `RPC_URL` → devnet)
   - `withRetry()` wrapper for `getBalance` and `getLatestBlockhash`
   - Randomized `session_identifier_preimage` per DKG run to get fresh dWallets
   - Presign BCS payload fixed: now uses `dwalletPublicKeyBytes` (not sender pubkey) and real DKG attestation fields
   - Three-case dWallet authority handler: our wallet (transfer) / CPI authority (skip) / foreign authority (fail with exact blocker)
   - Raw DKG attestation preserved through setup return for presign/sign use

5. **Remaining gRPC gap classified**: `PresignForDWallet` fails with gRPC code 3 `invalid signed_request_data: unexpected end of input`. Root cause: our BCS schema for `SignedRequestData { PresignForDWallet }` does not match the IKA pre-alpha coordinator's current schema. Cannot resolve without IKA pre-alpha Rust BCS source. This is category (b) IKA coordinator/gRPC issue.

6. **All docs updated**: `docs/IMPLEMENTATION_STATUS.md`, `docs/SUBMISSION_CHECKLIST.md`, `scripts/demo-status.mjs` all reflect the confirmed approval tx signatures.

7. **Commit**: `e1770ec feat: confirm IKA approve_ika_borrow_message CPI on devnet`

---

## Deployed Programs (Devnet)

| Program | Program ID |
|---|---|
| `nullifier_registry` | `E42nSmqvSCuC1EWbmzYqsdLHimBMeuZyir5dB5gE24rF` |
| `shielded_pool` | `9Bvt3jMawHFRRxpaQTtV5VvFdpZkmAZtvwjTrAX9TAtE` |
| `lending_pool` | `J2yn42PLSiRvGEGj24Uj2q4QeGHZa1sbgzs5foLK81qn` |

`lending_pool` was redeployed in this session (fix: DeclaredProgramIdMismatch). Binary has correct `declare_id!`.

## Active Wallet

`HDyzXccSkhSymx6ezTHAhF32dFhJMMYPLZhPDnXiTY6V` — Solana devnet (~20.6 SOL)

## registry_writer PDA

`3BkCT5ACdAyWNvo6Cv9RDq8BbHav1wuavH7N3X8NbUwF` — permanently added to `nullifier_registry::authorized_programs` this session.

---

## Validation State

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
- **BLOCKED (b)**: IKA gRPC `PresignForDWallet` BCS schema mismatch with pre-alpha coordinator

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

1. Push `live/ika-anchor-cpi` to remote.
2. Create PR against `main`.
3. Fill C2H devnet tx signatures into `docs/SUBMISSION_CHECKLIST.md`.
4. Record demo scenes (especially Scene 5/6 for IKA).

Safe to `/clear` after this handoff.
