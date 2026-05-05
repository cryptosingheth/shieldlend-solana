# ShieldLend Solana Implementation Status

Last reconciled: 2026-05-05

This is the canonical implementation ledger for the local repository. It
separates target architecture from implemented code, generated artifacts,
fail-closed scaffolding, missing integrations, and deployment status.

## Summary

| Area | Current local status | Claim boundary |
|---|---|---|
| Anchor programs | Compile to SBF with `anchor build --no-idl`; `.so` files exist in `target/deploy/` | Not deployed; full IDL generation is blocked |
| Program IDs | `Anchor.toml` and all three `declare_id!` values are synced with `anchor keys list` | Frontend `contracts.ts` still contains old placeholder IDs; do not use frontend program IDs as deployment truth |
| ZK circuits | `withdraw_ring`, `collateral_ring`, and `repay_ring` compile; browser WASM files are generated and hashed | `.ptau`, `.zkey`, and `_vkey.json` are missing; no proof-generation smoke test or on-chain verification is live |
| Frontend | Typechecks and builds; note/history vault encryption exists; privacy rail health is gated by env flags | Devnet execution is blocked by undeployed programs, stale frontend program IDs, and missing external rails |
| External privacy rails | Adapter/status scaffolding exists for IKA, Encrypt, MagicBlock Private Payments, PER, VRF, and Umbra status flags | IKA relay, PER batching, Private Payments, Umbra exits, and Encrypt/FHE health computation are not live |
| Deployment | None | Do not claim devnet or production readiness |

## Verification Snapshot

| Command | Status | Notes |
|---|---|---|
| `pwd` | `/Users/opinderpreetsingh/projects/shieldlend-solana` | Canonical local checkout for this task |
| `git log --oneline -5` | includes `13df1fc chore: align zk constants with synced program ids` | Convergence Task 2 is present |
| `anchor keys list` | passed | IDs listed below |
| `find target/deploy -name "*.so"` | passed | Three `.so` files exist |
| `cargo fmt --all -- --check` | known good | Last validation in this reconciliation pass |
| `cargo test --workspace` | known good | 21 Rust unit tests pass |
| `npm run typecheck:frontend` | known good | TypeScript check passes |
| `npm run build:frontend` | known good | Next build passes with existing dependency warning |
| `anchor build --no-idl` | known good | SBF build passes with existing Anchor/SBF warnings |

## Program IDs

| Program | Anchor ID source | Current ID | Status |
|---|---|---|---|
| `shielded_pool` | `Anchor.toml`, `programs/shielded_pool/src/lib.rs` | `9Bvt3jMawHFRRxpaQTtV5VvFdpZkmAZtvwjTrAX9TAtE` | Synced |
| `lending_pool` | `Anchor.toml`, `programs/lending_pool/src/lib.rs` | `HLtWrvLyc2SE3ERWHaEdY4RG84GxFfHv3Qf4NzJPxaF7` | Synced |
| `nullifier_registry` | `Anchor.toml`, `programs/nullifier_registry/src/lib.rs` | `E42nSmqvSCuC1EWbmzYqsdLHimBMeuZyir5dB5gE24rF` | Synced |

Known program-ID follow-up:

- `frontend/src/lib/contracts.ts` still uses older placeholder IDs.
- `programs/shielded_pool/src/lib.rs` still has an internal
  `LENDING_POOL_PROGRAM_ID` constant pointing to the older lending-pool ID.
- These were not changed in this docs-only reconciliation task.

## Anchor Build And Deployment

| Item | Current status | Evidence |
|---|---|---|
| Solana CLI | Installed | Environment verified before C1/C2 |
| Anchor CLI | Installed, `0.30.1` | Environment verified before C1/C2 |
| `anchor build --no-idl` | Passes | Builds SBF artifacts without IDL generation |
| `.so` artifacts | Generated | `target/deploy/shielded_pool.so`, `lending_pool.so`, `nullifier_registry.so` |
| Full `anchor build` with IDL | Blocked | Anchor/proc-macro2 compatibility issue, intentionally out of scope |
| Devnet deployment | Not done | No deployed program accounts verified |

## ZK Constants And Artifacts

ShieldedPool program ID used for ZK domain separation:

```text
9Bvt3jMawHFRRxpaQTtV5VvFdpZkmAZtvwjTrAX9TAtE
```

BN254 field element:

```text
11254132154452147490799744423140604481167841310631133650094460832786634327021
```

| Circuit | Source file | Public signal metadata | Browser WASM | ZKey | Verification key | Live proof status |
|---|---|---|---|---|---|---|
| Withdraw | `circuits/withdraw_ring.circom` | Recorded in `circuits/public_signals.json` | Generated and hashed | Missing | Missing | Not live |
| Collateral | `circuits/collateral_ring.circom` | Recorded in `circuits/public_signals.json` | Generated and hashed | Missing | Missing | Not live |
| Repay | `circuits/repay_ring.circom` | Recorded in `circuits/public_signals.json` | Generated and hashed | Missing | Missing | Not live |

