# ShieldLend — Hackathon Submission

**Event**: Colosseum Frontier Hackathon 2026
**Branch**: `convergence/privacy-rails-integration`
**Integration commit**: `93375d4`

---

## One-liner

ShieldLend is a privacy-focused Solana lending protocol combining on-chain Groth16 withdraw proofs with external privacy rail integrations from Encrypt, Umbra, MagicBlock, and IKA.

---

## Tracks

| Track | Sponsor | ShieldLend integration |
|---|---|---|
| IKA + Encrypt Frontier | Superteam | dWallet relay authorization + FHE oracle/health computation + FHE aggregate solvency + three-step async liquidation + FutureSign |
| Colosseum Privacy Track | MagicBlock | PER deposit/exit batching + VRF dummy insertion + Private Payments repayment settlement |
| Umbra Side Track | Frontier | SPL/Token-2022 encrypted balances + mixer/UTXO paths + scoped disclosure |

---

## What Works on Devnet (Confirmed)

### ShieldLend Core (C2H)

All three Anchor programs are deployed on Solana devnet:

| Program | Program ID |
|---|---|
| `nullifier_registry` | `E42nSmqvSCuC1EWbmzYqsdLHimBMeuZyir5dB5gE24rF` |
| `shielded_pool` | `9Bvt3jMawHFRRxpaQTtV5VvFdpZkmAZtvwjTrAX9TAtE` |
| `lending_pool` | `J2yn42PLSiRvGEGj24Uj2q4QeGHZa1sbgzs5foLK81qn` |

Full withdraw round-trip confirmed on devnet:

```
deposit → flush_epoch → store_withdraw_proof → withdraw
```

On-chain Groth16 BN254 verification results:
- Pairing check: passed
- Proof consumed (nullifier registered)
- Nullifier registry CPI: succeeded
- Compute units: 198,502 CU

Trusted setup: DEV/TEST `pot14` ceremony only. Not production.

### Privacy Rail Status

| Rail | What is confirmed | What is not live |
|---|---|---|
| **C2H / Groth16** | Full devnet round-trip: deposit → flush_epoch → store_withdraw_proof → withdraw. On-chain BN254 pairing passed. 198,502 CU. Nullifier consumed. | Production trusted setup. Production privacy guarantee. |
| **Umbra** | `@umbra-privacy/sdk@4.0.0` installed. Funded devnet wSOL encrypted-balance deposit and withdrawal confirmed. Seven tx signatures on record. **wSOL Umbra settlement adapter**: two-step post-withdraw path (`scripts/devnet-wsol-umbra-roundtrip.mjs`) + Withdraw UI `wSOL via Umbra` mode. Phase 2 (wSOL wrap + Umbra deposit/withdraw) confirmed live on devnet. | Native protocol-level Umbra payout (flush_exits fail-closed; PER not wired). C2H payout SOL not physically transferred through Umbra by the on-chain program. Roundtrip script Phase 1 (C2H) FAILED with custom error `0x0` — C2H confirmed only via `devnet-fullround.mjs`. Use `SKIP_C2H=1` for Umbra-only demo runs. |
| **Encrypt** | Live pre-alpha gRPC `encrypt.v1.EncryptService/CreateInput` probe confirmed. Health-ratio test value submitted. Ciphertext handle returned: `DX9ipt7WY1tCXFSv14oWwmZ3a19Ls9aUnSTPfiUUQwEZ`. Official upstream `encrypt-anchor` CPI blocker is reproducible, and ShieldLend now vendors a minimal Anchor 0.32 compatibility fork that compile-wires a separate LendingPool request/reveal path. | On-chain FHE. Live Encrypt ciphertext/decryption-request account round-trip on devnet. Production encryption guarantee. |
| **MagicBlock** | TEE RPC `https://devnet-tee.magicblock.app` HTTP 200. Router RPC `https://devnet-router.magicblock.app` HTTP 200. PER sidecar TypeScript builders: 4 ShieldLend use-case bundles, 17/17 pass. 13/13 SDK functions verified. Anchor 0.32.1 workspace compatibility is present. Private Payments API `https://payments.magicblock.app` health/challenge/login/mint/balance/builders live; wSOL deposit and withdraw signed/submitted on devnet. The private-transfer harness now performs SOL -> wSOL, auth, mint check, deposit, public/private balance polling, transfer namespace probing, and a submitted `base -> ephemeral` top-up retry before transfer. | Rust PER macros not yet wired in Anchor programs. Private transfer is not live: neither deposit nor submitted `base -> ephemeral` top-up produces a usable private wSOL balance through `/v1/spl/private-balance`, and transfer execution fails with Token Program `0x1` InsufficientFunds; router also returns `Blockhash not found`. TDX attestation challenge format mismatch with SDK 0.8.8. |
| **IKA** | `@ika.xyz/sdk@0.4.0` + WASM loaded. SDK/capability probe: `createDWallet`, `approveMessage`, `createSignature`, `SignatureScheme` all present. WASM `createClassGroupsKeypair(ED25519)` runs locally. `lending_pool::approve_ika_borrow_message` CPI CONFIRMED on devnet (2026-05-11) — two tx signatures. Full flow: DKG → dWallet on-chain → authority transfer → `approve_ika_borrow_message` CPI → `MessageApproval` PDA created. | Real Solana relay signing end-to-end (gRPC presign/sign blocked by BCS schema mismatch). IKA pre-alpha still uses a single mock signer, not production MPC. Direct wallet fallback is labelled "reduced privacy" in UI. |

