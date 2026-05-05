# ZK Artifact Blockers

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
completed after creating build/circuits
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
No .ptau file found; skipping Groth16 zkey and verification-key generation.
```

The generator compiled all three circuits, copied browser WASM files to
`frontend/public/circuits/`, and updated `circuits/artifact_manifest.json` with
WASM hashes.

## Remaining Blockers

1. No Powers of Tau `.ptau` file exists locally.

Provide a reviewed BN254 Powers of Tau file. For a local non-production ceremony
only:

```sh
mkdir -p build/circuits
snarkjs powersoftau new bn128 20 build/circuits/pot20_0000.ptau -v
snarkjs powersoftau contribute build/circuits/pot20_0000.ptau build/circuits/pot20_0001.ptau --name="ShieldLend local test contribution" -v -e="replace-with-high-entropy-randomness"
snarkjs powersoftau prepare phase2 build/circuits/pot20_0001.ptau build/circuits/pot20_final.ptau -v
node scripts/generate-zk-artifacts.mjs
```

For production or public testing claims, use a trusted ceremony artifact with documented provenance and hashes instead of a local one-person ceremony.

2. Groth16 `.zkey` files and verification keys are not generated.

The manifest intentionally records `null` hashes for zkey and vkey entries until
real files exist. Do not replace these with placeholder hashes.

3. On-chain verifier integration remains blocked on real verification keys.

The current browser WASM files are compiled artifacts only. They do not make the
privacy proof path live without matching zkeys, verification keys, and
`groth16-solana` integration.
