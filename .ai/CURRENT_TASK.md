# Current Task

## Status: Umbra funded devnet wSOL encrypted-balance smoke complete on `rail/umbra`; C2H full devnet withdraw round-trip preserved.

## Active Objective

Umbra Live-Hardening task — COMPLETE for SDK-side funded devnet wSOL encrypted-balance deposit/withdraw. ShieldLend-native C2H payout is still native SOL and still needs a wSOL/SPL settlement bridge before claiming Umbra-routed withdrawals.

Previous C2H remains intact:

- `deposit` confirmed: sig `3dsEYbRR...` (commitment at leaf 0)
- `flush_epoch` confirmed: sig `2GXQhThH...` (smoke root inserted)
- `nullifier_registry::update_authorized_programs` fixed: sig `5nqg3EDx...`
- `store_withdraw_proof` confirmed: sig `5vd2RnQJ...`
- `withdraw` confirmed: sig `3s7zqUmu...` — **on-chain Groth16 BN254 verification PASSED (198,502 CU)**

Umbra rail work completed:
- Installed official `@umbra-privacy/sdk@4.0.0`.
- Added `frontend/src/lib/privacyRails/umbra.ts` with SDK-backed client/register/deposit/withdraw/receiver-UTXO functions and fail-closed route planning.
- Added `scripts/check-umbra.mjs`, `scripts/umbra-smoke.mjs`, `scripts/umbra-funded-smoke.mjs`, and `scripts/umbra-wsol-smoke.mjs`.
- Wired Withdraw UI destination mode: direct `stealth_address` fallback vs Umbra SDK route.
- Updated `.env.example`, README, `docs/HACKATHON.md`, and `docs/PRIVACY_AND_THREAT_MODEL.md`.
- Funded devnet wSOL flow confirmed:
  - Mint: `So11111111111111111111111111111111111111112`
  - wSOL wrap + SyncNative: `cyQG7Bw7Skuu2QCMu8Gvmx5JSfbcSwGGD3utoRq7jm3iAkxKHCgKjXeGxjBBGL3ZWYYe1JTqykdAQFj5thw85As`
  - Umbra deposit queue/callback: `SZeGJ9FMkhiAnz2hq9oeWSgX1pccrE5rCqgZWjUMd4pu7ZzaHrNM9K6aaMxqqNfZ1cYHWSvwYYAp5gJwhtTovyx` / `2nPcvgkfXhYWuAAxHfhjH8WCi4afguYbhqu3uYdpYgEH1As5jB8R2evfiUWXmFekz1CXfhB1HwHosiQKYGjCxMVL`
  - Umbra withdraw queue/callback: `yVdTJQi8DxnRyB1BBW2zkTenm7WhxXAqztXqoAsqUQdnEdKhqUBQrWACbMeLkdEGkCuGbPGKVYfGAVzRLLeHg5u` / `31UinqaCswx1kNJGpZbGoFgr6AH8nrBfLMEhgm1z3FNgJdAtbjDsPxvbv3iC7r6i7DpR5t3YvUyMcpHUeD4HnVau`

## Current Local Truth

1. Solana CLI and Anchor CLI 0.30.1 are available.
2. `Anchor.toml`, all three program `declare_id!` values, frontend `PROGRAM_IDS`, and
   ShieldedPool's internal `LENDING_POOL_PROGRAM_ID` match `anchor keys list`.
3. `anchor build --no-idl` passes — SBF artifacts generated. Zero stack-frame error diagnostics.
4. Full Anchor IDL generation remains blocked by Anchor/proc-macro2 compatibility.
5. All three circuits compile; DEV/TEST browser WASM, zkey, and vkey artifacts are generated.
6. `groth16-solana = "0.0.3"` in both program Cargo.toml files.
7. DEV/TEST verifier **wired** to all three instruction handlers via proof account PDA.
8. B7 stack-frame mitigation (C2G-A) applied — all four contexts boxed.
9. `frontend/src/lib/solanaClient.ts` — all proof-store instruction builders added.
10. 47 Rust unit tests pass.
11. IKA, MagicBlock PER, MagicBlock Private Payments, Encrypt/FHE not wired.
12. All three programs deployed to devnet.
13. `shielded_pool::initialize` confirmed.
14. `nullifier_registry::authorized_programs` fixed to contain registry_writer PDA addresses (not program IDs).
15. Full round-trip (deposit → flush_epoch → store_proof → withdraw) confirmed on devnet.
16. On-chain Groth16 BN254 verification confirmed: 198,502 CU consumed, pairing passed.
17. `scripts/devnet-fullround.mjs` — full round-trip smoke script (idempotent, auto-fixes auth).
18. Umbra SDK devnet config confirmed:
    - Package: `@umbra-privacy/sdk@4.0.0`
    - Devnet program ID: `DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ`
    - Devnet indexer health: 200 `{"status":"ok"}`
    - Devnet relayer health: 200 `{"status":"ok"}`
