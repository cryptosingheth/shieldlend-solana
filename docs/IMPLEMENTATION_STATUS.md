# ShieldLend Solana Implementation Status

Last reconciled: 2026-05-07 (C2H complete)

This is the canonical implementation ledger for the local repository. It
separates target architecture from implemented code, generated artifacts,
fail-closed scaffolding, missing integrations, and deployment status.

## Summary

| Area | Current local status | Claim boundary |
|---|---|---|
| Anchor programs | Compile to SBF with `anchor build --no-idl`; `.so` files exist in `target/deploy/` | Not deployed; full IDL generation is blocked |
| Program IDs | `Anchor.toml`, all three `declare_id!` values, frontend `PROGRAM_IDS`, and ShieldedPool's internal lending-pool PDA constant are synced with `anchor keys list` | Not deployed; synced local IDs are not proof of devnet readiness |
| ZK circuits | `withdraw_ring`, `collateral_ring`, and `repay_ring` compile; DEV/TEST browser WASM, zkey, and vkey artifacts are generated and hashed; local proof smoke tests pass | Production trusted setup is missing; on-chain verification is not wired or live |
| Frontend | Typechecks and builds; synced program IDs are exposed through `contracts.ts`; note/history vault encryption exists; privacy rail health is gated by env flags | Devnet execution is blocked by undeployed programs and missing external rails |
| External privacy rails | Adapter/status scaffolding exists for IKA, Encrypt, MagicBlock Private Payments, PER, VRF, and Umbra status flags | IKA relay, PER batching, Private Payments, Umbra exits, and Encrypt/FHE health computation are not live |
| Deployment | All three programs deployed to devnet; `initialize` confirmed; full round-trip (deposit → flush_epoch → store_proof → withdraw with on-chain Groth16 verification) confirmed on devnet | DEV/TEST trusted setup only; not production-ready |

## Verification Snapshot

| Command | Status | Notes |
|---|---|---|
| `pwd` | `/Users/opinderpreetsingh/projects/shieldlend-solana` | Canonical local checkout for this task |
| `git log --oneline -5` | includes C2, status reconciliation, and C2A.5 commits | Convergence history is present |
| `anchor keys list` | passed | IDs listed below |
| `find target/deploy -name "*.so"` | passed | Three `.so` files exist |
| `npm run circuits:compile` | known good | Re-run during C2B |
| `node scripts/generate-zk-artifacts.mjs` | known good | Generated DEV/TEST zkeys and vkeys during C2B |
| `npm run typecheck:frontend` | known good | TypeScript check passes |
| `npm run build:frontend` | known good | Next build passes with existing dependency warning |
| `cargo test --workspace` | known good | 47 Rust unit tests pass (38 prior + 9 C2F — proof account pattern tests) |
| `anchor build --no-idl` | known good | SBF build passes; zero stack-frame error diagnostics after C2G-A Box<Account> fix |
| `anchor deploy` (nullifier_registry) | **deployed** | Devnet slot 460526750; program ID `E42nSmqvSCuC1EWbmzYqsdLHimBMeuZyir5dB5gE24rF` |
| `anchor deploy` (shielded_pool) | **deployed** | Devnet slot 460526822; program ID `9Bvt3jMawHFRRxpaQTtV5VvFdpZkmAZtvwjTrAX9TAtE` |
| `anchor deploy` (lending_pool) | **deployed** | Program ID `HLtWrvLyc2SE3ERWHaEdY4RG84GxFfHv3Qf4NzJPxaF7`; deployed after wallet refill |
| `node scripts/devnet-smoke.mjs` | **confirmed** | store_withdraw_proof tx on devnet; sig 66Bmcz54... |

## Program IDs

| Program | Anchor ID source | Current ID | Status |
|---|---|---|---|
| `shielded_pool` | `Anchor.toml`, `programs/shielded_pool/src/lib.rs` | `9Bvt3jMawHFRRxpaQTtV5VvFdpZkmAZtvwjTrAX9TAtE` | Synced |
| `lending_pool` | `Anchor.toml`, `programs/lending_pool/src/lib.rs` | `HLtWrvLyc2SE3ERWHaEdY4RG84GxFfHv3Qf4NzJPxaF7` | Synced |
| `nullifier_registry` | `Anchor.toml`, `programs/nullifier_registry/src/lib.rs` | `E42nSmqvSCuC1EWbmzYqsdLHimBMeuZyir5dB5gE24rF` | Synced |

Additional synced references:

- `frontend/src/lib/contracts.ts` uses the same three IDs reported by local
  `anchor keys list`.
