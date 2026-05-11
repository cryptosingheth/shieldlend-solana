# ShieldLend Solana Implementation Status

Last reconciled: 2026-05-11 (IKA approve_ika_borrow_message CPI confirmed on devnet; Encrypt Anchor local compatibility fork compile-wired on live/encrypt-anchor 2026-05-09; MagicBlock private-transfer balance hardening 2026-05-10)

This is the canonical implementation ledger for the local repository. It
separates target architecture from implemented code, generated artifacts,
fail-closed scaffolding, missing integrations, and deployment status.

## Summary

| Area | Current local status | Claim boundary |
|---|---|---|
| Anchor programs | Local workspace upgraded to Anchor `0.32.1`; compiles to SBF with `anchor build --no-idl`; all three program IDs preserved | Upgraded binaries were not redeployed in this task; `anchor build --no-idl` still emits SBF syscall warnings that must be runtime-validated before redeploy |
| Program IDs | `Anchor.toml`, all three `declare_id!` values, frontend `PROGRAM_IDS`, and ShieldedPool's internal lending-pool PDA constant are synced with `anchor keys list` and confirmed by devnet deployment | All IDs verified on devnet |
| ZK circuits | `withdraw_ring`, `collateral_ring`, and `repay_ring` compile; DEV/TEST WASM, zkey, and vkey generated; on-chain Groth16 withdraw verification confirmed on devnet (DEV/TEST); borrow proof path now confirmed on devnet | Production trusted setup is missing; repay on-chain flow and full private borrow/disbursement remain unverified end to end |
| Frontend | Typechecks and builds; synced program IDs are exposed through `contracts.ts`; note/history vault encryption exists; privacy rail health is gated by env flags | Devnet execution is blocked by undeployed programs and missing external rails |
| External privacy rails | Umbra SDK funded wSOL deposit/withdraw confirmed; wSOL Umbra settlement adapter (Phase 2) confirmed; Encrypt gRPC CreateInput confirmed; official Encrypt Anchor CPI probe reproduces the AccountInfo crate-family blocker; ShieldLend vendors a minimal Anchor 0.32-compatible `encrypt-anchor` fork and compile-wires a separate LendingPool request/reveal path; MagicBlock TEE RPC reachable + TypeScript PER adapter live; MagicBlock Private Payments API + wSOL deposit/withdraw live on devnet; MagicBlock private-transfer harness now funds/deposits/checks balances and retries the documented `base -> ephemeral` route before transfer; IKA SDK/capability probe confirmed; IKA pre-alpha devnet DKG, on-chain dWallet creation, authority transfer, and `approve_ika_borrow_message` CPI all confirmed on devnet (2026-05-11); IKA gRPC presign/sign blocked by coordinator BCS schema mismatch | Anchor 0.32.1 workspace compatibility is present; IKA gRPC presign/sign flow blocked (coordinator BCS schema mismatch); ShieldLend-native Umbra payout, PER macros in programs, Private Payments private transfer via intended ephemeral/router RPC (neither deposit nor `base -> ephemeral` top-up exposes usable private wSOL balance), and live on-chain Encrypt/FHE health computation are not live |
| Deployment | All three programs deployed to devnet; `initialize` confirmed; full round-trip (deposit → flush_epoch → store_proof → withdraw with on-chain Groth16 verification) confirmed on devnet | DEV/TEST trusted setup only; not production-ready |

## Verification Snapshot

