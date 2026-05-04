# ZK Fix Notes

Date: 2026-05-04
Branch: `fix/zk-artifacts`

## Scope

Changed only ZK circuit, artifact-pipeline, and circuit frontend helper files:

- `circuits/**`
- `scripts/**`
- `frontend/src/lib/circuits.ts`
- `frontend/public/circuits/**`

No Anchor program logic or general frontend UI files were changed.

## Circuit Safety Fixes

- Replaced `LessThan(4)` with `LessThan(5)` for 16-slot ring index checks in `withdraw_ring.circom` and `collateral_ring.circom`. This avoids relying on the exact `2^4` boundary for the upper bound.
- Added pairwise public ring uniqueness constraints to `withdraw_ring.circom` and `collateral_ring.circom`. Repeated public ring commitments now fail the circuit.
- Added `Num2Bits` range constraints in `collateral_ring.circom`:
  - `denomination`: 64 bits
  - `borrowed`: 64 bits
  - `minRatioBps`: 24 bits
- The LTV multiplication is now bounded below `2^88`, far below both the BN254 field modulus and the 96-bit comparator range. This prevents modular field wraparound from bypassing the LTV check.

## Domain Separator Fixes

- Replaced hardcoded `13` in all three circuits with `ShieldedPoolProgramIdField()` from `circuits/constants.circom`.
- Added `circuits/constants.json` as the shared source for the Shielded Pool program-id field encoding.
- Added `scripts/derive-program-id-field.mjs` to decode a Solana base58 program id as 32 big-endian bytes and reduce it modulo the BN254 scalar field.
- Current source is `Anchor.toml [programs.localnet].shielded_pool`:
  - Program id: `EKMPkr2qFAQ8g7P4rNsaGPKVpx2T7eC5fDzYXwfWJge7`
  - BN254 field element: `1940380672232244779192225680111840427351951635172679071286159880427552566168`
- Status remains `localnet-id-needs-deployment-confirmation`; regenerate constants after final deployed program IDs are confirmed.

## Frontend Proof-Generation Fixes

- Fixed `computeCommitment` signature to `(secret, nullifier, amountLamports)` and updated `createNote`.
- Removed synthetic ring construction. `generateWithdrawProof` and `generateCollateralProof` now require a `CommitmentRingProvider`; without one, they throw `CommitmentRingUnavailableError`.
- Added typed real-ring validation:
  - exactly 16 commitments
  - unique commitments
  - selected note commitment must be present
- Added artifact manifest support via `circuits/artifact_manifest.json`.
- Added public signal layout spec in `circuits/public_signals.json`.
- Removed stale checked-in browser `.wasm` files from `frontend/public/circuits/`; placeholders are not committed.

## Artifact Pipeline

- Added `scripts/generate-zk-artifacts.mjs`.
- The script:
  - regenerates circuit constants
  - checks `circom` and `snarkjs`
  - compiles all three circuits to `.r1cs`, `.wasm`, and `.sym`
  - generates `.zkey` and `_vkey.json` when a `.ptau` file is present
  - copies browser artifacts to `frontend/public/circuits`
  - updates `circuits/artifact_manifest.json` with SHA-256 hashes
  - writes ceremony notes

## Remaining Blockers

See `audit-reports/ZK_ARTIFACT_BLOCKERS.md`.