19. Umbra smoke initialized a client and queried devnet user account state.
20. `npm run smoke:umbra-funded` submitted a funded devnet wSOL Umbra encrypted-balance deposit and withdrawal; both callbacks finalized.
21. Current ShieldLend C2H withdrawal is still native SOL direct `stealth_address`; Umbra supports SPL/Token-2022 balances, so true ShieldLend payout routing needs wSOL/SPL exit wiring.

## Deployed Programs (Devnet) — All Verified

| Program | Program ID | Status |
|---|---|---|
| `nullifier_registry` | `E42nSmqvSCuC1EWbmzYqsdLHimBMeuZyir5dB5gE24rF` | Deployed |
| `shielded_pool` | `9Bvt3jMawHFRRxpaQTtV5VvFdpZkmAZtvwjTrAX9TAtE` | Deployed + upgraded (Vec cap fix) |
| `lending_pool` | `HLtWrvLyc2SE3ERWHaEdY4RG84GxFfHv3Qf4NzJPxaF7` | Deployed |

## Registry Writer PDAs (Devnet)

| Program | PDA | Seeds |
|---|---|---|
| shielded_pool | `E4kXXwght9DYxDnAwcmtbcJ5cV2Azjn98eNJJa2q5Szf` | `[b"registry-writer"]` |
| lending_pool | `CHCEx9fzSVQVxC9kAQ6K4tRgajjbcwNA2tg1LtbjqoCk` | `[b"registry-writer"]` |

## Active Wallet

- Wallet: `HDyzXccSkhSymx6ezTHAhF32dFhJMMYPLZhPDnXiTY6V`
- Balance: 3.554668080 SOL on devnet (after C2H)
- Cluster: devnet configured

## Known Blockers

None blocking C2H. Umbra rail blockers for ShieldLend-native payout:
- Full Groth16 round-trip on devnet: CONFIRMED
- UnauthorizedWriter (registry_writer PDA vs program ID): RESOLVED
- Native SOL is not a direct Umbra SDK balance type; use wSOL or another supported SPL/Token-2022 mint.
- `@umbra-privacy/web-zk-prover@2.0.1` peers `@umbra-privacy/sdk@2.0.3`, so this branch did not force-install it beside SDK 4.0.0.
- Funded SDK-side wSOL deposit/withdraw is live, but ShieldedPool C2H has not been bridged into that wSOL/SPL rail.

## Immediate Next Actions

1. **ShieldLend payout bridge** — wire a program/API settlement leg that converts native SOL C2H exits into wSOL/SPL before calling Umbra SDK functions.
2. **Privacy rails** — wire IKA, MagicBlock PER/PrivatePayments, Encrypt.
3. **Production realloc design** — ShieldedPoolState should use realloc constraints for production-scale capacity.
4. **Trusted setup ceremony** — DEV/TEST ptau is not production-ready.

## Relevant Files

| File | Role |
|---|---|
| `programs/shielded_pool/src/lib.rs` | `ProofData`, `StoreWithdrawProof`, `Withdraw` (Box<Account>) |
| `programs/nullifier_registry/src/lib.rs` | `RegistryConfig`, `assert_authorized` (checks writer PDA, not program ID) |
| `programs/shielded_pool/src/groth16_verifier.rs` | Withdraw verifier, DEV/TEST vkey |
| `programs/lending_pool/src/groth16_verifier.rs` | Collateral + repay verifier |
| `frontend/src/lib/solanaClient.ts` | All proof-store builders, PDA helpers |
| `scripts/devnet-fullround.mjs` | Full round-trip smoke script (idempotent) |
| `audit-reports/ONCHAIN_VERIFIER_BLOCKERS.md` | All blockers resolved (C2C–C2H) |
| `audit-reports/GROTH16_SOLANA_INTEGRATION_PLAN.md` | Full C2D–C2H integration plan |

## Hard Constraints

- Do not push without explicit instruction
- Do not run full `anchor build` with IDL unless explicitly scoped
- Do not deploy without explicit instruction
- Do not claim production trusted setup from the DEV/TEST `.ptau`
- Do not claim on-chain privacy until deployed and integration-tested with production artifacts
