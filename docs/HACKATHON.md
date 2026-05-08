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
| **Umbra** | `@umbra-privacy/sdk@4.0.0` installed. Funded devnet wSOL encrypted-balance deposit and withdrawal confirmed. Seven tx signatures on record. **wSOL Umbra settlement adapter**: two-step post-withdraw path (wrap SOL → wSOL → Umbra encrypted-balance) implemented in `scripts/devnet-wsol-umbra-roundtrip.mjs` and surfaced in the Withdraw UI as `wSOL via Umbra` mode. | Native protocol-level Umbra payout (flush_exits fail-closed; PER not wired). C2H payout SOL not physically transferred through Umbra by the on-chain program. |
| **Encrypt** | Live pre-alpha gRPC `encrypt.v1.EncryptService/CreateInput` probe confirmed. Health-ratio test value submitted. Ciphertext handle returned: `5VZ8BhpSWqDCAXMMb4ESVGsQRKb6X9dDgD1xGLydCA6y`. | On-chain FHE. `encrypt-anchor` CPI integration (blocked by Anchor 0.32.1 requirement). Production encryption guarantee. |
| **MagicBlock** | TEE RPC `https://devnet-tee.magicblock.app` HTTP 200. Router RPC `https://devnet-router.magicblock.app` HTTP 200. PER sidecar TypeScript builders: 4 ShieldLend use-case bundles, 17/17 pass. 13/13 SDK functions verified. | Rust PER macros in Anchor programs (blocked: Anchor 0.30.1 vs 0.32.1 required). Private Payments URL (requires Discord access). TDX attestation (challenge format mismatch with SDK 0.8.8). On-chain PER transaction submitted. |
| **IKA** | `@ika.xyz/sdk@0.4.0` + WASM loaded. SDK/capability probe: `createDWallet`, `approveMessage`, `createSignature`, `SignatureScheme` all present. WASM `createClassGroupsKeypair(ED25519)` runs locally. | Real Solana relay signing. `ika-dwallet-anchor` CPI crate not published. IKA SDK has no Solana code — all `coordinatorTransactions` functions call Sui Move targets. Direct wallet fallback is labelled "reduced privacy" in UI. |

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
- IKA SDK/capability probe and WASM confirmed.
- Frontend privacy status panel shows live-checked adapter status for all four rails.
- All four rail adapters present in `frontend/src/lib/privacyRails/`.

These claims are NOT accurate and must NOT be made:

- Production ZK trusted setup (DEV/TEST `pot14` ceremony only).
- Production privacy (no production trusted setup means no production ZK privacy guarantee).
- IKA relay signing active (direct wallet fallback only; no `ika-dwallet-anchor` CPI).
- MagicBlock Private Payments live (URL not configured; adapter fails closed).
- MagicBlock PER macros in Anchor programs (Anchor version gap: 0.30.1 vs 0.32.1 required).
- MagicBlock TDX attestation verified (challenge format mismatch).
- Umbra native SOL ShieldLend payout claimed as protocol-level (flush_exits fail-closed; wSOL adapter is post-withdraw simulation, not on-chain program routing).
- Encrypt on-chain FHE active (program-side FHE blocked by Anchor 0.32.1 requirement).
- Any full end-to-end privacy rail active from deposit to encrypted exit.

---

## Implementation Blockers (Honest Findings)

These are engineering blockers discovered during integration, not design failures:

| Blocker | Root cause | Unblock path |
|---|---|---|
| Encrypt on-chain FHE | `encrypt-anchor` requires Anchor 0.32.1; workspace uses 0.30.1 to protect confirmed Groth16 round-trip | Isolated Anchor 0.32 sidecar program; re-run C2H devnet round-trip after upgrade |
| MagicBlock PER Rust macros | Same Anchor version gap | Same isolated upgrade path |
| MagicBlock Private Payments | Discord-gated devnet URL | Join MagicBlock Discord; request `NEXT_PUBLIC_MAGICBLOCK_PRIVATE_PAYMENTS_URL` |
| MagicBlock TDX attestation | SDK 0.8.8 challenge format mismatch with current devnet TEE | Upgrade SDK or match challenge encoding |
| IKA Solana relay signing | `ika-dwallet-anchor` CPI crate not published; IKA SDK calls Sui Move, not Solana | Wait for IKA Solana CPI crate; or implement Sui-side relay adapter |
| Umbra native SOL payout (protocol-level) | flush_exits fail-closed (PER adapter not wired); wSOL adapter is post-withdraw simulation | Wire flush_exits with PER adapter + anchor-spl ATA leg in ShieldedPool; or use wSOL adapter as demo boundary |

---

## Architecture References

- Track design details: this document, Sections above
- Implementation status full ledger: [`docs/IMPLEMENTATION_STATUS.md`](IMPLEMENTATION_STATUS.md)
- ZK circuit design: [`docs/architecture.md`](architecture.md)
- Privacy threat model: [`docs/PRIVACY_AND_THREAT_MODEL.md`](PRIVACY_AND_THREAT_MODEL.md)
- Demo instructions: [`docs/DEMO_SCRIPT.md`](DEMO_SCRIPT.md)
- Submission checklist: [`docs/SUBMISSION_CHECKLIST.md`](SUBMISSION_CHECKLIST.md)
