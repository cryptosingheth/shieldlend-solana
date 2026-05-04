# ZK Artifact Blockers

Date: 2026-05-04

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

## Validation Commands

Command:

```sh
npm run typecheck:frontend
```

Result:

```text
sh: tsc: command not found
```

This is the same local dependency-materialization blocker: `typescript` is declared, but dependencies are not installed locally.

Command:

```sh
npm run circuits:compile
```

Result:

```text
error[P1014]: The file circomlib/circuits/poseidon.circom to be included has not been found
```

## Artifact Generation Attempt

Command:

```sh
node scripts/generate-zk-artifacts.mjs
```

Result:

```text
error[P1014]: The file circomlib/circuits/poseidon.circom to be included has not been found
```

The script stopped before producing `.r1cs`, `.wasm`, `.sym`, `.zkey`, or `_vkey.json` artifacts.

## Blockers

1. `circomlib` is not installed/materialized locally.

The repo has `circomlib` in `frontend/package.json`, but no local dependency tree exists at `node_modules/` or `frontend/node_modules/`.

Install/materialize dependencies from the repo root:

```sh
npm install
```

Then retry validation and artifact generation:

```sh
npm run typecheck:frontend
npm run circuits:compile
node scripts/generate-zk-artifacts.mjs
```

2. No Powers of Tau `.ptau` file exists locally.

After circuit compilation works, provide a reviewed BN254 Powers of Tau file. For a local non-production ceremony only:

```sh
mkdir -p build/circuits
snarkjs powersoftau new bn128 20 build/circuits/pot20_0000.ptau -v
snarkjs powersoftau contribute build/circuits/pot20_0000.ptau build/circuits/pot20_0001.ptau --name="ShieldLend local test contribution" -v -e="replace-with-high-entropy-randomness"
snarkjs powersoftau prepare phase2 build/circuits/pot20_0001.ptau build/circuits/pot20_final.ptau -v
node scripts/generate-zk-artifacts.mjs
```

For production or public testing claims, use a trusted ceremony artifact with documented provenance and hashes instead of a local one-person ceremony.

3. Existing browser artifacts were stale.

The previous `frontend/public/circuits/withdraw_ring.wasm` and `frontend/public/circuits/collateral_ring.wasm` files were removed instead of being treated as valid artifacts. They predated the current circuit changes and there was no matching `.zkey` or verification key.