| Command | Status | Notes |
|---|---|---|
| `pwd` | `/Users/opinderpreetsingh/projects/shieldlend-solana` | Canonical local checkout for this task |
| `git log --oneline -5` | includes C2, status reconciliation, and C2A.5 commits | Convergence history is present |
| `anchor --version` | passed | `anchor-cli 0.32.1` |
| `anchor keys list` | previously passed | IDs listed below; not rerun as part of this upgrade |
| `find target/deploy -name "*.so"` | passed | Three `.so` files exist |
| `npm run circuits:compile` | known good | Re-run during C2B |
| `node scripts/generate-zk-artifacts.mjs` | known good | Generated DEV/TEST zkeys and vkeys during C2B |
| `npm run typecheck:frontend` | passed | TypeScript check passes |
| `npm run build:frontend` | passed | Next build passes with existing dependency warning |
| `cargo test --workspace` | passed on Anchor 0.32.1 | 47 Rust unit tests pass, including Groth16 verifier smoke and mutation tests |
| `anchor build --no-idl` | passed on Anchor 0.32.1 | SBF build passes; still emits existing macro cfg warnings plus SBF post-processing syscall warnings |
| `npm run check:encrypt-anchor` | pass with documented upstream blocker | Official upstream `encrypt-anchor` still fails at the CPI boundary because of `solana_account_info` 3.1.x vs 2.3.x; ShieldLend's local Anchor 0.32 compatibility fork compiles |
| `anchor deploy` (nullifier_registry) | **deployed** | Devnet slot 460526750; program ID `E42nSmqvSCuC1EWbmzYqsdLHimBMeuZyir5dB5gE24rF` |
| `anchor deploy` (shielded_pool) | **deployed** | Devnet slot 460526822; program ID `9Bvt3jMawHFRRxpaQTtV5VvFdpZkmAZtvwjTrAX9TAtE` |
| `anchor deploy` (lending_pool) | **deployed** | Program ID `J2yn42PLSiRvGEGj24Uj2q4QeGHZa1sbgzs5foLK81qn`; redeployed on devnet |
| `node scripts/devnet-smoke.mjs` | **confirmed** | store_withdraw_proof tx on devnet; sig 66Bmcz54... |
| `npm run check:umbra` | **confirmed** | SDK/package/program check passed; devnet indexer and relayer health returned 200 |
| `npm run smoke:umbra` | **confirmed** | SDK client init + devnet user query passed; no token action submitted |
| `npm run smoke:umbra-funded` | **confirmed** | wSOL wrap + Umbra encrypted-balance deposit + Umbra withdrawal passed on devnet |
| `npm run check:ika-cpi` | **confirmed local diagnostic** | Reports official IKA CPI constants, compile-level `lending_pool` wiring, derived CPI authority PDA, and the account/state shape for a real approval attempt |
| `node scripts/ika-anchor-approval-smoke.mjs` | **CONFIRMED on devnet (2026-05-11)** | Full flow: collateral proof + register + borrow + IKA DKG + dWallet on-chain + authority transfer + `approve_ika_borrow_message` CPI + `MessageApproval` PDA created. Approval tx 1: `m5trvfdGc2...WBF`; tx 2: `3AHThchU8E...bk2`. gRPC presign/sign step fails with `PresignForDWallet: unexpected end of input` — IKA coordinator BCS schema mismatch. |

## Program IDs

