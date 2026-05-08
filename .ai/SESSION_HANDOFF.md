# Session Handoff — ShieldLend Solana

## Task Objective

Umbra Live-Hardening on `rail/umbra` — COMPLETE.

## Current Status

**Umbra funded wSOL SDK flow complete; C2H preserved.** Official `@umbra-privacy/sdk@4.0.0` is installed. The frontend has a fail-closed Umbra adapter, Withdraw destination mode selector, funded-flow status surface, and `/api/integrations/umbra/status`. Direct `stealth_address` mode remains preserved for the existing C2H native SOL withdrawal path and is labeled lower privacy. Umbra SDK-side wSOL encrypted-balance deposit/withdraw is live on devnet, but ShieldLend native SOL C2H routing is still blocked until a wSOL/SPL/Token-2022 exit leg is wired.

Previous C2H remains complete: all three programs deployed and verified. Full deposit → flush_epoch → store_withdraw_proof → withdraw round-trip confirmed on devnet. On-chain Groth16 BN254 verification confirmed: 198,502 CU consumed, pairing passed.

## Umbra SDK Findings

- Source docs: `https://sdk.umbraprivacy.com/introduction` and `https://sdk.umbraprivacy.com/llms.txt`.
- Official package installed: `@umbra-privacy/sdk@4.0.0`.
- Docs/registry drift: docs LLM index mentions SDK `v3.0.0`, but npm registry latest resolved to `4.0.0`.
- Devnet program ID: `DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ`.
- Mainnet program ID: `UMBRAD2ishebJTcgCLkTkNUx1v3GyoAgpTRPeWoLykh`.
- Supported assets per docs: SPL and Token-2022; native SOL requires wSOL or another supported token representation.
- Wallet support: SDK expects `IUmbraSigner` and exports `createSignerFromWalletAccount` for Wallet Standard wallet accounts.
- Optional prover blocker: `@umbra-privacy/web-zk-prover@2.0.1` peers `@umbra-privacy/sdk@2.0.3`, so it was not force-installed beside SDK 4.0.0.

## Umbra Funded Devnet Smoke

- Script: `npm run smoke:umbra-funded`
- Asset: wSOL
- Mint: `So11111111111111111111111111111111111111112`
- Amount: `1000000` base units (`0.001` wSOL)
- Wallet: `HDyzXccSkhSymx6ezTHAhF32dFhJMMYPLZhPDnXiTY6V`
- Result: funded SDK-side Umbra encrypted-balance deposit and withdrawal passed; encrypted balance was `1000000` after deposit and `0` after withdrawal.
- Native SOL caveat: C2H is not Umbra-routed. The funded script proves the wSOL/SPL SDK rail, not a ShieldedPool payout bridge.

| Step | Signature |
|---|---|
| wSOL wrap + SyncNative | `cyQG7Bw7Skuu2QCMu8Gvmx5JSfbcSwGGD3utoRq7jm3iAkxKHCgKjXeGxjBBGL3ZWYYe1JTqykdAQFj5thw85As` |
| Umbra deposit queue | `SZeGJ9FMkhiAnz2hq9oeWSgX1pccrE5rCqgZWjUMd4pu7ZzaHrNM9K6aaMxqqNfZ1cYHWSvwYYAp5gJwhtTovyx` |
| Umbra deposit callback | `2nPcvgkfXhYWuAAxHfhjH8WCi4afguYbhqu3uYdpYgEH1As5jB8R2evfiUWXmFekz1CXfhB1HwHosiQKYGjCxMVL` |
| Umbra deposit rent reclaim | `2MFBu2kb2VFPHRRhDYK4ip9uwm3Vm8vaYGdhCogx9V4LBCwjw3nrjx1oY6JefQkRPX3T9P2ttcVPcw6L4Rkh7Uib` |
| Umbra withdraw queue | `yVdTJQi8DxnRyB1BBW2zkTenm7WhxXAqztXqoAsqUQdnEdKhqUBQrWACbMeLkdEGkCuGbPGKVYfGAVzRLLeHg5u` |
| Umbra withdraw callback | `31UinqaCswx1kNJGpZbGoFgr6AH8nrBfLMEhgm1z3FNgJdAtbjDsPxvbv3iC7r6i7DpR5t3YvUyMcpHUeD4HnVau` |
| Umbra withdraw rent reclaim | `4zm2xwJ4TfCGTTwtcG72wfj3xXjsYiDfNqZBRY1Kp2qyszwezjywjJCC63LphzUK9Qbs5jhbv37NLYEFcLfoqKEm` |

## Files Changed (Umbra)

