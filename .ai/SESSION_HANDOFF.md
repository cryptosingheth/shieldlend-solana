# Session Handoff — ShieldLend Solana

## Task Objective

Convergence Task 2C: determine whether on-chain Groth16 verifier wiring can proceed
safely without requiring full Anchor IDL generation.

## Current Status

**C2C analysis complete. On-chain verifier wiring is blocked (Outcome B). No code changed.**

- `audit-reports/ONCHAIN_VERIFIER_BLOCKERS.md` created with full file/line evidence.
- `docs/IMPLEMENTATION_STATUS.md` updated with five new blocker rows.
- `.ai/CURRENT_TASK.md` and `.ai/SESSION_HANDOFF.md` updated.
- `.ai/TASK_LOG.md` and `.ai/DECISIONS.md` updated.
- C2B DEV/TEST Groth16 artifacts remain unchanged and correct.
- No program code was modified. No dependency was added. No fake wiring was performed.

## Files Changed (this task)

- `audit-reports/ONCHAIN_VERIFIER_BLOCKERS.md` — created
- `docs/IMPLEMENTATION_STATUS.md` — known-blockers table expanded
- `.ai/CURRENT_TASK.md` — updated
- `.ai/SESSION_HANDOFF.md` — updated (this file)
- `.ai/TASK_LOG.md` — appended
- `.ai/DECISIONS.md` — appended

## Verification

- `cargo fmt --all -- --check` — passed (no code changed)
- `cargo test --workspace` — passed, 21 tests (no code changed)
- `npm run typecheck:frontend` — passed (no frontend code changed)
- `npm run build:frontend` — passed (no frontend code changed)
- `anchor build --no-idl` — passed (no program code changed)

## Current Blockers

1. Full Anchor IDL generation blocked by Anchor/proc-macro2 compatibility. **Not a
   prerequisite for verifier wiring.**
2. Production trusted setup missing; current artifacts are DEV/TEST-only.
3. On-chain Groth16 verification blocked by five concrete issues (see below).
4. Devnet deployment not done.
5. External privacy rails not wired.

## On-Chain Verifier Specific Blockers (C2C)

1. `groth16-solana` absent from all Cargo.toml files.
2. `WithdrawArgs` / `BorrowArgs` / `RepayArgs` lack proof bytes and public signal arrays.
3. vkey conversion script not written (snarkjs JSON → Solana BN254 byte encoding).
4. No Rust on-chain test vectors.
5. Compute budget not handled for BN254 pairing (~220k–260k CU).

## Do Not Claim Publicly Until Implemented

- Production ZK proof artifacts are live.
- On-chain Groth16 verification is wired or live.
- Production trusted setup is complete.
- Any privacy rail (IKA, MagicBlock, Umbra, Encrypt) is active.

## Next Steps

1. Research and pin `groth16-solana` crate version/API. Confirm BPF compatibility
   with Anchor 0.30.1 / solana-program 1.18.x.
2. Write vkey conversion script: snarkjs projective decimal → big-endian affine bytes.
3. Extend `WithdrawArgs`, `BorrowArgs`, `RepayArgs` with proof fields and public signals.
4. Implement the three fail-closed verifier stubs once above prereqs are satisfied.
5. Add Rust test vectors + compute budget handling.
6. Re-run full validation suite after each step.
