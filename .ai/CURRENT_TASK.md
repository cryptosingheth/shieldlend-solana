# Current Task

## Status: Anchor 0.32.1 upgrade + wSOL Umbra E2E reconciliation COMPLETE — merging to `convergence/privacy-rails-integration`.

## Completed Work

### Anchor 0.32.1 Workspace Upgrade (2026-05-08, branch: upgrade/anchor-032-privacy-rails)

- `Anchor.toml` pins `anchor_version = "0.32.1"`.
- Root `Cargo.toml` uses `anchor-lang = "0.32.1"`.
- Root `package.json` adds `@coral-xyz/anchor = "^0.32.1"`.
- `Cargo.lock` and `package-lock.json` refreshed.
- `docs/ANCHOR_032_UPGRADE.md` records outcome, warnings, and validations.
- `docs/IMPLEMENTATION_STATUS.md`, demo docs, README, and status scripts updated to reflect Anchor 0.32.1 compatibility present (macros/CPI still not wired).
- Validations: `anchor --version` 0.32.1; `cargo test --workspace` 47 tests; `anchor build --no-idl` PASS; typecheck PASS; build PASS.
- No redeploy performed; program IDs preserved.

### wSOL Umbra Payout Path (2026-05-08, branch: live/wsol-umbra-e2e)

- `scripts/devnet-wsol-umbra-roundtrip.mjs` — two-step adapter with `SKIP_C2H` flag, `c2hStatus` field on all returns, `extractErrorCode()`, `FAILED` classification for Phase 1, conditional claim boundary.
- `frontend/src/lib/privacyRails/umbra.ts` — `wsol_umbra_adapter` mode, `WsolUmbraPayoutPath`, `getWsolUmbraPayoutPath()`.
- `frontend/src/app/page.tsx` — Withdraw screen: `wSOL via Umbra` mode + `WsolUmbraAdapterPanel`.
- `package.json` — `smoke:wsol-umbra-roundtrip` script.
- `docs/UMBRA_WSOL_PAYOUT.md` — new design doc with claim boundary table and SKIP_C2H docs.
- Validations: typecheck PASS; build PASS; cargo test PASS.

### Live Smoke Result (wSOL Umbra roundtrip script)

| Step | Result |
|---|---|
| Phase 1 — C2H store_withdraw_proof / withdraw | **FAILED** (custom program error `0x0`) |
| Phase 2 — SOL → wSOL wrap | **CONFIRMED** |
| Phase 2 — Umbra wSOL deposit | **CONFIRMED** |
| Phase 2 — Umbra wSOL withdraw | **CONFIRMED** |

C2H is confirmed only via the earlier `devnet-fullround.mjs` run. Roundtrip script Phase 1 FAILED — do not claim C2H from this script.

---

## Hard Constraints

- Do not claim production ZK trusted setup.
- Do not claim IKA relay signing active.
- Do not claim MagicBlock Private Payments live.
- Do not claim MagicBlock PER macros wired in Anchor programs.
- Do not claim native protocol-level Umbra payout (wSOL adapter is post-withdraw simulation).
- Do not claim flush_exits transfers SOL (PER adapter fail-closed).
- Do not claim Encrypt on-chain FHE active.
- Do not fake any blocker as resolved.
- Do not claim the upgraded 0.32.1 binaries are deployed; no redeploy was performed.
- Do NOT claim C2H confirmed by roundtrip script — Phase 1 FAILED with `0x0`; C2H confirmed only via `devnet-fullround.mjs`.

---

## Pending (requires user action)

1. Push `convergence/privacy-rails-integration` after merge commit.
2. Create PR against `main`.
3. Fill C2H devnet tx signatures into `docs/SUBMISSION_CHECKLIST.md`.
4. Record Scene 3b using `SKIP_C2H=1 node scripts/devnet-wsol-umbra-roundtrip.mjs`.
5. Before redeploying upgraded binaries: investigate `anchor build --no-idl` SBF post-processing syscall warnings.
6. Obtain `NEXT_PUBLIC_MAGICBLOCK_PRIVATE_PAYMENTS_URL` from MagicBlock Discord.
