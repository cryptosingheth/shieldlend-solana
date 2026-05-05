# ZK Artifact Status And Remaining Blockers

Date: 2026-05-05

## Checks Run

```text
circom --version
circom compiler 2.2.3
```

```text
snarkjs --version
snarkjs@0.7.6
```

Note: this `snarkjs --version` command printed the version and usage text, then exited with status 99.

`circomlib` is now materialized under `node_modules/`, so the previous
`circomlib/circuits/poseidon.circom` include blocker is cleared.

## Validation Commands

Command:

```sh
npm run circuits:compile
```

Result:

```text
completed
```

The first attempt failed with `invalid output path` because `build/circuits` did
not exist. After creating that directory, all three circuits compiled and wrote
`.r1cs`, `.sym`, and WASM outputs under `build/circuits`.

Command:

```sh
node scripts/generate-zk-artifacts.mjs
```

Result:

```text
completed
```

The generator compiled all three circuits, copied browser WASM files to
`frontend/public/circuits/`, generated final DEV/TEST zkeys and verification
keys, and updated `circuits/artifact_manifest.json` with WASM, zkey, and vkey
hashes.

## Cleared In C2B

1. Missing local `.ptau` no longer blocks dev/test artifact generation.

Generated local DEV/TEST-only file:

| Path | Power | Size | SHA-256 |
|---|---:|---:|---|
| `circuits/keys/dev_pot14_final.ptau` | 14 | 18 MB | `3838aee2feec6518a6eb1198a04c74317652630fbaf5715870fbd1a32deaa18c` |

2. DEV/TEST Groth16 `.zkey` files and `_vkey.json` files now exist for
`withdraw_ring`, `collateral_ring`, and `repay_ring`.

3. Local proof smoke tests now pass for all three circuits.

## Remaining Blockers

1. Production trusted setup is missing.

The generated `.ptau`, `.zkey`, and verification keys are DEV/TEST-only. For
production or public privacy claims, use a reviewed ceremony artifact with
documented provenance and hashes instead of this local one-person ceremony.

2. On-chain verifier integration remains blocked.

The generated verification keys are not yet wired into `groth16-solana`, and
the Anchor programs still fail closed for proof verification.

3. Devnet deployment is not done.

Frontend browser proving artifacts exist locally, but no deployed program
accounts have been verified on devnet.