- `programs/shielded_pool/src/lib.rs` uses the synced `lending_pool` ID for
  `LENDING_POOL_PROGRAM_ID`, which drives the lending-pool authority PDA.

## Anchor Build And Deployment

| Item | Current status | Evidence |
|---|---|---|
| Solana CLI | Installed | Environment verified before C1/C2 |
| Anchor CLI | Installed, `0.30.1` | Environment verified before C1/C2 |
| `anchor build --no-idl` | Passes | Builds SBF artifacts without IDL generation |
| `.so` artifacts | Generated | `target/deploy/shielded_pool.so`, `lending_pool.so`, `nullifier_registry.so` |
| Full `anchor build` with IDL | Blocked | Anchor/proc-macro2 compatibility issue, intentionally out of scope |
| `nullifier_registry` devnet deploy | **Deployed** | Slot 460526750; ID `E42nSmqvSCuC1EWbmzYqsdLHimBMeuZyir5dB5gE24rF` |
| `shielded_pool` devnet deploy | **Deployed + upgraded** | Initial slot 460526822; upgraded (Vec capacity fix); ID `9Bvt3jMawHFRRxpaQTtV5VvFdpZkmAZtvwjTrAX9TAtE` |
| `lending_pool` devnet deploy | **Blocked** | Insufficient devnet SOL (~1.29 more needed); program otherwise build-ready |
| `store_withdraw_proof` smoke tx | **Confirmed** | `scripts/devnet-smoke.mjs`; sig `66Bmcz54...`; devnet |
| `shielded_pool::initialize` | **Confirmed** | sig `QMVjEr1d...`; pool state PDA created; devnet |
| `shielded_pool` Vec-capacity upgrade | **Deployed** | MAX_EPOCH_COMMITMENTS/MAX_EXIT_QUEUE 128→8; SPACE 14500→1900 bytes |
| End-to-end smoke (`devnet-e2e.mjs`) | **Confirmed** | init + store_proof + withdraw UnknownRoot guard; `scripts/devnet-e2e.mjs` |
| Full round-trip (`devnet-fullround.mjs`) | **Confirmed** | deposit + flush_epoch + store_proof + **withdraw with Groth16 verified on-chain** (198,502 CU); `scripts/devnet-fullround.mjs` |
| `nullifier_registry::update_authorized_programs` | **Confirmed** | Fixed authorized_programs list to contain registry_writer PDA addresses (not program IDs); sig `5nqg3EDx...` |
| On-chain Groth16 BN254 verification | **Confirmed** | DEV/TEST trusted setup; withdraw sig `3s7zqUmu...`; 198,502 CU consumed |

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
| Withdraw | `circuits/withdraw_ring.circom` | Recorded in `circuits/public_signals.json` | Generated and hashed | DEV/TEST generated and verified | DEV/TEST generated and hashed | Local smoke passed; on-chain not live |
| Collateral | `circuits/collateral_ring.circom` | Recorded in `circuits/public_signals.json` | Generated and hashed | DEV/TEST generated and verified | DEV/TEST generated and hashed | Local smoke passed; on-chain not live |
| Repay | `circuits/repay_ring.circom` | Recorded in `circuits/public_signals.json` | Generated and hashed | DEV/TEST generated and verified | DEV/TEST generated and hashed | Local smoke passed; on-chain not live |

Artifact details:

- `circuits/artifact_manifest.json` records WASM, zkey, and vkey hashes.
- DEV/TEST Powers of Tau: `circuits/keys/dev_pot14_final.ptau`, 18 MB,
  SHA-256 `3838aee2feec6518a6eb1198a04c74317652630fbaf5715870fbd1a32deaa18c`.
- This local `.ptau` is not a production trusted setup.
- Local witness generation, witness checks, proof generation, and Groth16
  verification passed for all three circuits.
- `groth16-solana = "0.0.3"` added to both program Cargo.toml files.
- Verifier modules generated (`programs/*/src/groth16_verifier.rs`) with real DEV/TEST vkeys and
  6 smoke tests (3 circuits × verify + mutate). All pass.
- DEV/TEST Groth16 verifier is **wired** to all three instruction handlers (`verify_withdraw_proof`, `verify_collateral_proof`, `verify_repay_proof`). Cross-field consistency guards in place.
- On-chain execution is blocked by B6 (transaction MTU — see `audit-reports/ONCHAIN_VERIFIER_BLOCKERS.md`).

## Implemented Code

