# Current Task

## Status: C2C analysis complete — on-chain verifier wiring is blocked (Outcome B).

## Active Objective

Document the on-chain Groth16 verifier blockers precisely so they can be resolved
sequentially in future tasks. Do not proceed to wiring until each blocker is cleared
in the order listed in `audit-reports/ONCHAIN_VERIFIER_BLOCKERS.md`.

## Current Local Truth

1. Solana CLI and Anchor CLI 0.30.1 are available.
2. `Anchor.toml`, all three program `declare_id!` values, frontend `PROGRAM_IDS`, and
   ShieldedPool's internal `LENDING_POOL_PROGRAM_ID` match `anchor keys list`.
3. `anchor build --no-idl` passes and `.so` artifacts exist in `target/deploy/`.
4. Full Anchor IDL generation remains blocked by Anchor/proc-macro2 compatibility.
5. All three circuits compile and DEV/TEST browser WASM, zkey, and vkey artifacts are
   generated and hashed.
6. Local DEV/TEST witness generation, witness checks, proof generation, and Groth16
   verification pass for all three circuits.
7. On-chain Groth16 verification is **blocked** — five concrete blockers documented in
   `audit-reports/ONCHAIN_VERIFIER_BLOCKERS.md`.
8. IKA, MagicBlock PER, MagicBlock Private Payments, Umbra, Encrypt/FHE, and on-chain
   Groth16 verification are not live.
9. No devnet deployment has happened.
10. Frontend `contracts.ts` now targets the local synced program IDs.
11. `shielded_pool` now derives the lending-pool authority PDA using the synced
    lending-pool program ID.

## On-Chain Verifier Blockers (C2C Result)

1. `groth16-solana` absent from all Cargo.toml files — version/API not researched.
2. Instruction args lack proof bytes — `WithdrawArgs`, `BorrowArgs`, `RepayArgs` carry
   only hashes; they need `proof_a: [u8; 64]`, `proof_b: [u8; 128]`, `proof_c: [u8; 64]`,
   and full public signal arrays. This is a breaking ABI change.
3. vkey format conversion unscripted — snarkjs decimal projective format must be converted
   to big-endian affine bytes for Solana BN254 syscalls.
4. Missing Rust on-chain test vectors — no deterministic proof bytes in any Rust test.
5. Compute budget not handled — BN254 pairing (~220k–260k CU) exceeds the 200k default
   per-instruction limit; `set_compute_unit_limit` must be added.

Note: the Anchor IDL generation blocker is **not** a prerequisite for verifier wiring.
`anchor build --no-idl` will continue to compile after these changes.

## Immediate Next Actions

1. Research and pin `groth16-solana` crate version and API. Confirm BPF compatibility.
2. Write vkey conversion script — snarkjs JSON → big-endian affine byte constants.
3. Extend instruction arg structs with proof bytes and public signal arrays.
4. Implement verifier calls in the three fail-closed stub functions.
5. Add Rust test vectors derived from smoke proof outputs.
6. Add compute budget handling.

## Relevant Files

| File | Role |
|---|---|
| `docs/IMPLEMENTATION_STATUS.md` | Canonical implementation ledger |
| `audit-reports/ONCHAIN_VERIFIER_BLOCKERS.md` | C2C blocker analysis with file/line evidence |
| `audit-reports/ZK_GENERATION_NOTES.md` | ZK constant and artifact evidence |
| `circuits/artifact_manifest.json` | Browser artifact paths and hashes |
| `programs/shielded_pool/src/lib.rs:170` | `verify_withdraw_proof` — fail-closed stub |
| `programs/lending_pool/src/lib.rs:274` | `verify_collateral_proof` — fail-closed stub |
| `programs/lending_pool/src/lib.rs:278` | `verify_repay_proof` — fail-closed stub |

## Hard Constraints

- Do not push without explicit instruction
- Do not run full `anchor build` with IDL unless explicitly scoped
- Do not deploy
- Do not fake Groth16 verification (no "return Ok(())" stubs)
- Do not claim production trusted setup from the DEV/TEST `.ptau`
- Do not add `groth16-solana` as a dep until its API is confirmed compatible
- Preserve fail-closed behavior in all three verifier stubs until real verification is wired
