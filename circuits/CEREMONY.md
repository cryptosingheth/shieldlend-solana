# ZK Ceremony Notes

Last checked: 2026-05-05

- Circuits: withdraw_ring, collateral_ring, repay_ring
- Proving system: Groth16 over BN254
- Constant source: `Anchor.toml [programs.localnet].shielded_pool`
- ShieldedPool program id: `9Bvt3jMawHFRRxpaQTtV5VvFdpZkmAZtvwjTrAX9TAtE`
- ShieldedPool BN254 field element: `11254132154452147490799744423140604481167841310631133650094460832786634327021`
- Powers of Tau input: not found locally
- WASM generation: completed locally via `node scripts/generate-zk-artifacts.mjs`
- ZKey generation: blocked because no `.ptau` file is available
- Verification-key export: blocked because zkeys were not generated

The committed browser WASM files are compiled artifacts only. They are not
usable proof artifacts without matching `.zkey` files and verification keys.

Required production ceremony evidence before claiming usable privacy:

- Powers of Tau source and hash.
- Contribution transcript or external trusted ceremony provenance.
- `snarkjs powersoftau verify` output.
- Per-circuit `.r1cs`, `.wasm`, `.sym`, `.zkey`, and verification-key hashes.
- Proof verification command output for each generated circuit.

Do not claim production privacy from locally generated or unverified setup
artifacts.