| Area | Implemented locally |
|---|---|
| `shielded_pool` | Fixed denominations, deposit queue, root history, zero-root rejection, withdrawal/disbursement queues, DEV/TEST Groth16 withdraw verifier wired (cross-field consistency guards), nullifier registry CPI scaffolding after verifier gate; `groth16_verifier` module with real vkey and smoke+wiring tests; proof account PDA pattern (`ProofData`, `store_withdraw_proof`, consumed/kind/authority guards) |
| `lending_pool` | Interest model, loan PDA state, borrow/repay/liquidation skeleton, outstanding balance check, liquidation reveal binding checks, repay liquidation-state reset, DEV/TEST Groth16 collateral+repay verifiers wired (cross-field consistency guards), fail-closed payment/FHE verifiers, nullifier lock/unlock CPI scaffolding after verifier gates; `groth16_verifier` module with real vkeys and smoke+wiring tests; proof account PDA pattern (`ProofData` with `public_input_count`, `store_collateral_proof`, `store_repay_proof`, consumed/kind/authority guards) |
| `nullifier_registry` | Authorized writer config, Active/Locked/Spent state machine, `spend` requires Locked, unit tests |
| Frontend local security | AES-256-GCM note vault and encrypted history log |
| Frontend circuit interface | Poseidon commitment/nullifier helpers, real-ring requirement, snarkjs fullProve calls using manifest paths |

## Fail-Closed Or Scaffolded Logic

| Flow | Current code behavior |
|---|---|
| Withdraw proof verification | DEV/TEST Groth16 verifier wired; proof read from PDA; consumed/kind/authority guards; empty/mutated/mismatched proofs rejected |
| Borrow collateral proof verification | DEV/TEST Groth16 verifier wired; proof read from PDA; consumed/kind/authority guards |
| Repay proof verification | DEV/TEST Groth16 verifier wired; proof read from PDA; consumed/kind/authority guards |
| Private payment receipt verification | Fails closed with `PrivatePaymentVerifierNotWired` |
| Encrypt liquidation reveal verification | Fails closed with `EncryptVerifierNotWired` |
| PER exit flushing | Fails closed with `PerAdapterNotWired` unless queue is empty |
| Frontend proof generation | Has DEV/TEST browser artifacts; still requires real commitment ring provider for withdraw/collateral; synthetic decoys are rejected |

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
| On-chain Groth16 verification | DEV/TEST verifier confirmed on devnet; 198,502 CU; full withdraw round-trip passes; B7 stack frame resolved (C2G-A) | No — DEV/TEST trusted setup only; production ceremony required |
| Production trusted setup | Missing; DEV/TEST local setup only | No |
| Full private repayment | Not live | No |
| Full private borrow/withdraw flow | Not end-to-end verified | No |
| Local note/history encryption | Implemented | Yes, local-browser only |
| Fixed denominations | Implemented in code | Yes, as local program logic |

## Known Blockers

| Blocker | Impact |
|---|---|
| Full Anchor IDL generation blocked | Cannot rely on generated IDLs until Anchor/proc-macro2 issue is fixed |
| No production trusted setup | DEV/TEST artifacts cannot support production privacy claims |
| ~~Transaction MTU~~ | **Resolved (C2F)** — proof account PDA pattern implemented; all six instructions within 1232-byte MTU | See `audit-reports/ONCHAIN_VERIFIER_BLOCKERS.md` B6 |
| ~~BPF stack frame warnings (B7)~~ | **Resolved (C2G-A)** — `Box<Account>` applied to all four affected contexts; zero stack-frame error diagnostics in `anchor build --no-idl` | |
| ~~No integration test past UnknownRoot~~ | **Resolved (C2H)** — full deposit → flush_epoch → store_proof → withdraw round-trip confirmed on devnet with on-chain Groth16 verification |
| MagicBlock Private Payments URL missing | Private repayment rail unavailable |
| Umbra network/config not set | Stealth exits unavailable |
| IKA relay not wired | User wallet remains the signer for frontend transactions |
| PER not wired | No private batching or unified exit batching |

See `audit-reports/ONCHAIN_VERIFIER_BLOCKERS.md` for full C2C analysis with file/line evidence.

## Claim Policy

Safe wording:

- "Pre-alpha local scaffold."
- "Anchor programs compile and SBF artifacts are generated."
- "Circuits compile and DEV/TEST browser proving artifacts are generated."
- "Local DEV/TEST Groth16 proof smoke tests pass."
- "Production trusted setup, on-chain verification, external privacy rails, and devnet deployment are not live."

Unsafe wording:

- "Deposits are private."
- "Withdrawals are private."
- "Borrow/repay flows are private end-to-end."
- "Groth16 proofs are verified on-chain."
- "Production trusted setup is complete."
- "IKA, MagicBlock, Umbra, or Encrypt privacy is active."
- "Production privacy artifacts are ready."
