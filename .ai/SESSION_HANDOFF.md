# Session Handoff — ShieldLend Solana

## Task Objective

IKA dWallet privacy rail — COMPLETE (probe + exact blocker documented, no fake relay).

## Current Status

**IKA rail complete (probe + blocker).** IKA pre-alpha SDK probed and documented. Solana relay is NOT wired — exact blockers documented with source evidence. C2H still holds.

**C2H still holds.** All three programs remain deployed and verified. Full deposit → flush_epoch → store_withdraw_proof → withdraw round-trip confirmed on devnet. On-chain Groth16 BN254 verification: 198,502 CU, pairing passed.

## Deployed Programs (Devnet) — All Verified

| Program | Program ID | Status |
|---|---|---|
| `nullifier_registry` | `E42nSmqvSCuC1EWbmzYqsdLHimBMeuZyir5dB5gE24rF` | Deployed |
| `shielded_pool` | `9Bvt3jMawHFRRxpaQTtV5VvFdpZkmAZtvwjTrAX9TAtE` | Deployed + upgraded (Vec cap fix) |
| `lending_pool` | `HLtWrvLyc2SE3ERWHaEdY4RG84GxFfHv3Qf4NzJPxaF7` | Deployed |

All IDs match `Anchor.toml`, `anchor keys list`, and all three `declare_id!` values.

## C2H Round-Trip — Transaction Signatures

| Step | Instruction | Signature |
|---|---|---|
| 0a | `nullifier_registry::update_authorized_programs` (PDA fix) | `5nqg3EDxMi6My224DV43xmqjbfzMWuCr5njQAkBFkzNwTkRKY9xQ8jjqGdRRoRPaUYfJWeF8UhsWkM48VPAnQcCK` |
| 1 | `shielded_pool::deposit` | `3dsEYbRR7o66HYErueU6Fdzt1dSEhX6mpRm2XSZArzzWib7kbjnETUgw6dAfZBsXfw45nQuH8gbSGKfZEvNkGRtu` |
| 2 | `shielded_pool::flush_epoch` | `2GXQhThHoHB7hBmZXWHxP9VCm2eU3e19NoRCaj8L5a2p6L7yUkv4vCH4yM4cUqMyY23xhqV51fsts5Wu8bsTgqBL` |
| 3 | `shielded_pool::store_withdraw_proof` | `5vd2RnQJwCmqQ9YmNSFUA5dxZWRNmGudmMurGVgXtcgm1MKHP8LZJBi6EVra4vBinXqoX2b9tBidTYXxzW1JNBed` |
| 4 | `shielded_pool::withdraw` (Groth16 PASS) | `3s7zqUmuTLmYCMKW6JtH27easQetAUZP6DUhuKAXzL5b27wfMPRL5nx6eRX64C59kRQ7LmfBsii18TJBpQi2FDhd` |

**Groth16 pairing**: 198,502 CU consumed and passed.

## Critical Discovery: UnauthorizedWriter (registry_writer PDA vs program ID)

`nullifier_registry::assert_authorized` checks `writer.key()` — the account that appears as signer in the CPI. In Anchor `invoke_signed`, the signer is the **registry_writer PDA** derived from `[b"registry-writer"]` in the calling program, NOT the calling program's ID.

Registry_writer PDAs:
- shielded_pool: `E4kXXwght9DYxDnAwcmtbcJ5cV2Azjn98eNJJa2q5Szf`
- lending_pool: `CHCEx9fzSVQVxC9kAQ6K4tRgajjbcwNA2tg1LtbjqoCk`

The initial `authorized_programs` list was set to program IDs (wrong). Fixed by calling `update_authorized_programs` with the PDA addresses. `devnet-fullround.mjs` Step 0a auto-detects and corrects this.

## Files Changed (IKA live-hardening, 2026-05-08)

- `scripts/ika-live-sign-smoke.mjs` — new; local-only Solana signing capability probe with source-backed blocker evidence
- `frontend/package.json` — @ika.xyz/sdk bumped ^0.3.1 → ^0.4.0
- `package-lock.json` — updated for sdk 0.4.0 + ika-wasm 0.2.1
- `.ai/TASK_LOG.md` — IKA live-hardening entry appended
- `.ai/SESSION_HANDOFF.md` — this file updated
- `.ai/CURRENT_TASK.md` — updated

## Files Changed (IKA rail, prior session)

- `frontend/src/lib/privacyRails/ika.ts` — capability probe, signer mode types, disclosure constants
- `scripts/check-ika.mjs` — local probe: SDK availability, CPI presence, exact blockers, capability matrix
- `frontend/src/lib/protocolAdapters.ts` — IKA rail healthy: false, role updated, SignerMode re-exported
- `frontend/src/app/page.tsx` — WhatWorksTodayPanel + deposit warning updated for IKA pre-alpha/mock signer
- `.env.example` — removed NEXT_PUBLIC_IKA_ENABLED=true; added accurate comment
- `package.json` — added check:ika script

## Active Wallet

- Wallet: `HDyzXccSkhSymx6ezTHAhF32dFhJMMYPLZhPDnXiTY6V`
- Balance: 3.554668080 SOL (after C2H; net cost ≈ 0.108515 SOL including 0.1 SOL deposited)
- Cluster: devnet

## Validations Passed (C2H)

- `cargo fmt --all -- --check` — PASS
- `cargo test --workspace` — PASS (47 tests)
- `npm run typecheck:frontend` — PASS
- `npm run build:frontend` — PASS
- `anchor build --no-idl` — PASS (zero stack-frame error diagnostics)

## Remaining Work (Next Task)

1. **MagicBlock PER/VRF/PrivatePayments**: not wired.
2. **Umbra**: not wired.
3. **Encrypt FHE**: not wired.
4. **IKA Solana relay (if pre-alpha matures)**: wire `ika-dwallet-anchor` CPI into Anchor programs when mock signer is replaced by real MPC.
5. **Production realloc design**: ShieldedPoolState should use `realloc` constraints for production-scale capacity.
6. **Trusted setup ceremony**: DEV/TEST ptau is not production-ready.

## Do Not Claim

- Production ZK proof artifacts (DEV/TEST only — `circuits/keys/dev_pot14_final.ptau`).
- Any privacy rail (IKA, MagicBlock, Umbra, Encrypt) is active.
- Full on-chain privacy (Groth16 verification confirmed with DEV/TEST setup only).
