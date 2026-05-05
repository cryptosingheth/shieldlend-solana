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

Initial result:

```text
invalid output path
```

The output directory was absent. After creating `build/circuits`, the command
completed for all three circuits and produced `.r1cs`, `.sym`, and circuit WASM
outputs under `build/circuits`.

```sh
node scripts/generate-zk-artifacts.mjs
```

Result:

```text
circom: circom compiler 2.2.3
snarkjs: snarkjs@0.7.6
No .ptau file found; skipping Groth16 zkey and verification-key generation.
```

The generator copied browser WASM artifacts to `frontend/public/circuits/` and
updated `circuits/artifact_manifest.json` with WASM hashes. It did not generate
`.zkey` or verification-key JSON files.

## Current Artifact Status

| Circuit | R1CS/SYM | Browser WASM | ZKey | Verification Key |
|---|---:|---:|---:|---:|
| withdraw_ring | generated locally | generated and hashed | blocked | blocked |
| collateral_ring | generated locally | generated and hashed | blocked | blocked |
| repay_ring | generated locally | generated and hashed | blocked | blocked |

Blocked items remain blocked because no reviewed BN254 Powers of Tau `.ptau`
file exists locally.

## Privacy Claim Boundary

These artifacts are not live privacy artifacts. Proof generation cannot complete
without matching zkeys, and on-chain verification still requires reviewed
verification keys plus the planned `groth16-solana` verifier integration.
