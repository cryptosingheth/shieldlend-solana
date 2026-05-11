# Encrypt Live Hardening

## Encrypt Option B — local Anchor 0.32 compatibility fork

ShieldLend uses **Option B** for the Encrypt Anchor integration:

| Path | Status |
|---|---|
| **Option A** — official upstream `encrypt-anchor` CPI | **BLOCKED** — `solana_account_info` 3.1.x vs 2.3.x type-family mismatch |
| **Option B** — `vendor/encrypt-anchor-anchor032` local fork | **COMPILE-WIRED** — builds against Anchor 0.32.1; `lending_pool` exposes `request_liquidation_reveal_via_encrypt` + `verify_liquidation_reveal_via_encrypt` |
| **gRPC CreateInput** — `encrypt.v1.EncryptService/CreateInput` | **LIVE** — real ciphertext handles returned from pre-alpha devnet |

Option B does **not** make on-chain FHE live. It preserves the compile-wired CPI path so ShieldLend is ready to activate the on-chain path when the upstream resolves the `solana_account_info` crate-family split.

## Current boundary

Encrypt remains a pre-alpha client/gRPC integration in this branch. The live path can discover active Encrypt devnet network keys and submit non-sensitive modeled ShieldLend health inputs through `encrypt.v1.EncryptService/CreateInput`.

The workspace is now on Anchor `0.32.1`, and ShieldLend can compile a minimal on-chain Encrypt request/reveal path only by vendoring a local Anchor 0.32 compatibility fork of `encrypt-anchor`. The official upstream `encrypt-anchor` CPI path is still blocked: a fresh CPI-boundary probe against current `dwallet-labs/encrypt-pre-alpha` fetched and compiled the crate, then failed when Anchor `0.32.1` `AccountInfo` values were passed into `EncryptContext`.

This does not mean production FHE is live. The official Encrypt docs still carry a pre-alpha disclaimer: data may be public/plaintext, key material and trust assumptions are not final, APIs may change, and devnet state may be wiped. Do not submit sensitive or real user data.

## Official docs and package check

- Official docs page checked: `https://docs.encrypt.xyz/frameworks/anchor.html`.
- Docs dependency snippet for Anchor programs lists `encrypt-anchor` plus `anchor-lang = "0.32"`.
- Current public source repo checked: `https://github.com/dwallet-labs/encrypt-pre-alpha`.
- Current upstream examples use `encrypt_anchor::EncryptContext`, and the upstream workspace now resolves `encrypt-anchor` against newer Solana account crates than Anchor `0.32.1`.
- Installed JS package checked locally: `@encrypt.xyz/pre-alpha-solana-client@0.1.0`.
- The package `./grpc` export points at `./src/grpc.ts`, so plain Node still cannot import it directly from this repo's smoke scripts. The scripts use the documented gRPC service path directly through `@grpc/grpc-js`.

## Anchor CPI feasibility result

ShieldLend now vendors `vendor/encrypt-anchor-anchor032`, a minimal copy of the official `chains/solana/program-sdk/anchor` crate rebased onto `anchor-lang = "0.32.1"`. `programs/lending_pool` uses that local fork to compile a separate Encrypt CPI request/reveal path:

- `request_liquidation_reveal_via_encrypt`
- `verify_liquidation_reveal_via_encrypt`

The legacy generic reveal verifier remains fail-closed at `EncryptVerifierNotWired`, and no on-chain FHE claim is unlocked by this compile-only wiring.

The reproducible probe is:

```bash
npm run check:encrypt-anchor
npm run check:encrypt-anchor -- --live
```

`--live` first runs the live gRPC CreateInput probe, then checks two Rust CPI boundaries in temporary Cargo projects:

1. official upstream `encrypt-anchor` from `dwallet-labs/encrypt-pre-alpha`
2. ShieldLend's local Anchor 0.32 compatibility fork

Exact blocker:

```text
expected `solana_account_info::AccountInfo<'_>`, found `__AccountInfo<'_>`
note: there are multiple different versions of crate `solana_account_info` in the dependency graph
```

Current observed versions at the boundary:

- `encrypt-anchor` side: `solana-account-info 3.1.1`
- ShieldLend Anchor `0.32.1` side: `solana-account-info 2.3.0`

