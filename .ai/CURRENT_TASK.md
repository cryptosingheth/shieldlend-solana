# Current Task

## Status: Privacy rails integration merge COMPLETE on `convergence/privacy-rails-integration`.

## Active Objective

All four privacy rail branches merged. Pending: final validation + commit.

## Completed Rail Work

### Encrypt rail (97ec94d)
- gRPC `CreateInput` live probe confirmed. Active key: `f00f3465...`. Ciphertext: `5VZ8BhpS...`
- Program-side FHE: fail-closed. Anchor 0.32 sidecar blocked.

### Umbra rail (b3a63c1)
- `@umbra-privacy/sdk@4.0.0`. Devnet funded wSOL deposit/withdraw confirmed.
- ShieldLend C2H still native SOL direct `stealth_address`; wSOL/SPL bridge needed.

### MagicBlock rail (8d31e20)
- TEE RPC + Router RPC HTTP 200. SDK PER sidecar smoke: 17 pass, 0 fail.
- Rust PER macros blocked (Anchor 0.32.1). Private Payments URL absent.

### IKA rail (bb27511)
- `@ika.xyz/sdk@0.4.0`. SDK/capability probe confirmed.
- Real Solana signing blocked: `ika-dwallet-anchor` CPI not wired; mock signer only (pre-alpha).
- Direct wallet fallback labelled "reduced privacy" in deposit screen.

### C2H baseline (8555e6b — unchanged)
- Full deposit → flush_epoch → store_withdraw_proof → withdraw round-trip confirmed on devnet.
- On-chain Groth16 BN254 verification: 198,502 CU consumed, pairing passed.

## Deployed Programs (Devnet)

| Program | Program ID | Status |
|---|---|---|
| `nullifier_registry` | `E42nSmqvSCuC1EWbmzYqsdLHimBMeuZyir5dB5gE24rF` | Deployed |
| `shielded_pool` | `9Bvt3jMawHFRRxpaQTtV5VvFdpZkmAZtvwjTrAX9TAtE` | Deployed + upgraded |
| `lending_pool` | `HLtWrvLyc2SE3ERWHaEdY4RG84GxFfHv3Qf4NzJPxaF7` | Deployed |

## Hard Constraints

- Do not claim production FHE privacy.
- Do not submit sensitive user data to Encrypt pre-alpha.
- Do not break C2H Groth16 withdraw round-trip.
- Do not fake IKA relay signing, Umbra native SOL payout, MagicBlock Private Payments, or Encrypt on-chain FHE.
- Do not upgrade main Anchor version.
- Do not force MagicBlock PER macros into Anchor 0.30.1.
- Do not claim TDX attestation verified (challenge mismatch with SDK 0.8.8).
