# Encrypt Live Hardening

## Current boundary

Encrypt remains a pre-alpha client/gRPC integration in this branch. The live path can discover active Encrypt devnet network keys and submit non-sensitive modeled ShieldLend health inputs through `encrypt.v1.EncryptService/CreateInput`.

This does not mean production FHE is live. The official Encrypt docs still carry a pre-alpha disclaimer: data may be public/plaintext, key material and trust assumptions are not final, APIs may change, and devnet state may be wiped. Do not submit sensitive or real user data.

## Official docs and package check

- Official docs page checked: `https://docs.encrypt.xyz/getting-started/installation`.
- Docs dependency snippet for Anchor programs lists `encrypt-anchor` plus `anchor-lang = "0.32"`.
- Current public source repo checked: `https://github.com/dwallet-labs/encrypt-pre-alpha`.
- Current upstream examples use `encrypt_anchor::EncryptContext`, and the upstream workspace now resolves `encrypt-anchor` against Anchor `1`.
- Installed JS package checked locally: `@encrypt.xyz/pre-alpha-solana-client@0.1.0`.
- The package `./grpc` export points at `./src/grpc.ts`, so plain Node still cannot import it directly from this repo's smoke scripts. The scripts use the documented gRPC service path directly through `@grpc/grpc-js`.

## Sidecar feasibility result

No Anchor 0.32 sidecar was added.

The isolated feasibility test was:

```bash
cd /private/tmp/encrypt-anchor-feasibility
cargo check
```

Graph-only code compiled, but the actual program-side `EncryptContext` path failed when an Anchor 0.32 sidecar attempted to call `encrypt_ctx.health_breach_graph(...)`.

Exact blocker:

```text
expected `solana_account_info::AccountInfo<'_>`, found `__AccountInfo<'_>`
note: there are multiple different versions of crate `solana_account_info` in the dependency graph
```

The same compile also showed two `anchor_lang::Error` types in the graph, so `?` could not convert errors across the Anchor versions. This happens because the sidecar pulls Anchor 0.32, while current upstream `encrypt-anchor` pulls Anchor 1 / Solana account crates in the 3.x line.

## Live smoke script

Run:

```bash
npm run check:encrypt -- --live
node scripts/encrypt-health-smoke.mjs --live
```

The new smoke script submits three modeled non-sensitive inputs:

- `collateral_value_lamports`
- `debt_value_lamports`
- `liquidation_threshold_bps`

Each input is bound to a test loan PDA and authorized to the ShieldLend lending program id. This is still only a pre-alpha client/gRPC CreateInput smoke. It is not an on-chain ShieldLend Encrypt verification flow.

Latest live-hardening IDs:

- `health_ratio_bps`: `5VZ8BhpSWqDCAXMMb4ESVGsQRKb6X9dDgD1xGLydCA6y`
- `collateral_value_lamports`: `8CtojVRaXkWnCB6pN6wq5jxEvkdmAe5BhfTsm5pBLZsc`
- `debt_value_lamports`: `25EK8vDYPXB6kaT6EZEmz6gwjpu1SNKt57zn1cnYR1xw`
- `liquidation_threshold_bps`: `2iA8vWgBaA8cKo6eGsQQMdZUgHyNNB3spSc93Sj6Fhos`

## Anchor 0.32 program-side migration path

The root workspace now uses Anchor 0.32.1, but Encrypt Anchor CPI is still not wired. Keep the remaining program-side migration separate from this client/gRPC hardening path.

1. Keep using Anchor CLI 0.32.1 unless a specific Encrypt revision requires otherwise.
2. Pin an `encrypt-pre-alpha` revision whose `encrypt-anchor` crate resolves to the same Anchor/Solana account crate family, or vendor/fork `encrypt-anchor` and align its workspace `anchor-lang` and Solana account crates.
3. Confirm `cargo tree -i solana-account-info` and `cargo tree -i anchor-lang` do not show incompatible duplicate versions across the ShieldLend Anchor and Encrypt CPI boundary.
4. Build/test the CPI path first with `cargo test`, then with the matching Anchor CLI/SBF toolchain.
5. Only after CPI compiles, consider wiring `lending_pool::verify_encrypt_reveal`.
6. Rerun the C2H devnet Groth16 withdraw round-trip before merging any program-side migration.

Until those steps pass, `lending_pool` must keep returning `EncryptVerifierNotWired`.