| Program | Anchor ID source | Current ID | Status |
|---|---|---|---|
| `shielded_pool` | `Anchor.toml`, `programs/shielded_pool/src/lib.rs` | `9Bvt3jMawHFRRxpaQTtV5VvFdpZkmAZtvwjTrAX9TAtE` | Synced |
| `lending_pool` | `Anchor.toml`, `programs/lending_pool/src/lib.rs` | `J2yn42PLSiRvGEGj24Uj2q4QeGHZa1sbgzs5foLK81qn` | Synced |
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
| Anchor CLI | Installed, `0.32.1` | `Anchor.toml` pins `anchor_version = "0.32.1"` |
| `anchor build --no-idl` | Passes | Builds SBF artifacts without IDL generation |
| `.so` artifacts | Generated | `target/deploy/shielded_pool.so`, `lending_pool.so`, `nullifier_registry.so` |
| Full `anchor build` with IDL | Not revalidated in this task | Upgrade validation used the requested `anchor build --no-idl` path |
| `nullifier_registry` devnet deploy | **Deployed** | Slot 460526750; ID `E42nSmqvSCuC1EWbmzYqsdLHimBMeuZyir5dB5gE24rF` |
| `shielded_pool` devnet deploy | **Deployed + upgraded** | Initial slot 460526822; upgraded (Vec capacity fix); ID `9Bvt3jMawHFRRxpaQTtV5VvFdpZkmAZtvwjTrAX9TAtE` |
| `lending_pool` devnet deploy | **Deployed** | Program ID `J2yn42PLSiRvGEGj24Uj2q4QeGHZa1sbgzs5foLK81qn`; redeployed on devnet |
| `store_withdraw_proof` smoke tx | **Confirmed** | `scripts/devnet-smoke.mjs`; sig `66Bmcz54...`; devnet |
| `shielded_pool::initialize` | **Confirmed** | sig `QMVjEr1d...`; pool state PDA created; devnet |
| `shielded_pool` Vec-capacity upgrade | **Deployed** | MAX_EPOCH_COMMITMENTS/MAX_EXIT_QUEUE 128→8; SPACE 14500→1900 bytes |
| End-to-end smoke (`devnet-e2e.mjs`) | **Confirmed** | init + store_proof + withdraw UnknownRoot guard; `scripts/devnet-e2e.mjs` |
| Full round-trip (`devnet-fullround.mjs`) | **Confirmed** | deposit + flush_epoch + store_proof + **withdraw with Groth16 verified on-chain** (198,502 CU); `scripts/devnet-fullround.mjs` |
| `nullifier_registry::update_authorized_programs` | **Confirmed** | Fixed authorized_programs list to contain registry_writer PDA addresses (not program IDs); sig `5nqg3EDx...` |
| On-chain Groth16 BN254 verification | **Confirmed** | DEV/TEST trusted setup; withdraw sig `3s7zqUmu...`; 198,502 CU consumed |
| Umbra funded devnet wSOL smoke | **Confirmed** | Mint `So11111111111111111111111111111111111111112`; deposit queue `SZeGJ9FM...`; withdraw queue `yVdTJQi...`; callbacks finalized |

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
| Withdraw | `circuits/withdraw_ring.circom` | Recorded in `circuits/public_signals.json` | Generated and hashed | DEV/TEST generated and verified | DEV/TEST generated and hashed | **On-chain confirmed devnet** (198,502 CU, C2H) |
| Collateral | `circuits/collateral_ring.circom` | Recorded in `circuits/public_signals.json` | Generated and hashed | DEV/TEST generated and verified | DEV/TEST generated and hashed | Wired in program; devnet end-to-end not yet run |
| Repay | `circuits/repay_ring.circom` | Recorded in `circuits/public_signals.json` | Generated and hashed | DEV/TEST generated and verified | DEV/TEST generated and hashed | Wired in program; devnet end-to-end not yet run |

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
- On-chain execution confirmed: B6 resolved (C2F); B7 resolved (C2G-A); full devnet round-trip confirmed (C2H). See `audit-reports/ONCHAIN_VERIFIER_BLOCKERS.md`.

## Implemented Code

| Area | Implemented locally |
|---|---|
| `shielded_pool` | Fixed denominations, deposit queue, root history, zero-root rejection, withdrawal/disbursement queues, DEV/TEST Groth16 withdraw verifier wired (cross-field consistency guards), nullifier registry CPI scaffolding after verifier gate; `groth16_verifier` module with real vkey and smoke+wiring tests; proof account PDA pattern (`ProofData`, `store_withdraw_proof`, consumed/kind/authority guards) |
| `lending_pool` | Interest model, loan PDA state, borrow/repay/liquidation skeleton, outstanding balance check, liquidation reveal binding checks, repay liquidation-state reset, DEV/TEST Groth16 collateral+repay verifiers wired (cross-field consistency guards), fail-closed payment verifier, legacy generic Encrypt verifier still fail-closed, separate compile-wired Encrypt CPI request/reveal path via local Anchor 0.32 fork, nullifier lock/unlock CPI scaffolding after verifier gates; `groth16_verifier` module with real vkeys and smoke+wiring tests; proof account PDA pattern (`ProofData` with `public_input_count`, `store_collateral_proof`, `store_repay_proof`, consumed/kind/authority guards) |
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
| Encrypt liquidation reveal verification | Legacy generic verifier still fails closed with `EncryptVerifierNotWired`; separate `request_liquidation_reveal_via_encrypt` / `verify_liquidation_reveal_via_encrypt` path compiles through the local Anchor 0.32 fork but is not proven live on devnet |
| PER exit flushing | Fails closed with `PerAdapterNotWired` unless queue is empty |
| Frontend proof generation | Has DEV/TEST browser artifacts; still requires real commitment ring provider for withdraw/collateral; synthetic decoys are rejected |

## Privacy Rails

