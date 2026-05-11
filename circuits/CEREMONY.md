# ZK Ceremony Notes

Last checked: 2026-05-05

- Circuits: withdraw_ring, collateral_ring, repay_ring
- Proving system: Groth16 over BN254
- Constant source: `Anchor.toml [programs.localnet].shielded_pool`
- ShieldedPool program id: `9Bvt3jMawHFRRxpaQTtV5VvFdpZkmAZtvwjTrAX9TAtE`
- ShieldedPool BN254 field element: `11254132154452147490799744423140604481167841310631133650094460832786634327021`

## DEV/TEST Powers Of Tau

The current Groth16 artifacts use a local DEV/TEST-only Powers of Tau file.
This is not a production trusted setup.

| Item | Value |
|---|---|
| Canonical path | `circuits/keys/dev_pot14_final.ptau` |
| Generator symlink used by script | `circuits/dev_pot14_final.ptau` |
| Power | 14 |
| Capacity | 16,384 constraints |
| Largest circuit | `collateral_ring`, 14,277 constraints |
| Size | 18 MB |
| SHA-256 | `3838aee2feec6518a6eb1198a04c74317652630fbaf5715870fbd1a32deaa18c` |
| Verification | `npx snarkjs powersoftau verify circuits/keys/dev_pot14_final.ptau` passed |

Contribution label:

```text
ShieldLend local dev test contribution
```

This file is acceptable for local/dev proof-generation smoke tests only. Replace
it before any production or public privacy claim.

## Circuit Sizes

| Circuit | Constraints | Required power |
|---|---:|---:|
| `withdraw_ring` | 14,019 | 14 |
| `collateral_ring` | 14,277 | 14 |
| `repay_ring` | 1,440 | 11 |

## Generated Artifacts

`node scripts/generate-zk-artifacts.mjs` generated browser `.wasm`, final
`.zkey`, and `_vkey.json` files for all three circuits under
`frontend/public/circuits/`. Hashes are recorded in
`circuits/artifact_manifest.json`.

Each zkey was verified with:

```sh
npx snarkjs zkey verify build/circuits/<circuit>.r1cs circuits/keys/dev_pot14_final.ptau build/circuits/<circuit>.zkey
```

DEV smoke witnesses, proofs, and local Groth16 verification passed for all
three circuits under ignored `build/circuits/smoke/` outputs.

If a production or shared ceremony is used later, replace this note with the
ceremony provenance, participant transcript, verification commands, and hashes.
Do not claim production privacy from locally generated or unverified setup
artifacts.
