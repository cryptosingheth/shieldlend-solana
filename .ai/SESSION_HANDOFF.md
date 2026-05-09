# Session Handoff — ShieldLend Solana

## Task Objective

Merge Anchor 0.32.1 upgrade + wSOL Umbra E2E + MagicBlock Private Payments hardening into `convergence/privacy-rails-integration` — merge commit pending after conflict resolution.

---

## Combined Completed Work

### Anchor 0.32.1 Upgrade (2026-05-08)

| Item | Outcome |
|---|---|
| `Anchor.toml` | Pins `anchor_version = "0.32.1"` |
| Root `Cargo.toml` | `anchor-lang = "0.32.1"` |
| Root `package.json` | Adds `@coral-xyz/anchor = "^0.32.1"` |
| `Cargo.lock` / `package-lock.json` | Refreshed |
| `anchor --version` | PASS — `anchor-cli 0.32.1` |
| `cargo test --workspace` | PASS (47 tests) |
| `anchor build --no-idl` | PASS (SBF syscall warnings — redeploy validation item) |
| `npm run typecheck:frontend` | PASS |
| `npm run build:frontend` | PASS |

No redeploy. Program IDs preserved. MagicBlock PER macros and Encrypt Anchor CPI still not wired.

### wSOL Umbra E2E (2026-05-09)

| Item | Outcome |
|---|---|
| Phase 1 (C2H in roundtrip script) | FAILED — custom program error `0x0` |
| Phase 2 (SOL→wSOL wrap + Umbra deposit + Umbra withdraw) | CONFIRMED live on devnet |
| `scripts/devnet-wsol-umbra-roundtrip.mjs` | SKIP_C2H; `c2hStatus`; `extractErrorCode()`; FAILED classification; conditional claim boundary |
| `docs/UMBRA_WSOL_PAYOUT.md` | New: design doc, SKIP_C2H docs, live smoke result |

### MagicBlock Private Payments Hardening (2026-05-09)

| Step | Result |
|---|---|
| Public API endpoint | `https://payments.magicblock.app` — live |
| Health / challenge / login / mint-check / balance / builders | 200 confirmed |
| wSOL deposit (signed + submitted) | CONFIRMED on devnet |
| wSOL withdraw (signed + submitted) | CONFIRMED on devnet |
| Private-transfer `sendTo=ephemeral` | Builder 200; router `Blockhash not found`; TEE rejects writable accounts; base devnet fallback only |
| `GET /v1/mcp` | 404 |

Devnet signatures:

| Step | Signature |
|---|---|
| wSOL wrap | `2q5FC6r6HpR2FmKt9nfB1ZjHEYEgAszzBCe73NVxiCeyoYDhd3dePdHVLuJetsWmbWYW2svstPNUpjEf9ZwPPhuP` |
| MagicBlock deposit | `UtqpXCERPPZoP1HNPXzj1Frmh7MtqXGiE66GMnpZvvrziNQL1YrWVzFfShYB4EU4HAnofmdeJXNhjb1C96XPFct` |
| MagicBlock withdraw | `4FXm5NYmEf9gTXdGWGUiHB7BzEEXTaAB1WW6GhDS6QN4XKmEtH9Cw9hkRBAsqxHST2M9En39MTwfbLqNV5c9WRpP` |
| Private-transfer base-RPC fallback | `2BA9bAEk78cxfDHDqDDHaGs6CsbYdSXn17hGEV7DHitWm873CNSecigThUvqwJEa9oX6q8btGKfPAmrC2MnvtV1s` |

---

## Confirmed Integration State

### C2H / Groth16

- Full devnet round-trip via `devnet-fullround.mjs`: deposit → flush_epoch → store_withdraw_proof → withdraw.
- On-chain Groth16 BN254: PASSED — 198,502 CU; nullifier consumed; CPI succeeded.
- Trusted setup: DEV/TEST pot14 only — NOT production.
- Roundtrip script Phase 1: FAILED with `0x0` (nullifier/root likely consumed from earlier run).

### Umbra Rail

