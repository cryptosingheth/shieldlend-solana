# Current Task

## Status: Privacy rails integration merge in progress on `convergence/privacy-rails-integration`.

## Active Objective

Merge all four privacy rail branches (encrypt, umbra, magicblock, ika) into this integration branch without breaking C2H devnet Groth16 withdraw proof milestone.

## Completed Rail Work

### Encrypt rail (97ec94d)
- `@encrypt.xyz/pre-alpha-solana-client@0.1.0` — gRPC `CreateInput` live probe confirmed.
- Active network key: `f00f3465b66ff8034600706ed05bf70ef5318edc511398085a3ab4512b875197`
- Health-ratio test ciphertext: `5VZ8BhpSWqDCAXMMb4ESVGsQRKb6X9dDgD1xGLydCA6y`
- Program-side Encrypt/FHE remains fail-closed (`LendingError::EncryptVerifierNotWired`).
- Anchor 0.32 sidecar blocked — feasibility check confirmed account-type conflicts.

### Umbra rail (b3a63c1)
- `@umbra-privacy/sdk@4.0.0` installed.
- Devnet program ID: `DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ`
- Funded devnet wSOL encrypted-balance deposit/withdraw confirmed.
- ShieldLend native SOL payout still uses direct `stealth_address`.

### MagicBlock rail (8d31e20)
- `@magicblock-labs/ephemeral-rollups-sdk@0.8.8` installed.
- TEE RPC `https://devnet-tee.magicblock.app` — HTTP 200 confirmed.
- Router RPC `https://devnet-router.magicblock.app` — HTTP 200 confirmed.
- `examples/magicblock-per-sidecar/` — full TypeScript PER sidecar with 4 ShieldLend use cases.
- `scripts/magicblock-per-smoke.mjs` — 17 pass, 0 fail.
- Live smoke blockers (expected/labeled): TDX attestation challenge mismatch, Anchor 0.32.1 macro requirement, Private Payments URL absent.

### C2H baseline (8555e6b — unchanged)
- Full deposit → flush_epoch → store_withdraw_proof → withdraw round-trip confirmed on devnet.
- On-chain Groth16 BN254 verification: 198,502 CU consumed, pairing passed.
- Sig `3s7zqUmu...`

## Deployed Programs (Devnet) — All Verified

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
- Do not upgrade main Anchor version or force MagicBlock PER macros into Anchor 0.30.1.
- Do not claim TDX attestation verified (challenge mismatch with SDK 0.8.8).
