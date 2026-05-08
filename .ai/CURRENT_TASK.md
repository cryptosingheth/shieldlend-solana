# Current Task

## Status: Encrypt live-hardening completed on `rail/encrypt`; C2H remains intact.

## Active Objective

Encrypt Live-Hardening Task — COMPLETE.

## Current Local Truth

1. C2H full deposit -> flush_epoch -> store_withdraw_proof -> withdraw round-trip remains the baseline. On-chain Groth16 BN254 withdraw verification previously passed on devnet at 198,502 CU.
2. Encrypt/FHE is now wired at the client/gRPC adapter level only.
3. Program-side encrypted-health verification remains fail-closed with `LendingError::EncryptVerifierNotWired`.
4. No Anchor program logic was changed in this task.
5. Current Encrypt docs require `encrypt-anchor` with `anchor-lang = "0.32"`; this workspace remains on Anchor `0.30.1`, so program-side Encrypt CPI was deferred to avoid disturbing C2H.
6. `@encrypt.xyz/pre-alpha-solana-client@0.1.0` is present in the lockfile, but its `./grpc` export resolves to TypeScript source in `node_modules`; plain Node cannot import it directly. The adapter uses the documented `encrypt.v1.EncryptService/CreateInput` gRPC API through `@grpc/grpc-js`.
7. Anchor 0.32 sidecar feasibility was rechecked in `/private/tmp/encrypt-anchor-feasibility`: graph-only code compiled, but the real `encrypt_anchor::EncryptContext` CPI path failed with duplicate `solana_account_info` and `anchor_lang` types because current upstream `encrypt-anchor` resolves to Anchor 1/Solana 3.x account crates.
8. Live Encrypt pre-alpha devnet probe passed:
   - Command: `npm run check:encrypt -- --live`
   - Active network key selected: `f00f3465b66ff8034600706ed05bf70ef5318edc511398085a3ab4512b875197`
   - Health ratio test value: `15000` bps
   - Returned ciphertext id: `5VZ8BhpSWqDCAXMMb4ESVGsQRKb6X9dDgD1xGLydCA6y`
9. `scripts/encrypt-health-smoke.mjs` now submits modeled non-sensitive collateral, debt, and liquidation-threshold inputs when run with `--live`.
   - Latest collateral id: `8CtojVRaXkWnCB6pN6wq5jxEvkdmAe5BhfTsm5pBLZsc`
   - Latest debt id: `25EK8vDYPXB6kaT6EZEmz6gwjpu1SNKt57zn1cnYR1xw`
   - Latest threshold id: `2iA8vWgBaA8cKo6eGsQQMdZUgHyNNB3spSc93Sj6Fhos`
10. Official Encrypt pre-alpha disclaimer must be preserved: no production encryption guarantee; pre-alpha data may be plaintext/public; do not submit sensitive or real data.

## Files Changed

| File | Role |
|---|---|
| `frontend/src/lib/privacyRails/encrypt.ts` | Server-side Encrypt pre-alpha adapter; gRPC `CreateInput`; active key discovery; exact claim boundary |
| `scripts/check-encrypt.mjs` | CLI probe; can run client-only or live `CreateInput` with `--live` |
| `scripts/encrypt-health-smoke.mjs` | Live-hardening smoke; models collateral, debt, and liquidation-threshold inputs |
| `docs/ENCRYPT_LIVE_HARDENING.md` | Exact sidecar blocker and Anchor 0.32 migration path |
| `frontend/src/app/api/integrations/encrypt/status/route.ts` | Returns real Encrypt adapter status |
| `frontend/src/app/api/integrations/encrypt/liquidation-reveal/route.ts` | Probe-only by default; optional health-ratio `CreateInput` path |
| `frontend/src/app/page.tsx` | Adds Encrypt pre-alpha status panel |
| `.env.example` | Adds optional Encrypt network key and probe env vars |
| `package.json` | Adds `npm run check:encrypt` |
| `README.md`, `docs/HACKATHON.md`, `docs/PRIVACY_AND_THREAT_MODEL.md` | Updated live-vs-pre-alpha claim boundaries |

## Validations

- `npm run check:encrypt -- --live` — PASS
- `npm run typecheck:frontend` — PASS
- `npm run build:frontend` — PASS, with existing `web-worker`/`ffjavascript` warning from circuit dependencies
- `cargo test --workspace` — PASS, 47 tests; existing Anchor cfg warnings
- `anchor build --no-idl` — PASS; existing Anchor/SBF warnings

## Immediate Next Actions

1. Decide whether an Anchor 0.32 migration is acceptable before adding `encrypt-anchor`.
2. If yes, pin/fork an Encrypt SDK revision whose `encrypt-anchor` resolves cleanly with Anchor 0.32, isolate the sidecar in its own workspace, and rerun the C2H devnet proof round-trip after any program-side change.
3. If no, keep Encrypt as client/gRPC rail until upstream publishes a compatible Anchor integration surface or stable JS client package exports.

## Hard Constraints

- Do not claim production FHE privacy from this branch.
- Do not submit sensitive user data to Encrypt pre-alpha.
- Do not wire `encrypt-anchor` into programs without an Anchor compatibility plan.
- Do not break the C2H Groth16 withdraw round-trip.
