# Current Task

## Status: rail/magicblock complete — MagicBlock PER sidecar + live smoke test added.

## Active Objective

Implement MagicBlock as a real privacy rail (branch: rail/magicblock).

## What Was Done

### Session 1 (prior)
1. Installed `@magicblock-labs/ephemeral-rollups-sdk@0.8.8` in frontend workspace.
2. Created `frontend/src/lib/privacyRails/magicblock.ts` — full TypeScript PER/Private Payments adapter.
3. Created `scripts/check-magicblock.mjs` — SDK export + connectivity check.

### Session 2 (2026-05-08) — PER Sidecar
4. Created `examples/magicblock-per-sidecar/` — isolated TypeScript sidecar:
   - `src/accounts.ts` — 4 ShieldLend intent account types + PDA derivation + PerPdaBundle
   - `src/lifecycle.ts` — Permission/Delegation/Commit lifecycle instruction builders
   - `src/shieldlend.ts` — 4 ShieldLend use-case bundles (deposit intent, proof intent, withdrawal intent, batched counter)
   - `src/index.ts` — demo entry point; builds all use-case bundles, checks connectivity
5. Created `scripts/magicblock-per-smoke.mjs` — 12-section live smoke test:
   - Program ID verification, PDA derivation (4 use cases), instruction building
   - ConnectionMagicRouter instantiation + getDelegationStatus (live devnet)
   - getPermissionStatus via TEE RPC (live devnet)
   - TDX attestation (warn on challenge mismatch — known SDK 0.8.8 delta)
   - Smoke result: 17 pass, 3 warn (expected), 0 fail
6. Added `npm run check:magicblock`, `npm run smoke:magicblock`, `npm run typecheck:sidecar` to root package.json.

## Live Smoke Output (2026-05-08)

- TEE RPC: HTTP 200 — `{"result":"ok"}`
- Router RPC: HTTP 200 — `{"error":{"code":-32601,"message":"Method not found"}}` (expected)
- ConnectionMagicRouter.getDelegationStatus: `isDelegated=false` (correct — account not on devnet)
- getPermissionStatus: `{authorizedUsers:null}` (correct — permission account not created)
- TDX attestation: `challenge must decode to 64 bytes` (warn — known SDK 0.8.8 delta)
- All 4 use-case instruction sets built successfully

## Current Blockers

| Blocker | Root cause |
|---|---|
| TDX attestation | Challenge-encoding mismatch SDK 0.8.8 vs devnet TEE |
| Rust PER macros | Anchor 0.32.1 required; workspace uses 0.30.1 |
| Private Payments URL | Requires Discord access (`discord.com/invite/MBkdC3gxcv`) |
| MagicBlock VRF | No VRF module in SDK 0.8.x; separate integration task |

## Validations Passed

- `npm run typecheck:frontend` — PASS
- `npm run build:frontend` — PASS
- `cargo test --workspace` — PASS (47 tests: 27 + 6 + 14)
- `anchor build --no-idl` — PASS (zero errors, warnings only)

## Deployed Programs (Devnet) — Unchanged from C2H

| Program | Program ID | Status |
|---|---|---|
| `nullifier_registry` | `E42nSmqvSCuC1EWbmzYqsdLHimBMeuZyir5dB5gE24rF` | Deployed |
| `shielded_pool` | `9Bvt3jMawHFRRxpaQTtV5VvFdpZkmAZtvwjTrAX9TAtE` | Deployed + upgraded |
| `lending_pool` | `HLtWrvLyc2SE3ERWHaEdY4RG84GxFfHv3Qf4NzJPxaF7` | Deployed |

## Active Wallet

- Wallet: `HDyzXccSkhSymx6ezTHAhF32dFhJMMYPLZhPDnXiTY6V`
- Balance: 3.554668080 SOL on devnet
- Cluster: devnet

## Immediate Next Actions

1. **Anchor 0.32.1 upgrade** (isolated task) — enables Rust PER macros
2. **VRF integration** — separate SDK or program CPI
3. **Private Payments URL** — request via MagicBlock Discord

## Hard Constraints

- Do not push without explicit instruction
- Do not deploy without explicit instruction
- Do not claim TDX attestation as verified (challenge mismatch)
- Do not claim Rust PER macros are wired (Anchor version blocked)
- Do not claim Private Payments live (URL not configured)
