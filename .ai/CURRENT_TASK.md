# Current Task

## Status: IKA approve_ika_borrow_message CPI CONFIRMED on devnet (2026-05-11); Encrypt Option B compile-wired on live/encrypt-anchor (2026-05-10)

### IKA Anchor CPI Hardening Pass (2026-05-11)

**Result: PARTIAL**

#### What landed

- `lending_pool` redeployed to fix `DeclaredProgramIdMismatch` (binary had wrong `declare_id!`).
- `registry_writer` PDA `3BkCT5ACdAyWNvo6Cv9RDq8BbHav1wuavH7N3X8NbUwF` added permanently to `nullifier_registry::authorized_programs`.
- `approve_ika_borrow_message` CPI confirmed on devnet **twice**:
  - tx 1: `m5trvfdGc2AtqXh4chLoKdo5cXfCCL7mE3EB7tKHynGdDN5RV12SzpkQX2DgzAFiwzcLtYdQSgBJ1cPPbbj9WBF`
  - tx 2: `3AHThchU8EAjQ2aYsbrDy212JJvHPE3ajtLx2ZLKVBxJnfSHnRTTUeZxX2en2zz4UGmUuzMjU3sgbV5J9bkKZbk2`
- `MessageApproval` PDAs created on-chain both times.
- Script hardened: `SOLANA_RPC_URL`, retry wrappers, randomized DKG session nonce, real attestation in presign, three-case authority handler.

#### Remaining gap

IKA gRPC `PresignForDWallet` fails with `invalid signed_request_data: unexpected end of input` (gRPC code 3). Category (b) IKA coordinator/gRPC issue: BCS schema mismatch between our local definition and the coordinator's current format. Cannot resolve without IKA pre-alpha Rust BCS source.

#### Commit

`e1770ec feat: confirm IKA approve_ika_borrow_message CPI on devnet`

---

### Encrypt Anchor Compatibility Boundary (2026-05-10 — live/encrypt-anchor)

Allowed claim: Encrypt pre-alpha gRPC CreateInput works live and returns ciphertext handles for modeled ShieldLend health/risk values. Option B (`vendor/encrypt-anchor-anchor032`) compile-wires the CPI path. No on-chain FHE is live.

- Hardening commit: `7a2118b feat: harden encrypt anchor demo rail`.
- Official `encrypt-anchor` upstream CPI probe blocked: `EncryptContext` expects `solana_account_info` 3.1.x; Anchor 0.32.1 supplies 2.3.x `AccountInfo`.
- Added `vendor/encrypt-anchor-anchor032`, a minimal local compatibility fork rebased onto `anchor-lang = "0.32.1"`.
- `programs/lending_pool` compile-wires:
  - `request_liquidation_reveal_via_encrypt`
  - `verify_liquidation_reveal_via_encrypt`
- Legacy generic verifier remains fail-closed at `EncryptVerifierNotWired`; no on-chain FHE or on-chain decryption is live.

---

## Hard Constraints

- Do not claim production ZK trusted setup (DEV/TEST pot14 only).
- Do not claim IKA relay signing active end-to-end (approval CPI confirmed; gRPC presign/sign blocked by BCS schema mismatch).
- Do not claim MagicBlock PER Rust macros wired in Anchor programs.
- Do not claim MagicBlock Private Payments private transfer via intended ephemeral/router path confirmed.
- Do not claim native protocol-level Umbra payout (wSOL adapter is post-withdraw simulation; flush_exits fail-closed).
- Do not claim Encrypt on-chain FHE active (Anchor 0.32.1 present; current official CPI blocked by AccountInfo crate-family mismatch; local fork compile-wires path only).
- Do not claim upgraded Anchor 0.32.1 binaries are deployed (no redeploy performed for the Anchor upgrade task).
- Do NOT claim C2H confirmed by roundtrip script (Phase 1 FAILED with `0x0`; C2H confirmed only via `devnet-fullround.mjs`).
- Do not claim production privacy.

---

## Pending

1. Push `convergence/privacy-rails-integration` to remote.
2. Create PR against `main`.
3. Fill C2H devnet tx signatures into `docs/SUBMISSION_CHECKLIST.md`.
4. Record demo scenes (especially Scene 5/6 for IKA and Scene 7 for Encrypt).
