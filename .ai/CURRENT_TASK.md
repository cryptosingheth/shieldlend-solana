# Current Task

## Status: IKA live-hardening complete — Solana blockers proven with source evidence. C2H preserved.

## Active Objective

Convergence Task 2H: Full devnet round-trip proof smoke test — COMPLETE.

- `deposit` confirmed: sig `3dsEYbRR...` (commitment at leaf 0)
- `flush_epoch` confirmed: sig `2GXQhThH...` (smoke root inserted)
- `nullifier_registry::update_authorized_programs` fixed: sig `5nqg3EDx...`
- `store_withdraw_proof` confirmed: sig `5vd2RnQJ...`
- `withdraw` confirmed: sig `3s7zqUmu...` — **on-chain Groth16 BN254 verification PASSED (198,502 CU)**

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
11. IKA, MagicBlock PER, MagicBlock Private Payments, Umbra, Encrypt/FHE not wired.
12. All three programs deployed to devnet.
13. `shielded_pool::initialize` confirmed.
14. `nullifier_registry::authorized_programs` fixed to contain registry_writer PDA addresses (not program IDs).
15. Full round-trip (deposit → flush_epoch → store_proof → withdraw) confirmed on devnet.
16. On-chain Groth16 BN254 verification confirmed: 198,502 CU consumed, pairing passed.
17. `scripts/devnet-fullround.mjs` — full round-trip smoke script (idempotent, auto-fixes auth).

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

None blocking further work. All C2H goals achieved:
- Full Groth16 round-trip on devnet: CONFIRMED
- UnauthorizedWriter (registry_writer PDA vs program ID): RESOLVED

## Immediate Next Actions

1. **Privacy rails** — wire IKA, MagicBlock PER/PrivatePayments, Umbra, Encrypt.
2. **Production realloc design** — ShieldedPoolState should use realloc constraints for production-scale capacity.
3. **Trusted setup ceremony** — DEV/TEST ptau is not production-ready.

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