Artifact details:

- `circuits/artifact_manifest.json` records WASM hashes.
- `zkey.sha256` and `vkey.sha256` are intentionally `null`.
- No `.ptau` file exists locally.
- No trusted setup ceremony has been executed.
- No proof-generation smoke test is recorded as passing.
- No on-chain `groth16-solana` verification is wired.

## Implemented Code

| Area | Implemented locally |
|---|---|
| `shielded_pool` | Fixed denominations, deposit queue, root history, zero-root rejection, withdrawal/disbursement queues, fail-closed withdraw verifier, nullifier registry CPI scaffolding after verifier gate |
| `lending_pool` | Interest model, loan PDA state, borrow/repay/liquidation skeleton, outstanding balance check, liquidation reveal binding checks, repay liquidation-state reset, fail-closed proof/payment/FHE verifiers, nullifier lock/unlock CPI scaffolding after verifier gates |
| `nullifier_registry` | Authorized writer config, Active/Locked/Spent state machine, `spend` requires Locked, unit tests |
| Frontend local security | AES-256-GCM note vault and encrypted history log |
| Frontend circuit interface | Poseidon commitment/nullifier helpers, real-ring requirement, snarkjs fullProve calls using manifest paths |

## Fail-Closed Or Scaffolded Logic

| Flow | Current code behavior |
|---|---|
| Withdraw proof verification | Fails closed with `Groth16VerifierNotWired` |
| Borrow collateral proof verification | Fails closed with `Groth16VerifierNotWired` |
| Repay proof verification | Fails closed with `Groth16VerifierNotWired` |
| Private payment receipt verification | Fails closed with `PrivatePaymentVerifierNotWired` |
| Encrypt liquidation reveal verification | Fails closed with `EncryptVerifierNotWired` |
| PER exit flushing | Fails closed with `PerAdapterNotWired` unless queue is empty |
| Frontend proof generation | Requires real commitment ring provider and zkeys; synthetic decoys are rejected |

## Privacy Rails

| Privacy property or rail | Current status | Live claim allowed? |
|---|---|---|
| IKA relay signer privacy | Not wired | No |
| IKA FutureSign liquidation consent | Not wired; borrower-supplied flag exists | No |
| MagicBlock PER batching | Not wired | No |
| MagicBlock VRF dummies | Not wired | No |
| MagicBlock Private Payments | Not wired; URL env var absent by default | No |
| Umbra stealth exits | Not wired; env-gated status only | No |
| Encrypt/FHE oracle or health computation | Not wired; pre-alpha endpoints/status scaffolding only | No |
| On-chain Groth16 verification | Not wired | No |
| Production trusted setup | Missing | No |
| Full private repayment | Not live | No |
| Full private borrow/withdraw flow | Not end-to-end verified | No |
| Local note/history encryption | Implemented | Yes, local-browser only |
| Fixed denominations | Implemented in code | Yes, as local program logic |

## Known Blockers

| Blocker | Impact |
|---|---|
| Full Anchor IDL generation blocked | Cannot rely on generated IDLs until Anchor/proc-macro2 issue is fixed |
| No `.ptau` file | Cannot generate Groth16 zkeys or verification keys |
| No `.zkey` files | Browser proof generation cannot complete |
| No `_vkey.json` files | Verification key export and on-chain verifier wiring are blocked |
| No Groth16 proof smoke test | Cannot claim proofs are usable |
| No on-chain verifier integration | Cannot claim withdrawal, collateral, or repay proofs are verified on-chain |
| No devnet deployment | Frontend transactions cannot execute against deployed programs |
| Frontend program IDs stale | Frontend does not target the synced Anchor IDs yet |
| ShieldedPool lending authority constant stale | Disburse PDA authority path needs a code follow-up before deployment |
| MagicBlock Private Payments URL missing | Private repayment rail unavailable |
| Umbra network/config not set | Stealth exits unavailable |
| IKA relay not wired | User wallet remains the signer for frontend transactions |
| PER not wired | No private batching or unified exit batching |

## Claim Policy

Safe wording:

- "Pre-alpha local scaffold."
- "Anchor programs compile and SBF artifacts are generated."
- "Circuits compile and browser WASM artifacts are generated."
- "Zkeys, verification keys, trusted setup, on-chain verification, external privacy rails, and devnet deployment are not live."

Unsafe wording:

- "Deposits are private."
- "Withdrawals are private."
- "Borrow/repay flows are private end-to-end."
- "Groth16 proofs are verified on-chain."
- "IKA, MagicBlock, Umbra, or Encrypt privacy is active."
- "Production privacy artifacts are ready."