| Privacy property or rail | Current status | Live claim allowed? |
|---|---|---|
| IKA relay signer privacy | `lending_pool::approve_ika_borrow_message` CPI CONFIRMED on devnet (2026-05-11). Full flow: DKG → dWallet on-chain → authority transfer to CPI PDA → `approve_ika_borrow_message` CPI → `MessageApproval` PDA created. Approval tx 1: `m5trvfdGc2AtqXh4chLoKdo5cXfCCL7mE3EB7tKHynGdDN5RV12SzpkQX2DgzAFiwzcLtYdQSgBJ1cPPbbj9WBF`. Approval tx 2: `3AHThchU8EAjQ2aYsbrDy212JJvHPE3ajtLx2ZLKVBxJnfSHnRTTUeZxX2en2zz4UGmUuzMjU3sgbV5J9bkKZbk2`. | IKA pre-alpha is a single mock signer, not production MPC; gRPC presign/sign blocked by coordinator BCS schema mismatch (`PresignForDWallet: unexpected end of input`) |
| IKA FutureSign liquidation consent | Fresh devnet loan creation confirmed with `future_sign_authorized=true`; approval CPI confirmed on devnet (2026-05-11) | gRPC sign flow not fully exercised; IKA pre-alpha mock signer only |
| MagicBlock PER batching | TypeScript adapter wired; TEE RPC live (HTTP 200); workspace now on Anchor 0.32.1 | No — Rust-side account delegation macros are still not wired |
| MagicBlock VRF dummies | Not wired | No |
| MagicBlock Private Payments | Public API wired; health/challenge/login/mint/balance/builders verified; wSOL deposit and withdraw submitted on devnet; `--live-private-transfer` now wraps/checks/deposits/polls, probes all private transfer balance namespaces, and retries `base -> ephemeral` before transfer | Partial — deposit/withdraw live, but neither deposit nor submitted `base -> ephemeral` top-up exposes usable private wSOL credit for transfer; intended ephemeral/router private-transfer submit still blocked; ShieldLend repayment binding not wired |
| Umbra SDK encrypted-balance token flow | Funded devnet wSOL deposit and withdrawal confirmed via `scripts/umbra-funded-smoke.mjs` | Yes — SDK-side wSOL encrypted-balance flow only |
| Umbra mixer/UTXO path | SDK functions exposed; compatible prover not installed | No |
| ShieldLend wSOL Umbra settlement adapter | Two-step post-withdraw adapter implemented: `scripts/devnet-wsol-umbra-roundtrip.mjs`. UI: Withdraw screen "wSOL via Umbra" mode with `WsolUmbraAdapterPanel` claim boundary. Phase 2 (wSOL wrap + Umbra deposit/withdraw) confirmed live. Phase 1 (C2H) failed with `0x0` in roundtrip script — use `SKIP_C2H=1` for demo; C2H confirmed separately via `devnet-fullround.mjs`. | Yes — post-withdraw simulation only; flush_exits fail-closed; Phase 1 C2H in roundtrip script failed |
| ShieldLend native SOL payout via Umbra (protocol-level) | Not wired; flush_exits fail-closed; C2H native SOL route preserved | No — requires PER adapter + SPL ATA leg in shielded_pool |
| Encrypt/FHE oracle or health computation | Client/gRPC CreateInput live; official upstream Anchor CPI probe blocked by AccountInfo crate-family mismatch; local compatibility fork compile-wires a separate LendingPool request/reveal path only | No |
| On-chain Groth16 verification | DEV/TEST verifier confirmed on devnet; 198,502 CU; full withdraw round-trip passes; B7 stack frame resolved (C2G-A) | No — DEV/TEST trusted setup only; production ceremony required |
| Production trusted setup | Missing; DEV/TEST local setup only | No |
| Full private repayment | Not live | No |
| Full private withdraw flow (DEV/TEST) | Devnet round-trip confirmed (C2H) — privacy rails not wired | No — DEV/TEST only; IKA/PER/Umbra not active |
| Full private borrow flow | Not end-to-end verified on devnet | No |
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
| MagicBlock Private Payments private transfer balance | `--live-private-transfer` now performs SOL -> wSOL, login/auth, wSOL mint check, deposit, public/private balance polling, probes all `fromBalance`/`toBalance` transfer builder routes, submits the documented `base -> ephemeral` top-up route, and then attempts transfer. Deposit and top-up txs submit on devnet, but authenticated private-balance polling for the same owner/mint still returns `balance: "0"` and `location: "base"` after six attempts; transfer execution then fails with Token Program `0x1` InsufficientFunds. Classification: `magicblock_api_router_tee_limitation`. |
| MagicBlock Private Payments ephemeral submit | API returns unsigned `sendTo=ephemeral` private-transfer transaction. The decoded transaction blockhash matches the API blockhash, but base/TEE report it invalid. Router submit still leaves `Blockhash not found`. |
| MagicBlock PER macros not wired | Anchor 0.32.1 compatibility is present in the workspace, but `#[ephemeral]`, `#[delegate]`, and `#[commit]` are not in ShieldLend programs yet. Wire separately and re-run C2H after any program-side change. |
| ShieldLend native SOL -> Umbra token settlement (protocol-level) | flush_exits fail-closed (PER not wired); wSOL adapter (`devnet-wsol-umbra-roundtrip.mjs`) is a post-withdraw simulation, not on-chain program routing |
| Umbra NEXT_PUBLIC_UMBRA_ENABLED not set | Stealth exits remain fail-closed in the frontend |
| IKA gRPC presign/sign schema mismatch | `approve_ika_borrow_message` CPI confirmed on devnet. Remaining gap: `PresignForDWallet` gRPC call returns `invalid signed_request_data: unexpected end of input` (gRPC code 3). Root cause: our local BCS schema for `SignedRequestData { PresignForDWallet }` does not match the current IKA pre-alpha coordinator's expected schema (extra/missing fields or different field order). Cannot resolve without IKA pre-alpha Rust BCS source. |
| PER not wired | No private batching or unified exit batching |
| Encrypt Anchor upstream incompatibility | Current official `encrypt-anchor` uses `solana_account_info` 3.1.x at `EncryptContext`; ShieldLend Anchor 0.32.1 accounts use 2.3.x. ShieldLend vendors a local Anchor 0.32 compatibility fork to compile a separate request/reveal path, but upstream remains incompatible and no live devnet Encrypt decryption round-trip is proven. |

