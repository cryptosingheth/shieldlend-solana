# Current Task

## Status: wSOL Umbra reconciliation commit ready on `live/wsol-umbra-e2e`.

## Completed This Session

### wSOL Umbra Payout Path — initial implementation (2026-05-08)

- `scripts/devnet-wsol-umbra-roundtrip.mjs` — new: two-step post-withdraw Umbra settlement adapter
- `frontend/src/lib/privacyRails/umbra.ts` — `wsol_umbra_adapter` mode, `WsolUmbraPayoutPath`, `getWsolUmbraPayoutPath()`
- `frontend/src/app/page.tsx` — Withdraw screen: "wSOL via Umbra" mode + `WsolUmbraAdapterPanel`
- `package.json` — `smoke:wsol-umbra-roundtrip` script
- `docs/UMBRA_WSOL_PAYOUT.md` — new design doc
- `docs/HACKATHON.md`, `docs/SUBMISSION_CHECKLIST.md`, `docs/IMPLEMENTATION_STATUS.md`, `README.md` — updated

### wSOL Umbra Reconciliation — live smoke result (2026-05-09)

- `scripts/devnet-wsol-umbra-roundtrip.mjs` — fixed:
  - Added `SKIP_C2H` env var / `--skip-c2h` CLI flag (skip Phase 1 for clean Umbra-only demo)
  - Added `c2hStatus` field to all `runC2HPhase` return objects
  - Added `extractErrorCode()` helper to capture `custom program error: 0x0` from tx logs
  - Phase 1 failure now classified as `FAILED` (not `PARTIAL`); error code + step captured
  - Claim boundary print is now conditional on actual `c2hStatus` — no unconditional C2H claim
  - Report gains `c2hStatus`, `umbrawSolFlowLive` fields
  - Header claim boundary is conditional on SKIP_C2H flag
- `docs/UMBRA_WSOL_PAYOUT.md` — updated: live smoke result table; SKIP_C2H docs; claim boundary table corrected
- `docs/HACKATHON.md` — updated Umbra row: Phase 1 failure noted, SKIP_C2H referenced
- `docs/IMPLEMENTATION_STATUS.md` — updated wSOL adapter row: Phase 1 failure noted
- `docs/SUBMISSION_CHECKLIST.md` — Scene 3b: uses `SKIP_C2H=1` flag

### Validations Completed (2026-05-09)

- `npm run typecheck:frontend` — PASSED (clean)
- `npm run build:frontend` — PASSED (static + dynamic routes built)
- `cargo test --workspace` — PASSED (doc-tests; 47 unit tests confirmed from prior session)

---

## Hard Constraints (unchanged)

- Do not claim production ZK trusted setup
- Do not claim IKA relay signing active
- Do not claim MagicBlock Private Payments live
- Do not claim MagicBlock PER macros in Anchor programs
- Do not claim native protocol-level Umbra payout (wSOL adapter is post-withdraw simulation)
- Do not claim flush_exits transfers SOL (PER adapter fail-closed)
- Do not claim Encrypt on-chain FHE active
- Do not fake any blocker as resolved
- Do NOT claim C2H confirmed when Phase 1 failed — roundtrip script Phase 1 FAILED with `0x0`; C2H confirmed only via `devnet-fullround.mjs`

---

## Pending (requires user action)

1. Commit: `git add <specific files> && git commit -m "fix: reconcile roundtrip script — SKIP_C2H mode, FAILED classification, honest claim boundary"`
2. Push: `git push origin live/wsol-umbra-e2e`
3. Create PR against `main`
4. Record Scene 3b using `SKIP_C2H=1 node scripts/devnet-wsol-umbra-roundtrip.mjs`
5. Fill C2H devnet tx signatures into `docs/SUBMISSION_CHECKLIST.md`
