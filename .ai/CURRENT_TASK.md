# Current Task

## Status: rail/magicblock complete — MagicBlock PER TypeScript adapter integrated.

## Active Objective

Implement MagicBlock as a real privacy rail (branch: rail/magicblock).

## What Was Done

1. Installed `@magicblock-labs/ephemeral-rollups-sdk@0.8.8` in frontend workspace.
2. Created `frontend/src/lib/privacyRails/magicblock.ts`:
   - TEE connectivity check (`verifyTeeRpc`)
   - Auth token acquisition (`acquireAuthToken`)
   - Permission instruction builders: create, delegate, commit/undelegate
   - Permission PDA deriver (`derivePermissionPda`)
   - Live status check (`getMagicBlockLiveStatus`)
   - Private Payments API: deposit, transfer, withdraw, balance, settleRepayment
3. Created `scripts/check-magicblock.mjs` — live CLI check:
   - TEE RPC reachable: HTTP 200 (`devnet-tee.magicblock.app`)
   - Router RPC reachable: HTTP 200 (`devnet-router.magicblock.app`)
   - Program IDs verified: Permission + Delegation match SDK 0.8.8
   - 13/13 SDK functions verified
   - TDX attestation: `challenge must decode to 64 bytes` (minor API delta)
4. Updated `frontend/src/lib/protocolAdapters.ts` with per-rail comment noting TEE reachability.
5. Updated `.env.example` (root and frontend) with all MagicBlock env vars.
6. Updated `docs/HACKATHON.md` and `docs/IMPLEMENTATION_STATUS.md`.

## Live Check Output (2026-05-08)

- TEE RPC: HTTP 200 — `{"jsonrpc":"2.0","result":"ok","id":1}`
- Router RPC: HTTP 200 — `Method not found` (expected)
- SDK functions: 13/13 present
- TDX attestation: Exception: `challenge must decode to 64 bytes` (challenge format delta)
- Private Payments URL: not set (requires Discord access)

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