See `audit-reports/ONCHAIN_VERIFIER_BLOCKERS.md` for full C2C analysis with file/line evidence.

## MagicBlock Rail Integration (rail/magicblock, 2026-05-08)

### What is live

| Component | Status | Evidence |
|---|---|---|
| SDK installed | `@magicblock-labs/ephemeral-rollups-sdk@0.8.8` | `npm install --workspace frontend` |
| TEE RPC reachable | HTTP 200 from `https://devnet-tee.magicblock.app` | `scripts/check-magicblock.mjs` |
| Router RPC reachable | HTTP 200 from `https://devnet-router.magicblock.app` | `scripts/check-magicblock.mjs` |
| Program IDs verified | Permission `ACLseo...`, Delegation `DELeGG...` match SDK constants | `scripts/check-magicblock.mjs` |
| SDK functions present | 13 of 13 expected functions verified in SDK 0.8.8 | `scripts/check-magicblock.mjs` |
| TypeScript adapter | `frontend/src/lib/privacyRails/magicblock.ts` | TEE verify, auth token, permission instructions, Private Payments API |
| Permission instruction builder | `buildCreatePermissionInstruction` | Unsigned `TransactionInstruction` via SDK |
| Delegation instruction builder | `buildDelegatePermissionInstruction` | Unsigned `TransactionInstruction` via SDK |
| Commit/undelegate builder | `buildCommitAndUndelegatePermissionInstruction` | Unsigned `TransactionInstruction` via SDK |
| Permission PDA deriver | `derivePermissionPda(account)` | `permissionPdaFromAccount` from SDK |
| Private Payments adapter | `/v1/spl` challenge/login/mint/balance/deposit/transfer/withdraw typed client | Defaults to public API; fails closed with exact HTTP status/body on rejection |
| Live status check | `getMagicBlockLiveStatus()` | Async; tests TEE + config |
| Check script | `scripts/check-magicblock.mjs` | Runs live, reports status |

### MagicBlock Private Payments Live SPL API (2026-05-08)