- `@umbra-privacy/sdk@4.0.0`. Devnet program: `DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ`.
- Funded devnet wSOL deposit/withdraw: 7 confirmed tx signatures.
- wSOL Umbra settlement adapter (Phase 2): CONFIRMED live.
- ShieldLend C2H payout: still native SOL direct `stealth_address`; flush_exits fail-closed.
- `SKIP_C2H=1` mode available for Umbra-only demo runs.

### Encrypt Rail

- gRPC `encrypt.v1.EncryptService/CreateInput` live on pre-alpha devnet.
- Endpoint: `pre-alpha-dev-1.encrypt.ika-network.net:443`.
- Ciphertext handle: `5VZ8BhpSWqDCAXMMb4ESVGsQRKb6X9dDgD1xGLydCA6y`.
- Anchor 0.32.1 present; `encrypt-anchor` CPI not yet wired; fail-closed.

### MagicBlock Rail

- `@magicblock-labs/ephemeral-rollups-sdk@0.8.8`.
- TEE RPC HTTP 200; Router RPC HTTP 200.
- PER sidecar: 17/17 smoke pass; 13/13 SDK functions verified.
- Anchor 0.32.1 present; Rust PER macros not yet wired.
- Private Payments public API: wSOL deposit/withdraw CONFIRMED; private-transfer ephemeral path BLOCKED.
- TDX attestation: challenge mismatch SDK 0.8.8 vs devnet TEE.

### IKA Rail

- `@ika.xyz/sdk@0.4.0` + WASM loaded.
- SDK/capability probe confirmed; WASM `createClassGroupsKeypair(ED25519)` runs locally.
- Official IKA Solana pre-alpha source confirms `ika-dwallet-anchor`, program ID `87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY`, CPI authority seed `b"__ika_cpi_authority"`, and `approve_message(...)`.
- Compile-level Anchor CPI wiring is present in `lending_pool::approve_ika_borrow_message` through a local source-equivalent `crates/ika-dwallet-anchor` crate adapted for Anchor 0.32.1.
- No live devnet IKA approval tx submitted. Missing external state: coordinator PDA, dWallet account controlled by the LendingPool CPI authority PDA, writable MessageApproval PDA, and active loan with `future_sign_authorized=true`.
- Direct wallet fallback: labelled "reduced privacy".

---

## Deployed Programs (Devnet)

| Program | Program ID |
|---|---|
| `nullifier_registry` | `E42nSmqvSCuC1EWbmzYqsdLHimBMeuZyir5dB5gE24rF` |
| `shielded_pool` | `9Bvt3jMawHFRRxpaQTtV5VvFdpZkmAZtvwjTrAX9TAtE` |
| `lending_pool` | `HLtWrvLyc2SE3ERWHaEdY4RG84GxFfHv3Qf4NzJPxaF7` |

No redeploy performed.

## Active Wallet

`HDyzXccSkhSymx6ezTHAhF32dFhJMMYPLZhPDnXiTY6V` — Solana devnet

---

## Do Not Claim

- Production ZK trusted setup (DEV/TEST pot14 only).
- Production privacy.
- IKA relay signing active (compile-wired only; no real devnet `approve_message` tx).
- MagicBlock PER Rust macros wired in Anchor programs.
- MagicBlock Private Payments private transfer via intended ephemeral/router path.
- MagicBlock TDX attestation verified.
- Native protocol-level Umbra payout (flush_exits fail-closed; wSOL adapter is post-withdraw simulation).
- Encrypt on-chain FHE active.
- Upgraded Anchor 0.32.1 binaries live on devnet (no redeploy).
- C2H confirmed by roundtrip script (Phase 1 FAILED with `0x0`).

---

## Next Actions

1. Push `convergence/privacy-rails-integration`.
2. Create PR against `main`.
3. Fill C2H devnet tx signatures into `docs/SUBMISSION_CHECKLIST.md`.
4. Record Scene 3b: `SKIP_C2H=1 node scripts/devnet-wsol-umbra-roundtrip.mjs`.
5. Investigate `anchor build --no-idl` SBF syscall warnings before redeploy.
6. MagicBlock: confirm correct ephemeral submit RPC/API blockhash behavior.

Safe to `/clear` after this handoff.