---

## Umbra Devnet Transaction Signatures

| Step | Signature |
|---|---|
| wSOL wrap + SyncNative | `cyQG7Bw7Skuu2QCMu8Gvmx5JSfbcSwGGD3utoRq7jm3iAkxKHCgKjXeGxjBBGL3ZWYYe1JTqykdAQFj5thw85As` |
| Umbra deposit queue | `SZeGJ9FMkhiAnz2hq9oeWSgX1pccrE5rCqgZWjUMd4pu7ZzaHrNM9K6aaMxqqNfZ1cYHWSvwYYAp5gJwhtTovyx` |
| Umbra deposit callback | `2nPcvgkfXhYWuAAxHfhjH8WCi4afguYbhqu3uYdpYgEH1As5jB8R2evfiUWXmFekz1CXfhB1HwHosiQKYGjCxMVL` |
| Umbra deposit rent reclaim | `2MFBu2kb2VFPHRRhDYK4ip9uwm3Vm8vaYGdhCogx9V4LBCwjw3nrjx1oY6JefQkRPX3T9P2ttcVPcw6L4Rkh7Uib` |
| Umbra withdraw queue | `yVdTJQi8DxnRyB1BBW2zkTenm7WhxXAqztXqoAsqUQdnEdKhqUBQrWACbMeLkdEGkCuGbPGKVYfGAVzRLLeHg5u` |
| Umbra withdraw callback | `31UinqaCswx1kNJGpZbGoFgr6AH8nrBfLMEhgm1z3FNgJdAtbjDsPxvbv3iC7r6i7DpR5t3YvUyMcpHUeD4HnVau` |
| Umbra withdraw rent reclaim | `4zm2xwJ4TfCGTTwtcG72wfj3xXjsYiDfNqZBRY1Kp2qyszwezjywjJCC63LphzUK9Qbs5jhbv37NLYEFcLfoqKEm` |

Devnet mint: `So11111111111111111111111111111111111111112` (wSOL)

---

## Claim Boundary

These claims are accurate and supported by devnet evidence:

- Three Anchor programs deployed on Solana devnet.
- Full Groth16 BN254 withdraw round-trip confirmed on devnet (DEV/TEST trusted setup).
- On-chain nullifier registry CPI succeeded; proof consumed.
- Umbra `@umbra-privacy/sdk@4.0.0` funded devnet deposit/withdraw confirmed for wSOL.
- Encrypt live pre-alpha gRPC `CreateInput` probe confirmed with returned ciphertext handle.
- Encrypt Anchor CPI compatibility probe added; it documents the current upstream AccountInfo crate-family blocker and the local compile-only compatibility fork.
- MagicBlock TEE RPC + Router RPC HTTP 200 on devnet.
- MagicBlock PER sidecar TypeScript SDK builders verified (not submitted on-chain).
- MagicBlock Private Payments public API health/challenge/login/mint/balance and unsigned transaction builders verified on devnet.
- MagicBlock Private Payments wSOL deposit and withdraw signed locally and submitted on devnet.
- MagicBlock Private Payments private-transfer harness now funds wSOL, logs in, checks mint initialization, deposits wSOL, polls public/private balances, probes transfer balance namespaces, submits the documented `base -> ephemeral` top-up route, and attempts transfer in the same owner/mint context.
- IKA SDK/capability probe and WASM confirmed.
- IKA Anchor CPI `approve_message` path compile-wired in `lending_pool` from official pre-alpha source.
- Frontend privacy status panel shows live-checked adapter status for all four rails.
- All four rail adapters present in `frontend/src/lib/privacyRails/`.

These claims are NOT accurate and must NOT be made:

- Production ZK trusted setup (DEV/TEST `pot14` ceremony only).
- Production privacy (no production trusted setup means no production ZK privacy guarantee).
- IKA relay signing active end-to-end (approval CPI confirmed on devnet 2026-05-11; gRPC presign/sign blocked by BCS schema mismatch; IKA pre-alpha is single mock signer, not production MPC).
- MagicBlock Private Payments private transfer through the intended ephemeral/router path (builder returns 200, but neither deposit nor submitted `base -> ephemeral` top-up produces a usable private wSOL balance; transfer execution fails with Token Program `0x1` InsufficientFunds; router also returns `Blockhash not found`).
- MagicBlock PER macros in Anchor programs (Anchor 0.32.1 compatibility present; macros are not wired).
- MagicBlock TDX attestation verified (challenge format mismatch).
- Umbra native SOL ShieldLend payout as protocol-level (flush_exits fail-closed; wSOL adapter is post-withdraw simulation, not on-chain program routing).
- Encrypt on-chain FHE active (local CPI wiring compiles, but upstream `encrypt-anchor` remains incompatible and no live devnet Encrypt decryption round-trip is proven).
- Any full end-to-end privacy rail active from deposit to encrypted exit.

---

## Implementation Blockers (Honest Findings)

These are engineering blockers discovered during integration, not design failures:

| Blocker | Root cause | Unblock path |
|---|---|---|
| Encrypt on-chain FHE | Official upstream `encrypt-anchor` still expects `solana_account_info` 3.1.x while Anchor 0.32.1 supplies 2.3.x. ShieldLend works around that today with a local Anchor 0.32 compatibility fork that only compile-wires a CPI request/reveal path. | Prove a real Encrypt devnet ciphertext + decryption-request round-trip through the new LendingPool path, then re-run C2H and keep claim boundaries honest |
| MagicBlock PER Rust macros | Workspace uses Anchor 0.32.1, but `#[ephemeral]`, `#[delegate]`, and `#[commit]` are not in ShieldLend programs yet | Wire PER macros in a dedicated task, rebuild, and re-run C2H |
| MagicBlock Private Payments private transfer balance | `--live-private-transfer` now runs SOL -> wSOL, login, mint check, deposit, private-balance polling, transfer namespace probing, and a submitted `base -> ephemeral` top-up retry. Deposit and top-up txs submit, but authenticated private-balance polling for the same owner/mint still returns `balance: "0"` and `location: "base"`; transfer then fails with Token Program `0x1` InsufficientFunds. | Confirm with MagicBlock whether deposit/top-up credit a different private-balance namespace/account context, whether `/v1/spl/private-balance` currently mirrors base balance only, or whether another public API/private-router path is required |
| MagicBlock Private Payments ephemeral submit | API returns unsigned `sendTo=ephemeral` transaction. Decoded tx blockhash matches API response, but base/TEE report it invalid and router submit still blocks with `Blockhash not found`. | Confirm correct ephemeral submit RPC or API blockhash behavior with MagicBlock |
| MagicBlock TDX attestation | SDK 0.8.8 challenge format mismatch with current devnet TEE | Upgrade SDK or match challenge encoding |
| IKA Solana relay signing | Real IKA devnet DKG, on-chain dWallet creation, fresh devnet loan creation, and dWallet authority transfer to the LendingPool CPI authority PDA are confirmed. The approval CPI still fails because the deployed `lending_pool` program does not yet include `approve_ika_borrow_message`. | Rebuild and redeploy `lending_pool` to devnet, then rerun `node scripts/ika-anchor-approval-smoke.mjs` to submit `approve_ika_borrow_message` and only then claim live relay signing |
| Umbra native SOL payout (protocol-level) | flush_exits fail-closed (PER adapter not wired); wSOL adapter is post-withdraw simulation | Wire flush_exits with PER adapter + anchor-spl ATA leg in ShieldedPool; or use wSOL adapter as demo boundary |

---

## Architecture References

- Track design details: this document, Sections above
- Implementation status full ledger: [`docs/IMPLEMENTATION_STATUS.md`](IMPLEMENTATION_STATUS.md)
- MagicBlock Private Payments live notes: [`docs/MAGICBLOCK_PRIVATE_PAYMENTS.md`](MAGICBLOCK_PRIVATE_PAYMENTS.md)
- ZK circuit design: [`docs/architecture.md`](architecture.md)
- Privacy threat model: [`docs/PRIVACY_AND_THREAT_MODEL.md`](PRIVACY_AND_THREAT_MODEL.md)
- Demo instructions: [`docs/DEMO_SCRIPT.md`](DEMO_SCRIPT.md)
- Submission checklist: [`docs/SUBMISSION_CHECKLIST.md`](SUBMISSION_CHECKLIST.md)