| Check | Status | Evidence |
|---|---|---|
| API health | Live | `GET https://payments.magicblock.app/health` -> `200 {"status":"ok"}` |
| Challenge/login | Live | `GET /v1/spl/challenge` and `POST /v1/spl/login` returned 200 for local devnet wallet; bearer token redacted |
| wSOL mint initialized | Live | `GET /v1/spl/is-mint-initialized` returned `initialized=true`, transfer queue `BPLzXbpayTxP8KVoNtV2uTKyrY7fErS7xdTx6LF82Nua` |
| Public transfer builder | Live builder | `POST /v1/spl/transfer` with `visibility=public` returned unsigned legacy tx, `sendTo=base` |
| Deposit builder + submit | Live | wSOL deposit submitted on devnet |
| Private transfer builder | Live builder | `POST /v1/spl/transfer` with `visibility=private` returned unsigned legacy tx, `sendTo=ephemeral` |
| Private transfer funded path | Blocked | `--live-private-transfer` deposits wSOL and submits the documented `base -> ephemeral` top-up route, but authenticated private-balance polling still returns `balance: "0"`/`location: "base"` for the same owner/mint; transfer fails with Token Program `0x1` InsufficientFunds |
| Private transfer ephemeral submit | Blocked | Router still fails with `Blockhash not found`; TEE/base attempts reach Token Program `0x1` after the funded deposit path |
| Withdraw builder + submit | Live | wSOL withdraw submitted on devnet |
| MCP route | Blocked/not exposed | `GET /v1/mcp` returned `404 {"error":{"code":"NOT_FOUND","message":"Route not found"}}` |

Live tx signatures from minimized wSOL flow (`--amount-base-units=1`):

| Step | Signature |
|---|---|
| wSOL wrap | `2q5FC6r6HpR2FmKt9nfB1ZjHEYEgAszzBCe73NVxiCeyoYDhd3dePdHVLuJetsWmbWYW2svstPNUpjEf9ZwPPhuP` |
| MagicBlock Private Payments deposit | `UtqpXCERPPZoP1HNPXzj1Frmh7MtqXGiE66GMnpZvvrziNQL1YrWVzFfShYB4EU4HAnofmdeJXNhjb1C96XPFct` |
| MagicBlock Private Payments withdraw | `4FXm5NYmEf9gTXdGWGUiHB7BzEEXTaAB1WW6GhDS6QN4XKmEtH9Cw9hkRBAsqxHST2M9En39MTwfbLqNV5c9WRpP` |
| Historical private-transfer base-RPC diagnostic only | `2BA9bAEk78cxfDHDqDDHaGs6CsbYdSXn17hGEV7DHitWm873CNSecigThUvqwJEa9oX6q8btGKfPAmrC2MnvtV1s` |

Latest 2026-05-10 live hardening signatures (`--amount-base-units=1000000` default):

| Step | Signature |
|---|---|
| wSOL wrap + SyncNative | `Z9YyUK7y7iUwkKQo73chxngq9V2X45Q6Emrv6KRJoKj2roZjibH6nWnSruB8kPf3X4ZnXqFb6ehCjZQviQMFVM1` |
| Deposit/withdraw check deposit | `28hBK6aKZzYoZ5uYynu2QkYG5sLJ7zWAiEacTodfFN22cvCcb4Meu57xEcEeFLFJwqBUL1yGLn9Mn2R5wdE3LgZF` |
| Deposit/withdraw check withdraw | `5SiFVzahhkmQaD8uM4qhWWgTBhKDjcEccm6ui7L4ryAtZJiygZGnUQ1fNDuP9K9w9eFe5rUtyibR3hoc96hQHBBn` |
| Funded private-transfer check deposit | `51eRJbsp8mDMGRcacCmwtf6BV84Mgo5V28D6GRLygBqbrmnbXQHL3CPNJEM9E7JPBS5wCRGAHDcWxi3frCQRsiFZ` |
| Funded private-transfer retry wSOL wrap | `2hCZ9opwH4L9mhgGV6rsQSRP7R6QGn7ddhpVKirLUg5Q2Daj9awvHBPoAEi8EhtYpgqykBzA9ZEdETR2xV4KttBX` |
| Funded private-transfer retry deposit | `4kiDc7ZgQ4XU3KMGqHK4VodAorK9BTtGbfLrVi9Rhi5dBpcfqGTh7GVTwPjDf6WpPjHTBcgZ1eokjNc2i2u3JdDs` |
| Private-transfer namespace retry deposit | `3PZH1cguYCd9QUb5Rdvb72So59UbNrfriYbrUdZyGf1YvEm7WgCyHKLbxrZdbx1zFEwZWuMMXdzuxJbXzh8ry7ed` |
| Private-transfer namespace retry wSOL wrap | `XRAyJP9aKLU9pBetQPAjxn276xWMEtsrEBXKJBDKg6cUQyftxz1rvhai5L2mnbBpKBpj5ePenKVSUMo5NEAfwRf` |
| Private-transfer namespace retry `base -> ephemeral` top-up | `34r7RQe2Acea6VCn3TLLCQJYUB6VjBPukWqt63c7uQEEkYWbSwgwrSaJNLVg74HLAuW9jrRn2fPkL81LtDogRHL9` |

