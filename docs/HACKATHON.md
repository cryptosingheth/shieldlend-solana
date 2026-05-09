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
| `lending_pool` | `HLtWrvLyc2SE3ERWHaEdY4RG84GxFfHv3Qf4NzJPxaF7` |

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
| **Encrypt** | Live pre-alpha gRPC `encrypt.v1.EncryptService/CreateInput` probe confirmed. Health-ratio test value submitted. Ciphertext handle returned: `5VZ8BhpSWqDCAXMMb4ESVGsQRKb6X9dDgD1xGLydCA6y`. Anchor 0.32.1 workspace compatibility is present. | On-chain FHE. `encrypt-anchor` CPI integration not yet wired. Production encryption guarantee. |
| **MagicBlock** | TEE RPC `https://devnet-tee.magicblock.app` HTTP 200. Router RPC `https://devnet-router.magicblock.app` HTTP 200. PER sidecar TypeScript builders: 4 ShieldLend use-case bundles, 17/17 pass. 13/13 SDK functions verified. Anchor 0.32.1 workspace compatibility is present. Private Payments API `https://payments.magicblock.app` health/challenge/login/mint/balance/builders live; wSOL deposit and withdraw signed and submitted on devnet; private-transfer tx submits through base devnet only after local blockhash refresh. | Rust PER macros not yet wired in Anchor programs. Private-transfer via intended `sendTo=ephemeral` path blocked: router returns `Blockhash not found`; TEE rejects writable accounts. TDX attestation challenge mismatch (SDK 0.8.8). On-chain PER transaction not submitted. |
| **IKA** | `@ika.xyz/sdk@0.4.0` + WASM loaded. SDK/capability probe: `createDWallet`, `approveMessage`, `createSignature`, `SignatureScheme` all present. WASM `createClassGroupsKeypair(ED25519)` runs locally. Official pre-alpha Solana source confirms `ika-dwallet-anchor`, program ID `87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY`, CPI authority seed `b"__ika_cpi_authority"`, and `approve_message(...)`. `lending_pool::approve_ika_borrow_message` is compile-wired through a local Anchor 0.32.1-compatible CPI crate adapted from the official source. | Real Solana relay signing. No live devnet `approve_message` CPI transaction submitted. Required external state is missing: IKA coordinator PDA, dWallet account controlled by the LendingPool CPI authority PDA, writable MessageApproval PDA, and an active ShieldLend loan with `future_sign_authorized=true`. IKA pre-alpha still uses a single mock signer, not production MPC. Direct wallet fallback is labelled "reduced privacy" in UI. |

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
- MagicBlock TEE RPC + Router RPC HTTP 200 on devnet.
- MagicBlock PER sidecar TypeScript SDK builders verified (not submitted on-chain).
- MagicBlock Private Payments public API health/challenge/login/mint/balance and unsigned transaction builders verified on devnet.
- MagicBlock Private Payments wSOL deposit and withdraw signed locally and submitted on devnet.
- MagicBlock Private Payments private-transfer transaction submitted only through base devnet after local blockhash refresh; this does not confirm the ephemeral/router private-transfer path.
- IKA SDK/capability probe and WASM confirmed.
- IKA Anchor CPI `approve_message` path compile-wired in `lending_pool` from official pre-alpha source.
- Frontend privacy status panel shows live-checked adapter status for all four rails.
- All four rail adapters present in `frontend/src/lib/privacyRails/`.

These claims are NOT accurate and must NOT be made:

- Production ZK trusted setup (DEV/TEST `pot14` ceremony only).
- Production privacy (no production trusted setup means no production ZK privacy guarantee).
- IKA relay signing active (direct wallet fallback only; compile-wired CPI has no live devnet approval tx).
- MagicBlock Private Payments private transfer via intended ephemeral/router path (builder returns 200; router submit blocks with `Blockhash not found`; TEE rejects writable accounts; base devnet accepts refreshed tx only — not the intended path).
- MagicBlock PER macros in Anchor programs (Anchor 0.32.1 compatibility exists, but macros are not wired).
- MagicBlock TDX attestation verified (challenge format mismatch).
- Umbra native SOL ShieldLend payout as protocol-level (flush_exits fail-closed; wSOL adapter is post-withdraw simulation, not on-chain program routing).
- Encrypt on-chain FHE active (Anchor 0.32.1 workspace compatibility present; `encrypt-anchor` CPI not yet wired).
- Any full end-to-end privacy rail active from deposit to encrypted exit.

---

## Implementation Blockers (Honest Findings)

These are engineering blockers discovered during integration, not design failures:

| Blocker | Root cause | Unblock path |
|---|---|---|
| Encrypt on-chain FHE | Workspace uses Anchor 0.32.1, but `encrypt-anchor` CPI is not yet wired | Pin/fork a compatible `encrypt-anchor` revision, wire one CPI path, rebuild, and re-run C2H |
| MagicBlock PER Rust macros | Workspace uses Anchor 0.32.1, but `#[ephemeral]`, `#[delegate]`, and `#[commit]` are not in ShieldLend programs yet | Wire PER macros in a dedicated task, rebuild, and re-run C2H |
| MagicBlock Private Payments private transfer submit | API returns unsigned `sendTo=ephemeral` transaction. Decoded tx blockhash matches API response, but router returns `Blockhash not found` and TEE rejects writable accounts. Base devnet accepts the refreshed tx, but that is not the intended ephemeral route. Deposit/withdraw remain live. | Confirm correct ephemeral submit RPC or API blockhash behavior with MagicBlock |
| MagicBlock TDX attestation | SDK 0.8.8 challenge format mismatch with current devnet TEE | Upgrade SDK or match challenge encoding |
| IKA Solana relay signing | `approve_message` CPI is compile-wired in `lending_pool`, but no real IKA coordinator/dWallet/MessageApproval accounts were supplied and no devnet CPI tx was submitted. The official pre-alpha crate targets Anchor v1, so ShieldLend uses a source-equivalent local crate for Anchor 0.32.1. | Obtain/create an IKA devnet dWallet whose authority is the LendingPool CPI authority PDA, provide coordinator + MessageApproval accounts, submit `approve_ika_borrow_message`, and record the tx signature before claiming live relay signing |
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
