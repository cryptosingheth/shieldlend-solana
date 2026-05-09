# Current Task

## Status: Encrypt Anchor compatibility boundary on `live/encrypt-anchor` — gRPC live, upstream Anchor CPI blocked, local Anchor 0.32 fork compile-wired.

### Encrypt Anchor Feasibility (2026-05-09)

- Current branch: `live/encrypt-anchor` from `origin/convergence/privacy-rails-integration`.
- Official docs/source rechecked:
  - `https://docs.encrypt.xyz/frameworks/anchor.html`
  - `https://github.com/dwallet-labs/encrypt-pre-alpha`
  - `chains/solana/examples/voting/anchor`
  - `chains/solana/program-sdk/anchor`
- Added `scripts/encrypt-anchor-smoke.mjs` and `npm run check:encrypt-anchor`.
- Probe result: official `encrypt-anchor` fetched/compiled, but the CPI-boundary probe fails when constructing `EncryptContext` from Anchor 0.32.1 `AccountInfo`.
- Exact blocker: current `encrypt-anchor` expects `solana_account_info` 3.1.x, while Anchor 0.32.1 supplies 2.3.x `AccountInfo`.
- Added `vendor/encrypt-anchor-anchor032`, a minimal local compatibility fork rebased onto `anchor-lang = "0.32.1"`.
- `programs/lending_pool` now compile-wires:
  - `request_liquidation_reveal_via_encrypt`
  - `verify_liquidation_reveal_via_encrypt`
- Legacy generic verifier remains fail-closed at `EncryptVerifierNotWired`; no on-chain FHE or on-chain decryption is live.
- Frontend/docs now distinguish:
  - gRPC CreateInput live,
  - upstream Anchor CPI probe blocked,
  - local compatibility fork compile-wired,
  - on-chain Encrypt/FHE not live.

## Previous Status: Anchor 0.32.1 upgrade + wSOL Umbra E2E + MagicBlock Private Payments hardening — all merged to `convergence/privacy-rails-integration`.

## Combined Completed Work

### Anchor 0.32.1 Workspace Upgrade (2026-05-08)

- `Anchor.toml` pins `anchor_version = "0.32.1"`.
- Root `Cargo.toml` uses `anchor-lang = "0.32.1"`.
- Root `package.json` adds `@coral-xyz/anchor = "^0.32.1"`.
- `Cargo.lock` / `package-lock.json` refreshed.
- `docs/ANCHOR_032_UPGRADE.md` records outcome, warnings, and validations.
- Status docs updated: Anchor 0.32.1 compatibility present; macros/CPI still not wired.
- Validations: `anchor-cli 0.32.1`; `cargo test` 47 tests; `anchor build --no-idl` PASS (SBF syscall warnings noted); typecheck PASS; build PASS.
- No redeploy performed; program IDs preserved.

### wSOL Umbra Payout Path (2026-05-08)

- `scripts/devnet-wsol-umbra-roundtrip.mjs` — SKIP_C2H flag; `c2hStatus` on all returns; `extractErrorCode()`; `FAILED` classification; conditional claim boundary.
- `frontend/src/lib/privacyRails/umbra.ts` — `wsol_umbra_adapter` mode + `WsolUmbraPayoutPath`.
- `frontend/src/app/page.tsx` — Withdraw: `wSOL via Umbra` mode + `WsolUmbraAdapterPanel`.
- Live smoke: Phase 1 (C2H) FAILED with `0x0`; Phase 2 (wSOL wrap + Umbra deposit/withdraw) CONFIRMED.
- `docs/UMBRA_WSOL_PAYOUT.md` — new design doc with SKIP_C2H docs and live smoke result.

### MagicBlock Private Payments Hardening (2026-05-09)

- `frontend/src/lib/privacyRails/magicblock.ts` — typed `/v1/spl` client helpers; challenge/login flow.
- `scripts/check-magicblock.mjs` — probes public Private Payments API endpoints.
- `scripts/magicblock-private-payments-live.mjs` — hardened dry-run, deposit/withdraw live, private-transfer diagnostic.
- `docs/MAGICBLOCK_PRIVATE_PAYMENTS.md` — new endpoint/runbook/live-result doc.
- `package.json` / `package-lock.json` — added `tweetnacl` for local challenge signing.

#### Live Results

| Step | Result |
|---|---|
| `GET /health` | 200 ok |
| Challenge/login | 200 (bearer token) |
| Mint initialized check (wSOL) | 200 initialized=true |
| `POST /v1/spl/deposit` | 200 unsigned tx; live submit CONFIRMED |
| `POST /v1/spl/withdraw` | 200 unsigned tx; live submit CONFIRMED |
| `POST /v1/spl/transfer` (sendTo=base) | 200 unsigned tx |
| `POST /v1/spl/transfer` (sendTo=ephemeral) | 200 unsigned tx; router/TEE submit BLOCKED |
| Base devnet fallback (refreshed blockhash) | SUBMITTED — not the intended ephemeral path |
| `GET /v1/mcp` | 404 |

#### Devnet Signatures (MagicBlock)

| Step | Signature |
|---|---|
| wSOL wrap | `2q5FC6r6HpR2FmKt9nfB1ZjHEYEgAszzBCe73NVxiCeyoYDhd3dePdHVLuJetsWmbWYW2svstPNUpjEf9ZwPPhuP` |
| MagicBlock deposit | `UtqpXCERPPZoP1HNPXzj1Frmh7MtqXGiE66GMnpZvvrziNQL1YrWVzFfShYB4EU4HAnofmdeJXNhjb1C96XPFct` |
| MagicBlock withdraw | `4FXm5NYmEf9gTXdGWGUiHB7BzEEXTaAB1WW6GhDS6QN4XKmEtH9Cw9hkRBAsqxHST2M9En39MTwfbLqNV5c9WRpP` |
| MagicBlock private-transfer base-RPC fallback | `2BA9bAEk78cxfDHDqDDHaGs6CsbYdSXn17hGEV7DHitWm873CNSecigThUvqwJEa9oX6q8btGKfPAmrC2MnvtV1s` |

---

## Hard Constraints

- Do not claim production ZK trusted setup (DEV/TEST pot14 only).
- Do not claim IKA relay signing active.
- Do not claim MagicBlock PER Rust macros wired in Anchor programs.
- Do not claim MagicBlock Private Payments private transfer via intended ephemeral/router path confirmed.
- Do not claim native protocol-level Umbra payout (wSOL adapter is post-withdraw simulation; flush_exits fail-closed).
- Do not claim Encrypt on-chain FHE active (Anchor 0.32.1 present; current official CPI blocked by AccountInfo crate-family mismatch).
- Do not claim upgraded Anchor 0.32.1 binaries are deployed (no redeploy).
- Do NOT claim C2H confirmed by roundtrip script (Phase 1 FAILED with `0x0`; C2H confirmed only via `devnet-fullround.mjs`).
- Do not claim production privacy.

---

## Pending (requires user action)

1. Push `convergence/privacy-rails-integration` to remote.
2. Create PR against `main`.
3. Fill C2H devnet tx signatures into `docs/SUBMISSION_CHECKLIST.md`.
4. Record Scene 3b: `SKIP_C2H=1 node scripts/devnet-wsol-umbra-roundtrip.mjs`.
5. Before redeploying: investigate `anchor build --no-idl` SBF syscall warnings.
6. MagicBlock: confirm correct ephemeral submit RPC or API blockhash behavior.
