# ZK Generation Notes

Date: 2026-05-05

## Program ID Constant

Current `anchor keys list` and `Anchor.toml` agree on the synced ShieldedPool
program id:

```text
9Bvt3jMawHFRRxpaQTtV5VvFdpZkmAZtvwjTrAX9TAtE
```

The BN254 field encoding is derived by decoding the Solana base58 program id to
32 bytes, interpreting those bytes as a big-endian unsigned integer, and
reducing modulo the BN254 scalar field.

```text
integer:      55030617898130697935292555913655154658264570111463202337490869205938251318255
fieldElement: 11254132154452147490799744423140604481167841310631133650094460832786634327021
```

This value is now recorded in:

- `circuits/constants.json`
- `circuits/constants.circom`
- `frontend/src/lib/circuits.ts` through the imported constants JSON

Note: the task prompt included `9Bvt3jMawHFRRxpaQTtV5VVFdpZkmAZtvwjTrAX9TAtE`
with uppercase `VVF`. Base58 is case-sensitive. That value derives to
`11254132154452147490799744423140604480898732526841905862269233462631211811821`,
but it does not match `anchor keys list` or `Anchor.toml`, so it was not used.

## Commands Run

```sh
npm run circuits:compile
```

Result: completed for all three circuits and produced `.r1cs`, `.sym`, and
circuit WASM outputs under `build/circuits`.

Constraint counts from the generated `.r1cs` files:

| Circuit | Constraints | Wires | Public inputs | Private inputs | Outputs | Required power |
|---|---:|---:|---:|---:|---:|---:|
| `withdraw_ring` | 14,019 | 14,062 | 18 | 53 | 1 | 14 |
| `collateral_ring` | 14,277 | 14,317 | 20 | 53 | 0 | 14 |
| `repay_ring` | 1,440 | 1,447 | 6 | 2 | 0 | 11 |

Largest circuit: `collateral_ring`, requiring at least 2^14 constraints.

DEV/TEST Powers of Tau generated:

```sh
npx snarkjs powersoftau new bn128 14 circuits/keys/dev_pot14_0000.ptau -v
npx snarkjs powersoftau contribute circuits/keys/dev_pot14_0000.ptau circuits/keys/dev_pot14_0001.ptau --name="ShieldLend local dev test contribution" -v -e="ShieldLend dev/test only local contribution 2026-05-05 not production trusted setup"
npx snarkjs powersoftau prepare phase2 circuits/keys/dev_pot14_0001.ptau circuits/keys/dev_pot14_final.ptau -v
npx snarkjs powersoftau verify circuits/keys/dev_pot14_final.ptau
```

DEV/TEST `.ptau` status:

| Path | Size | SHA-256 | Status |
|---|---:|---|---|
| `circuits/keys/dev_pot14_final.ptau` | 18 MB | `3838aee2feec6518a6eb1198a04c74317652630fbaf5715870fbd1a32deaa18c` | Verified by snarkjs |

This `.ptau` is local/dev only and is not a production trusted setup.

```sh
node scripts/generate-zk-artifacts.mjs
```

Result: compiled all three circuits, generated final `.zkey` files and
verification keys, copied browser artifacts to `frontend/public/circuits/`, and
updated `circuits/artifact_manifest.json`.

Each zkey was verified with:

```sh
npx snarkjs zkey verify build/circuits/<circuit>.r1cs circuits/keys/dev_pot14_final.ptau build/circuits/<circuit>.zkey
```

Each command returned `ZKey Ok!`.

## Current Artifact Status

| Circuit | R1CS/SYM | Browser WASM | DEV/TEST ZKey | DEV/TEST Verification Key | Proof smoke test |
|---|---:|---:|---:|---:|---:|
| withdraw_ring | generated locally | generated and hashed | generated and verified | generated and hashed | passed |
| collateral_ring | generated locally | generated and hashed | generated and verified | generated and hashed | passed |
| repay_ring | generated locally | generated and hashed | generated and verified | generated and hashed | passed |

## Browser Artifact Hashes

| Circuit | WASM SHA-256 | ZKey SHA-256 | VKey SHA-256 |
|---|---|---|---|
| withdraw_ring | `d674b773b61480fb754fd3e59eb0e267b5cabda876f02d21f1bd277aa7091dd8` | `177945b52aa4bab6a8d98343161b1d88d23fdcf5e3aefb005c5dd92469944032` | `2c86811b19a5ee92609cef0a5d6072393714ec3cb019a06fd0b74af3ace7a163` |
| collateral_ring | `aea5b64a706135118c9ef6e30a42e24eea7360b862026904ed1caea92c0bf938` | `af4fd077424412ad899a061999817d5367217114798a961272ceb351aa7821ea` | `26fc1c67eb8340a690961369dfebec688f23bbbbf14f1ade76055a974ac1f7e8` |
| repay_ring | `e00a728fc3438f16773ffda437762fec964f6f1b30e744e8aee9e12b06a81a4f` | `213ab27a8e88e1568e7543d5eb031841a302fde0cea9c9518feb0b2cc05e1f1e` | `41fbad43d297734fb66b305c3bbc9acdac182863f54ed64b4734c1fcc0bf0d83` |

## Proof Smoke Test

Deterministic dev inputs were generated under ignored
`build/circuits/smoke/`. For each circuit:

```sh
npx snarkjs wtns calculate ...
npx snarkjs wtns check ...
npx snarkjs groth16 prove ...
npx snarkjs groth16 verify ...
```

Witness checks returned `WITNESS IS CORRECT`, and Groth16 verification returned
`OK!` for `withdraw_ring`, `collateral_ring`, and `repay_ring`.

## Privacy Claim Boundary

These are real DEV/TEST Groth16 proving artifacts, not production ceremony
artifacts. Browser proof generation has the local artifacts it needs, but
on-chain Groth16 verification remains fail-closed/not wired and no devnet
deployment has happened.
