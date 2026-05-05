# Current Task

## Status: DEV/TEST Groth16 artifacts generated after C2B.

## Active Objective

Continue post-convergence remediation without overstating privacy readiness. DEV/TEST Groth16 proving artifacts now exist and pass local smoke verification, but production setup and on-chain verification are not live.

## Current Local Truth

1. Solana CLI and Anchor CLI 0.30.1 are available.
2. `Anchor.toml`, all three program `declare_id!` values, frontend `PROGRAM_IDS`, and ShieldedPool's internal `LENDING_POOL_PROGRAM_ID` match `anchor keys list`.
3. `anchor build --no-idl` passes and `.so` artifacts exist in `target/deploy/`.
4. Full Anchor IDL generation remains blocked by Anchor/proc-macro2 compatibility.
5. All three circuits compile and DEV/TEST browser WASM, zkey, and vkey artifacts are generated and hashed.
6. Local DEV/TEST witness generation, witness checks, proof generation, and Groth16 verification pass for all three circuits.
7. IKA, MagicBlock PER, MagicBlock Private Payments, Umbra, Encrypt/FHE, and on-chain Groth16 verification are not live.
8. No devnet deployment has happened.
9. Frontend `contracts.ts` now targets the local synced program IDs.
10. `shielded_pool` now derives the lending-pool authority PDA using the synced lending-pool program ID.

## Immediate Next Actions

1. Resolve full Anchor IDL generation separately.
2. Replace the DEV/TEST Powers of Tau with a reviewed production ceremony before any production privacy claim.
3. Wire `groth16-solana` and external privacy rails only after verifier integration and deployment state are verified.
4. Deploy only after IDL/artifact/frontend configuration status is clean and explicitly scoped.

## Relevant Files

| File | Role |
|---|---|
| `docs/IMPLEMENTATION_STATUS.md` | Canonical implementation ledger |
| `README.md` | Concise public status and architecture overview |
| `circuits/CEREMONY.md` | Ceremony/proving-key status |
| `circuits/artifact_manifest.json` | Browser artifact paths and hashes |
| `audit-reports/ZK_GENERATION_NOTES.md` | ZK constant and artifact evidence |

## Hard Constraints

- Do not push without explicit instruction
- Do not run full `anchor build` with IDL unless explicitly scoped to the compatibility blocker
- Do not deploy
- Do not fake zkeys, verification keys, or proof verification
- Do not claim production trusted setup from the DEV/TEST `.ptau`
- Preserve fail-closed behavior until real Groth16, IKA, Encrypt, MagicBlock, and Umbra integrations are wired and tested
