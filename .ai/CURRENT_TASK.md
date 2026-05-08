# Current Task

## Status: Hackathon demo and submission package COMPLETE on `convergence/privacy-rails-integration`.

## Completed This Session

### Hackathon Package (2026-05-08)

- `docs/HACKATHON.md` — replaced with submission-focused doc: one-liner, confirmed rail status table, Umbra tx signatures, claim boundary, blocker table
- `docs/DEMO_SCRIPT.md` — new: step-by-step demo walkthrough, all commands, honest framing script for judges
- `docs/SUBMISSION_CHECKLIST.md` — new: GitHub branch/PR, Umbra tx signatures pre-filled, C2H signatures placeholder, video scenes, screenshots, env vars, claim boundary
- `scripts/demo-status.mjs` — new: self-verifying manifest (git/artifacts/program IDs/rail scripts/optional live checks/claim boundary)
- `package.json` — added `demo:status` script
- `README.md` — updated date/branch ref; split "Other external privacy rails | Not wired" into four accurate rows; added doc links

### Validations (all pass)

- `node scripts/demo-status.mjs` — exits 0; all checks green; correct claim boundary printed
- `npm run typecheck:frontend` — PASS
- `npm run build:frontend` — PASS

---

## Hard Constraints (unchanged)

- Do not claim production ZK trusted setup
- Do not claim IKA relay signing active
- Do not claim MagicBlock Private Payments live
- Do not claim MagicBlock PER macros in Anchor programs
- Do not claim Umbra native SOL ShieldLend payout
- Do not claim Encrypt on-chain FHE active
- Do not fake any blocker as resolved

---

## Pending (requires user action)

1. Push: `git push origin convergence/privacy-rails-integration`
2. Create PR against `main`
3. Fill C2H devnet tx signatures into `docs/SUBMISSION_CHECKLIST.md`
4. Record demo video (9 scenes from `SUBMISSION_CHECKLIST.md`)
5. Capture 5 screenshots
6. Obtain `NEXT_PUBLIC_MAGICBLOCK_PRIVATE_PAYMENTS_URL` from MagicBlock Discord