See [`docs/MAGICBLOCK_PRIVATE_PAYMENTS.md`](MAGICBLOCK_PRIVATE_PAYMENTS.md) for the exact endpoint list, script modes, and blocker text.

### What is blocked and why

| Blocker | Root cause | Unblock path |
|---|---|---|
| TDX attestation (`verifyTeeRpcIntegrity`) | Returns exception: `challenge must decode to 64 bytes` — minor API delta between SDK 0.8.8 and current devnet TEE | Update SDK to latest patch or contact MagicBlock re: challenge format |
| Rust PER macros (`#[ephemeral]`, `#[delegate]`, `#[commit]`) | Workspace uses Anchor 0.32.1, but macros are not wired into ShieldLend programs | Separate program-side integration task; re-run C2H devnet round-trip before redeploy/claim |
| Private Payments private transfer balance/submit | `POST /v1/spl/transfer` returns an unsigned `sendTo=ephemeral` transaction. The funded path deposits wSOL and submits the documented `base -> ephemeral` top-up route, but authenticated private-balance polling still returns `balance: "0"`/`location: "base"` for the same owner/mint. Transfer attempts fail with router `Blockhash not found` and Token Program `0x1` InsufficientFunds. | Confirm the required private balance namespace/account context and correct ephemeral submit RPC with MagicBlock |
| Account delegation in `shielded_pool` | Rust macros not yet wired | Wire PER macros in a dedicated program-side integration task |
| MagicBlock VRF | SDK has no VRF module in 0.8.x | Separate VRF integration task; may require different SDK or on-chain program CPI |

### Safe claim wording (MagicBlock)

- "MagicBlock SDK 0.8.8 is integrated. TEE RPC endpoint is reachable on devnet."
- "Permission and delegation instruction builders are wired (TypeScript). Account delegation macros are not yet wired into ShieldLend programs."
- "Private Payments public API is integrated. wSOL deposit and withdraw are confirmed on devnet. The funded private-transfer path now reaches the real Token Program failure: after deposit and submitted `base -> ephemeral` top-up, the authenticated private-balance endpoint does not show sufficient private wSOL and transfer fails with `0x1` InsufficientFunds."
- "Anchor 0.32.1 workspace compatibility is present, but Rust PER account delegation is not live."

### Unsafe wording (do not use)

- "PER deposit batching is active."
- "Deposits are processed inside TDX enclave."
- "TDX attestation verified." (attestation call throws on challenge format mismatch)
- "Full Private Payments flow is live end-to-end." (the intended ephemeral/router private-transfer path is blocked)

---

## Claim Policy

Safe wording:

- "All three programs are deployed on devnet."
- "On-chain Groth16 BN254 withdraw verification confirmed on devnet (DEV/TEST trusted setup only)."
- "DEV/TEST zkeys and vkeys generated; production trusted setup is missing."
- "Borrow and repay verifiers are wired; devnet end-to-end flows not yet exercised."
- "Umbra SDK funded wSOL encrypted-balance deposit and withdrawal are confirmed on devnet."
- "ShieldLend native SOL C2H withdraw is not Umbra-routed yet; it needs a wSOL/SPL settlement bridge."
- "External privacy rails are partially integrated: MagicBlock Private Payments deposit/withdraw and Umbra SDK-side wSOL flows are live; IKA relay signing, MagicBlock PER Rust macros/private-transfer private balance credit, ShieldLend-native Umbra payout, and Encrypt/FHE remain blocked."

Unsafe wording (do not use):

- "Deposits are private."
- "Withdrawals are private."
- "Borrow/repay flows are private end-to-end."
- "Groth16 proofs are verified on-chain." (partial truth — withdraw only, DEV/TEST only; say it precisely)
- "Production trusted setup is complete."
- "IKA, MagicBlock, Umbra, or Encrypt privacy is active."
- "Native SOL ShieldLend withdrawals are fully Umbra-routed."
- "Production privacy artifacts are ready."
- "On-chain privacy is live." (privacy rails are not wired; Groth16 verification alone is not end-to-end privacy)
