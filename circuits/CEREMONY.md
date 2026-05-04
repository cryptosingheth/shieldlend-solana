# ZK Ceremony Notes

No trusted setup ceremony was executed in this remediation pass.

Current blocker status:

- `circom` is installed (`circom compiler 2.2.3`).
- `snarkjs` is installed (`snarkjs@0.7.6`), although `snarkjs --version` exits with status 99 after printing usage.
- `circomlib` is not materialized under `node_modules/` or `frontend/node_modules/`, so circuit compilation cannot resolve `circomlib/circuits/poseidon.circom`.
- No `.ptau` file exists locally, so Groth16 `.zkey` and verification-key generation is blocked even after compilation dependencies are installed.

Required production ceremony evidence before claiming usable privacy:

- Powers of Tau source and hash.
- Contribution transcript or external trusted ceremony provenance.
- `snarkjs powersoftau verify` output.
- Per-circuit `.r1cs`, `.wasm`, `.sym`, `.zkey`, and verification-key hashes.
- Proof verification command output for each generated circuit.
