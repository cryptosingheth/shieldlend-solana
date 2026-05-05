# Current Task

## Status: ZK constants aligned; proving keys still blocked.

## Active Objective

Continue post-convergence remediation without overstating privacy readiness. Program IDs are synced, Anchor CLI is available, and ZK constants now point at the current local ShieldedPool program id. Browser WASM artifacts exist for all three circuits, but Groth16 zkeys and verification keys remain blocked because no reviewed BN254 Powers of Tau file is present locally.

## Completed In ZK Constants Pass

1. Verified branch `convergence/zk-constants-artifacts` and synced program IDs with `anchor keys list`.
2. Confirmed ShieldedPool program id is `9Bvt3jMawHFRRxpaQTtV5VvFdpZkmAZtvwjTrAX9TAtE`.
3. Derived BN254 field element `11254132154452147490799744423140604481167841310631133650094460832786634327021`.
4. Updated `circuits/constants.json` and `circuits/constants.circom`.
5. Ran `npm run circuits:compile` successfully after creating `build/circuits`.
6. Ran `node scripts/generate-zk-artifacts.mjs`; browser WASM files were generated and hashed.
7. Updated `circuits/CEREMONY.md`, `audit-reports/ZK_GENERATION_NOTES.md`, and `audit-reports/ZK_ARTIFACT_BLOCKERS.md`.

## Immediate Next Actions

1. Provide or generate a reviewed BN254 Powers of Tau `.ptau` file before zkey generation.
2. Rerun `node scripts/generate-zk-artifacts.mjs` to generate `.zkey` and `_vkey.json` files.
3. Wire verification keys into the planned `groth16-solana` verifier path before claiming live ZK privacy.
4. Keep full `anchor build` IDL generation out of scope until the Anchor/proc-macro2 compatibility issue is handled separately.

## Relevant Files

| File | Role |
|---|---|
| `circuits/constants.json` | Shared ShieldedPool program id field element |
| `circuits/constants.circom` | Circom compile-time program id field constant |
| `circuits/artifact_manifest.json` | Browser artifact paths and hashes |
| `circuits/CEREMONY.md` | Ceremony/proving-key status |
| `audit-reports/ZK_GENERATION_NOTES.md` | Commands, derived constants, and artifact status |
| `audit-reports/ZK_ARTIFACT_BLOCKERS.md` | Remaining blockers |
| `frontend/src/lib/circuits.ts` | Frontend imports constants and artifact manifest |

## Hard Constraints

- Do not push without explicit instruction
- Do not run full `anchor build` with IDL in this task
- Do not deploy
- Do not fake zkeys, verification keys, or proof verification
- Preserve fail-closed behavior until real Groth16, IKA, Encrypt, MagicBlock, and Umbra integrations are wired and tested
