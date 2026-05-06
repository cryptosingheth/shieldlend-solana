# Session Handoff — ShieldLend Solana

## Task Objective

Convergence Task 2G-B: Devnet deployment and first runtime validation — COMPLETE.

## Current Status

**C2G-B complete.** All three programs deployed to devnet and IDs verified. initialize confirmed. end-to-end smoke (`devnet-e2e.mjs`) confirmed through `UnknownRoot` guard at withdraw.

## Deployed Programs (Devnet) — All Verified

| Program | Program ID | Status |
|---|---|---|
| `nullifier_registry` | `E42nSmqvSCuC1EWbmzYqsdLHimBMeuZyir5dB5gE24rF` | Deployed |
| `shielded_pool` | `9Bvt3jMawHFRRxpaQTtV5VvFdpZkmAZtvwjTrAX9TAtE` | Deployed + upgraded (Vec cap fix) |
| `lending_pool` | `HLtWrvLyc2SE3ERWHaEdY4RG84GxFfHv3Qf4NzJPxaF7` | Deployed |

All IDs match `Anchor.toml`, `anchor keys list`, and all three `declare_id!` values.

## End-to-End Smoke Test Results (scripts/devnet-e2e.mjs)

| Step | Result | Signature / Note |
|---|---|---|
| `nullifier_registry::initialize` | SKIP (already done prev session) | sig `2of4jzbt...` |
| `shielded_pool::initialize` | CONFIRMED | sig `QMVjEr1d...` |
| `shielded_pool::store_withdraw_proof` | CONFIRMED | sig `5YRBBhwJ...` |
| `shielded_pool::withdraw` | EXPECTED FAIL — UnknownRoot (6007) | Pool is freshly initialized; no deposit has been flushed |

**Withdraw error**: `AnchorError at lib.rs:140. Error Code: UnknownRoot (6007). Merkle root is not in the retained root history.`

This is correct behavior. All account validation (PDA derivation, bump checks, proof_data guards) passed. The only missing piece is a real deposit that populates the pool's Merkle root.

## shielded_pool Vec-Capacity Change (C2G-B bug fix)

Problem: `ShieldedPoolState::SPACE` = 14500 bytes. Solana's CPI realloc limit = 10240 bytes. Anchor's `init` constraint uses realloc internally, causing `initialize` to fail.

Fix: `MAX_EPOCH_COMMITMENTS` and `MAX_EXIT_QUEUE` reduced 128→8. SPACE: 14500 → 1900 bytes.

Note: This is a devnet-only reduction. Production requires a proper realloc-on-insert design.

## Files Changed (C2G-B, this session)

- `programs/shielded_pool/src/lib.rs` — MAX_EPOCH_COMMITMENTS/MAX_EXIT_QUEUE 128→8
- `scripts/devnet-e2e.mjs` — new; full e2e smoke script
- `audit-reports/ONCHAIN_VERIFIER_BLOCKERS.md` — C2G-B complete; realloc fix documented
- `audit-reports/GROTH16_SOLANA_INTEGRATION_PLAN.md` — C2G-B complete; wiring sequence updated
- `docs/IMPLEMENTATION_STATUS.md` — deployment rows updated; smoke results added
- `.ai/CURRENT_TASK.md` — C2G-B complete
- `.ai/SESSION_HANDOFF.md` — this file
- `.ai/DECISIONS.md` — Vec capacity and deploy strategy decisions added
- `.ai/TASK_LOG.md` — C2G-B complete entry appended

## Active Wallet

- Wallet: `HDyzXccSkhSymx6ezTHAhF32dFhJMMYPLZhPDnXiTY6V`
- Balance: ~3.670413760 SOL
- Cluster: devnet

## Remaining Work (Next Task)

1. **Real deposit → flush → full round-trip**: Generate snarkjs proof (withdraw_ring) for a known commitment, deposit it, flush_epoch, store_withdraw_proof, withdraw. This will exercise the on-chain Groth16 verifier.
2. **Privacy rails**: IKA, MagicBlock PER/PrivatePayments, Umbra, Encrypt not wired.
3. **Production realloc design**: ShieldedPoolState should use `realloc` constraints on Deposit/FlushEpoch for production.

## Do Not Claim

- Full on-chain Groth16 verification is live (withdraw path not completed — UnknownRoot guard fires before verifier).
- Production ZK proof artifacts (DEV/TEST only).
- Any privacy rail (IKA, MagicBlock, Umbra, Encrypt) is active.
