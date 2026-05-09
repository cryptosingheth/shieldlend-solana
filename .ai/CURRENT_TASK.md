# Current Task

## Status: Anchor 0.32.1 workspace upgrade COMPLETE on `upgrade/anchor-032-privacy-rails`.

## Completed This Session

### Anchor 0.32.1 Upgrade (2026-05-08)

- `Anchor.toml` pins `anchor_version = "0.32.1"`.
- Root `Cargo.toml` uses `anchor-lang = "0.32.1"`.
- Root `package.json` adds `@coral-xyz/anchor = "^0.32.1"` for checked-in Anchor TS tests.
- `Cargo.lock` and `package-lock.json` refreshed.
- `docs/ANCHOR_032_UPGRADE.md` records outcome, graph shape, warnings, and validations.
- `docs/IMPLEMENTATION_STATUS.md`, demo docs, README, and status scripts updated so they no longer describe a stale Anchor 0.30.1 gap.

### Validations (all pass)

- `anchor --version` — `anchor-cli 0.32.1`
- `cargo fmt --all -- --check` — PASS
- `cargo test --workspace` — PASS (47 tests)
- `anchor build --no-idl` — PASS on Anchor CLI 0.32.1
- `npm run typecheck:frontend` — PASS
- `npm run build:frontend` — PASS
- `npm run demo:status` — PASS (warns current branch is not the convergence branch)

---

## Hard Constraints (unchanged)

- Do not claim production ZK trusted setup.
- Do not claim IKA relay signing active.
- Do not claim MagicBlock Private Payments live.
- Do not claim MagicBlock PER macros in Anchor programs.
- Do not claim Umbra native SOL ShieldLend payout.
- Do not claim Encrypt on-chain FHE active.
- Do not fake any blocker as resolved.
- Do not claim the upgraded 0.32.1 binaries are deployed; no redeploy was performed in this task.

---

## Pending

1. Review and push `upgrade/anchor-032-privacy-rails`.
2. If program-side PER or Encrypt wiring begins, wire one rail at a time and re-run C2H after any program-side change.
3. Before redeploying upgraded binaries, investigate or explicitly accept the `anchor build --no-idl` SBF post-processing syscall warnings.
4. Obtain `NEXT_PUBLIC_MAGICBLOCK_PRIVATE_PAYMENTS_URL` from MagicBlock Discord for Private Payments.
