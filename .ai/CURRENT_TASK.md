# Current Task

## Status: wSOL Umbra payout path implemented on `live/wsol-umbra-e2e`.

## Completed This Session

### wSOL Umbra Payout Path (2026-05-08, branch: live/wsol-umbra-e2e)

- `scripts/devnet-wsol-umbra-roundtrip.mjs` — new: two-step post-withdraw Umbra settlement adapter (wrap SOL → wSOL → Umbra deposit → Umbra withdraw); honest claim boundary embedded; C2H phase skipped if nullifier already consumed
- `frontend/src/lib/privacyRails/umbra.ts` — added `UmbraDestinationMode` `"wsol_umbra_adapter"`, `WsolUmbraPayoutPath` interface, `getWsolUmbraPayoutPath()`, updated `planUmbraDestinationRoute()`
- `frontend/src/app/page.tsx` — Withdraw screen: third mode button ("wSOL via Umbra"), `WsolUmbraAdapterPanel` with step 1/2/3 + confirmed/not-live panels; imported `getWsolUmbraPayoutPath` and `WsolUmbraPayoutPath`
- `package.json` — added `smoke:wsol-umbra-roundtrip` script
- `docs/UMBRA_WSOL_PAYOUT.md` — new: full doc covering design, claim boundary, safe/unsafe wording, UI modes
- `docs/HACKATHON.md` — updated Umbra rail row and blocker table
- `docs/SUBMISSION_CHECKLIST.md` — added Scene 3b (roundtrip script) and Scene 8 update (wSOL via Umbra UI mode)
- `docs/IMPLEMENTATION_STATUS.md` — updated Umbra payout rows and Known Blockers
- `README.md` — updated Umbra row in status table

### Validations (pending)

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

---

## Pending (requires user action)

1. Run `npm run smoke:wsol-umbra-roundtrip` on devnet to obtain live tx signatures
2. Record Scene 3b in demo video (roundtrip script output)
3. Push: `git push origin live/wsol-umbra-e2e`
4. Create PR against `main`
5. Fill C2H devnet tx signatures into `docs/SUBMISSION_CHECKLIST.md`