This means the official upstream program cannot construct `EncryptContext` from ShieldLend Anchor accounts without a compatible Encrypt revision or fork. The blocker is a real type-family mismatch, not an application-code import typo.

Current local compatibility result:

- Local fork compiles against Anchor `0.32.1`
- `lending_pool` now builds with the forked crate
- the new CPI-based request/reveal path verifies request ciphertext and digest before reading `Bool`
- no live devnet Encrypt ciphertext/decryption account round-trip has been proven

## Live smoke script

Run:

```bash
npm run check:encrypt -- --live
node scripts/encrypt-health-smoke.mjs --live
npm run check:encrypt-anchor -- --live
```

The new smoke script submits three modeled non-sensitive inputs:

- `collateral_value_lamports`
- `debt_value_lamports`
- `liquidation_threshold_bps`

Each input is bound to a test loan PDA and authorized to the ShieldLend lending program id. This is still only a pre-alpha client/gRPC CreateInput smoke. It is not an on-chain ShieldLend Encrypt verification flow.

Latest live-hardening IDs (2026-05-10 — `live/encrypt-anchor`):

Active devnet network keys:
- disc=2 (real key): `6L4bQjT2ao774nQQ6BkXqnKJMye4nmPW1SMeRRxfm2Yn` — `f00f3465b66ff8034600706ed05bf70ef5318edc511398085a3ab4512b875197`
- disc=7 (sentinel): `2YP2nxFoYcDFDBRygrN7C3Y3ENdcoaLjVeAmbX8HHwur` — `5555555555555555555555555555555555555555555555555555555555555555`

`check-encrypt.mjs --live` (health_ratio_bps=15000):
- ciphertext: `TEKonURJhM41WBgKhgJYfyHzmnpnQ3tdgJBSnS62zRi`
- hex: `06b82ab470f0397306d8a24e4141bfd69204f05979293cc90cfbae077d159a75`

`encrypt-health-smoke.mjs --live` (collateral=2e9, debt=1e9, threshold_bps=12500):
- `collateral_value_lamports`: `AfVVxyXvMcd5Gia36rRjFUbhwdx7GsDMty6XTuDGQ2Hw`
- `debt_value_lamports`: `GarhsLbtNa5EKB4GvUac7fZvAidTW3MaSyxFjK5a7q6F`
- `liquidation_threshold_bps`: `2wF4v3ZhXCN1vbisMGsngiDTPUUfSJuQiixNstC97MtD`

Previous IDs (2026-05-09):
- `health_ratio_bps`: `DX9ipt7WY1tCXFSv14oWwmZ3a19Ls9aUnSTPfiUUQwEZ`
- `collateral_value_lamports`: `7U88Hf8T4u1NxdH6yZjFbkQLzfzZi2eT8hLJSW6nYH9L`
- `debt_value_lamports`: `DM6GWnbeyGoWxcYFXRukAt3yciZCcjpbmWUC8d5aJxJV`
- `liquidation_threshold_bps`: `9RUszRssYbJn3BpWbSS2b2864HFcS2TpjfsaTdg9Ccd2`

## Anchor 0.32 program-side migration path

The root workspace now uses Anchor 0.32.1, and ShieldLend has a local compile-wired CPI path. Keep any claim of real on-chain Encrypt/FHE separate from that compile step.

1. Keep using Anchor CLI 0.32.1 unless a specific Encrypt revision requires otherwise.
2. Keep `scripts/encrypt-anchor-smoke.mjs` proving both sides: upstream blocker and local fork compile success.
3. Confirm `cargo tree -i solana-account-info` and `cargo tree -i anchor-lang` do not show incompatible duplicate versions across the ShieldLend Anchor and local Encrypt CPI boundary.
4. Build/test the CPI path first with `cargo test`, then with the matching Anchor CLI/SBF toolchain.
5. Only after a real Encrypt devnet ciphertext + decryption-request account round-trip succeeds should `verify_liquidation_reveal_via_encrypt` be treated as more than compile wiring.
6. Rerun the C2H devnet Groth16 withdraw round-trip before merging any further program-side migration.

Until step 5 passes, on-chain Encrypt/FHE must remain not live in docs, frontend, and demo status.
