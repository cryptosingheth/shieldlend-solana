# Current Task

## Status: Implementation status reconciled after C1/C2.

## Active Objective

Continue post-convergence remediation without overstating privacy readiness. `docs/IMPLEMENTATION_STATUS.md` is now the canonical local implementation ledger, and README current-status sections have been reconciled to local source truth after C1/C2.

## Current Local Truth

1. Solana CLI and Anchor CLI 0.30.1 are available.
2. `Anchor.toml` and all three program `declare_id!` values match `anchor keys list`.
3. `anchor build --no-idl` passes and `.so` artifacts exist in `target/deploy/`.
4. Full Anchor IDL generation remains blocked by Anchor/proc-macro2 compatibility.
5. All three circuits compile and browser WASM artifacts are generated and hashed.
6. `.ptau`, `.zkey`, and `_vkey.json` files are missing.
7. IKA, MagicBlock PER, MagicBlock Private Payments, Umbra, Encrypt/FHE, and on-chain Groth16 verification are not live.
8. No devnet deployment has happened.
9. Frontend `contracts.ts` still contains older placeholder program IDs; do not treat it as deployment truth.
10. `shielded_pool` still has an internal stale `LENDING_POOL_PROGRAM_ID` constant; code follow-up needed before deployment.

## Immediate Next Actions

1. Fix stale frontend/program-ID references in a scoped code task.
2. Resolve full Anchor IDL generation separately.
3. Provide a reviewed BN254 Powers of Tau `.ptau` before generating zkeys/vkeys.
4. Wire `groth16-solana` and external privacy rails only after artifacts and deployment state are verified.

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
- Do not generate zkeys/vkeys without a reviewed `.ptau`
- Preserve fail-closed behavior until real Groth16, IKA, Encrypt, MagicBlock, and Umbra integrations are wired and tested
