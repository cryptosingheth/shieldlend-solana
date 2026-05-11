# Current Task

## Status: IKA approve_ika_borrow_message CPI CONFIRMED on devnet (2026-05-11)

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

## Hard Constraints

- Do not claim production ZK trusted setup (DEV/TEST pot14 only).
- Do not claim IKA relay signing active end-to-end.
- Do not claim MagicBlock PER Rust macros wired.
- Do not claim MagicBlock Private Payments private transfer via intended ephemeral/router path.
- Do not claim Encrypt on-chain FHE active.
- Do not claim production privacy.

---

## Pending

1. Push `live/ika-anchor-cpi` to remote.
2. Create PR against `main`.
3. Fill C2H devnet tx signatures into `docs/SUBMISSION_CHECKLIST.md`.
4. Record demo scenes.