- `frontend/src/lib/privacyRails/umbra.ts` — new official SDK adapter, status/config helpers, route planning, direct deposit/withdraw, receiver-UTXO function.
- `scripts/check-umbra.mjs` — new SDK/package/program/indexer/relayer check.
- `scripts/umbra-smoke.mjs` — new SDK client-init/devnet query smoke; no token action submitted.
- `scripts/umbra-funded-smoke.mjs` — funded devnet wSOL SDK deposit/withdraw smoke.
- `scripts/umbra-wsol-smoke.mjs` — wSOL-specific wrapper for the funded smoke.
- `frontend/src/app/page.tsx` — Withdraw destination mode selector + Umbra status panel.
- `frontend/src/app/api/integrations/umbra/status/route.ts` — SDK health/funded-flow/payout-route status API.
- `frontend/src/app/globals.css` — route selector/status styling.
- `frontend/src/lib/protocolAdapters.ts` — Umbra status reflects SDK config and required full-privacy rail.
- `.env.example` — Umbra devnet env vars.
- `docs/HACKATHON.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/PRIVACY_AND_THREAT_MODEL.md`, `README.md` — updated to avoid fake native-SOL/Umbra claims.
- `package.json`, `frontend/package.json`, `package-lock.json` — SDK dependency and scripts.

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

## Files Changed (C2H, previous session)

- `scripts/devnet-fullround.mjs` — new; full round-trip script (deposit + flush + auth fix + store_proof + withdraw)
- `docs/IMPLEMENTATION_STATUS.md` — C2H entries added; on-chain Groth16 confirmed; lending_pool deployed row updated
- `audit-reports/ONCHAIN_VERIFIER_BLOCKERS.md` — C2H section added with full tx sigs and UnauthorizedWriter discovery/fix
- `audit-reports/GROTH16_SOLANA_INTEGRATION_PLAN.md` — status updated to C2H complete; round-trip section added
- `.ai/CURRENT_TASK.md` — C2H complete
- `.ai/SESSION_HANDOFF.md` — this file
- `.ai/DECISIONS.md` — registry_writer PDA authorization decision added
- `.ai/TASK_LOG.md` — C2H complete entry appended

## Active Wallet

- Wallet: `HDyzXccSkhSymx6ezTHAhF32dFhJMMYPLZhPDnXiTY6V`
- Balance: 3.554668080 SOL (after C2H; net cost ≈ 0.108515 SOL including 0.1 SOL deposited)
- Cluster: devnet

## Validations Passed (C2H)

- `cargo test --workspace` — PASS (47 tests)
- `npm run typecheck:frontend` — PASS
- `npm run build:frontend` — PASS
- `anchor build --no-idl` — PASS (zero stack-frame error diagnostics)

## Validations Passed (Umbra Branch)

- `npm run typecheck:frontend` — PASS
- `npm run build:frontend` — PASS (existing `web-worker`/`ffjavascript` warning)
- `npm run check:umbra` — PASS with network access; devnet indexer and relayer health both 200.
- `npm run smoke:umbra` — PASS with network access; client initialized and devnet user account query returned `non_existent`; no token transfer submitted.
- `cargo test --workspace` — PASS (47 tests; existing Anchor cfg warnings)
- `anchor build --no-idl` — PASS (existing cfg/LTO/undefined-syscall warnings)

## Remaining Work (Next Task)

1. **Disbursement/withdraw asset bridge**: current ShieldLend C2H SOL custody exits native lamports; true ShieldLend-native Umbra routing requires a wSOL/SPL leg or program-level tokenized exit design.
2. **Umbra mixer/UTXO**: select a compatible prover for `@umbra-privacy/sdk@4.0.0` before claiming receiver-claimable UTXO actions.
3. **Privacy rails**: IKA, MagicBlock PER/PrivatePayments, Encrypt not wired.
4. **Production realloc design**: ShieldedPoolState should use `realloc` constraints on Deposit/FlushEpoch for production-scale capacity (current cap=8 for devnet).
5. **Trusted setup ceremony**: DEV/TEST ptau is not production-ready.

## Do Not Claim

- Production ZK proof artifacts (DEV/TEST only — `circuits/keys/dev_pot14_final.ptau`).
- ShieldLend native SOL C2H is fully Umbra-routed. The SDK-side funded wSOL rail is confirmed, but ShieldedPool payout bridge is not.
- Umbra mixer/UTXO success. Direct encrypted-balance deposit/withdraw is confirmed; receiver-claimable UTXO still needs a compatible prover.
- Any full privacy rail (IKA, MagicBlock, Encrypt) is active.
- Full on-chain privacy (Groth16 verification confirmed with DEV/TEST setup only).
