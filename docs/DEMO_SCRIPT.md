# ShieldLend — Demo Script

**Branch**: `convergence/privacy-rails-integration`
**Integration commit**: `93375d4`

---

## Prerequisites

```bash
node --version      # >= 18
anchor --version    # 0.30.1
solana --version    # 1.18.x+
```

Environment file — copy and fill in:

```bash
cp .env.example .env
```

Minimum variables for the demo:

```
SOLANA_CLUSTER=devnet
SOLANA_WALLET_PATH=~/.config/solana/id.json
NEXT_PUBLIC_SOLANA_CLUSTER=devnet
# Optional — enables MagicBlock Private Payments check:
# NEXT_PUBLIC_MAGICBLOCK_PRIVATE_PAYMENTS_URL=<discord-gated>
```

---

## Step 1 — Run the Demo Status Check

This script is the single source of truth for what is live at this commit.

```bash
node scripts/demo-status.mjs
```

It will print:
- Current branch and commit hash
- ZK artifact manifest SHA256 hashes
- Deployed program IDs from Anchor.toml
- Which rail check scripts are available
- Final hackathon claim boundary

Run this before anything else. If it prints warnings, read them before proceeding.

---

## Step 2 — TypeScript / Frontend Build

Verify that the frontend compiles clean:

```bash
npm run typecheck:frontend
npm run build:frontend
```

Both should exit 0 with no errors.

---

## Step 3 — C2H Devnet Status Check (Non-Destructive)

Check the deployed programs on devnet:

```bash
solana balance --url devnet
solana program show 9Bvt3jMawHFRRxpaQTtV5VvFdpZkmAZtvwjTrAX9TAtE --url devnet   # shielded_pool
solana program show HLtWrvLyc2SE3ERWHaEdY4RG84GxFfHv3Qf4NzJPxaF7 --url devnet   # lending_pool
solana program show E42nSmqvSCuC1EWbmzYqsdLHimBMeuZyir5dB5gE24rF --url devnet   # nullifier_registry
```

The confirmed devnet round-trip result (already on-chain — do not re-run during demo):

```
deposit → flush_epoch → store_withdraw_proof → withdraw
On-chain Groth16 BN254: PASSED — 198,502 CU
Nullifier registry CPI: SUCCEEDED
Proof consumed: YES
```

> Do not re-run `devnet-fullround.mjs` during a live demo — it submits real transactions
> and costs devnet SOL. Show the existing devnet transaction signatures instead.

---

## Step 4 — Privacy Rail Status Checks

Run each rail check in order. All are non-destructive reads.

### Encrypt

```bash
node scripts/check-encrypt.mjs
```

Expected output: gRPC endpoint reachable, active network key present, ciphertext handle from health-ratio probe.

Confirm: endpoint `pre-alpha-dev-1.encrypt.ika-network.net:443` responds, ciphertext handle `5VZ8BhpSWqDCAXMMb4ESVGsQRKb6X9dDgD1xGLydCA6y` matches session handoff.

### Umbra

```bash
node scripts/check-umbra.mjs
```

Expected output: SDK version `4.0.0`, devnet program ID `DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ`, seven funded devnet transaction signatures printed.

> The funded wSOL deposit/withdraw was already executed. Do not re-run `umbra-funded-smoke.mjs`
> during the demo — it moves real devnet wSOL.

### MagicBlock

```bash
node scripts/check-magicblock.mjs
```

Expected output:
- SDK `@magicblock-labs/ephemeral-rollups-sdk@0.8.8` confirmed
- TEE RPC: HTTP 200
- Router RPC: HTTP 200
- 13/13 SDK functions verified
- Warn: TDX attestation challenge mismatch (expected — do not hide this)
- Warn: Private Payments URL not set (expected — requires Discord access)
- Warn: Anchor version gap 0.30.1 → 0.32.1 (expected — Rust macros blocked)

### IKA

```bash
node scripts/check-ika.mjs
```

Expected output: SDK loaded, WASM functional (`createClassGroupsKeypair` succeeds), capability probe passes for all four IKA functions, three documented Solana blockers (B1/B2/B3) printed with source evidence.

---

## Step 5 — Start the Frontend

```bash
npm run dev
```

Open `http://localhost:3000` in a browser.

Navigate to the Privacy Status panel (slide-over or status page). It shows the live-checked status of all four privacy rails:

| Panel entry | Expected status |
|---|---|
| C2H / Groth16 | Green — devnet round-trip confirmed |
| Umbra | Yellow — funded devnet wSOL confirmed; native SOL payout bridge needed |
| Encrypt | Yellow — gRPC probe confirmed; on-chain FHE fail-closed |
| MagicBlock | Yellow — TEE + Router HTTP 200; Rust macros and Private Payments blocked |
| IKA | Yellow — SDK/WASM probe confirmed; Solana relay signing blocked |

Yellow statuses are expected and honest. Do not attempt to make them green by hiding blockers.

### Demo flow to show in frontend:

1. Open the Deposit screen — show the privacy mode selector (IKA relay mode labelled "reduced privacy" with direct wallet).
2. Open the Privacy Status panel — show all rail statuses populated from live checks.
3. Open the Withdraw screen — show the Groth16 proof mode and the stealth address output field.
4. If showing a Borrow screen — point out the LTV guard and that collateral health is checked against ring-proof constraints (circuit wired; FHE health check not live).

---

## What NOT to Claim During the Demo

Read this list before going live:

- Do NOT say the ZK trusted setup is production-grade. The ceremony used `pot14` (DEV/TEST). State: "DEV/TEST trusted setup — not production."
- Do NOT say IKA relay signing is active. The deposit uses direct wallet fallback. State: "IKA SDK probed and blockers documented — Solana CPI crate not yet published."
- Do NOT say MagicBlock PER is running inside a ShieldLend transaction. The Rust macros are blocked. State: "TEE RPC reachable — Rust PER macros blocked by Anchor version gap."
- Do NOT say MagicBlock Private Payments is live. The URL is Discord-gated. State: "Adapter wired and fail-closed — Private Payments URL requires Discord access."
- Do NOT say Umbra is handling the ShieldLend withdraw output. C2H native SOL exits directly. State: "Umbra funded wSOL deposit/withdraw confirmed — ShieldLend C2H payout bridge not yet implemented."
- Do NOT say Encrypt FHE is computing health factors on-chain. The Anchor integration is blocked. State: "Encrypt gRPC probe confirmed — on-chain FHE blocked by Anchor version gap."

---

## Honest Framing Script (for judges)

> "ShieldLend wires four privacy protocols into a Solana lending protocol. On-chain Groth16 BN254 withdrawal verification is confirmed on devnet — deposit, epoch flush, withdraw proof storage, and withdrawal all complete in sequence with 198,502 CU consumed. Umbra encrypted-balance deposit and withdrawal are confirmed on devnet for wSOL. Encrypt pre-alpha gRPC is live and returned a ciphertext handle for a health-ratio input. MagicBlock TEE and Router RPCs respond on devnet with HTTP 200, and the PER SDK builders are verified across 13 functions. IKA SDK and WASM load and the capability probe passes — Solana relay signing is blocked by a missing CPI crate, which is an IKA pre-alpha limitation we documented with source evidence. Every blocker is an engineering gap, not a design gap."

---

## Commands Summary

```bash
# Status
node scripts/demo-status.mjs

# Build
npm run typecheck:frontend
npm run build:frontend

# Rail checks (non-destructive)
node scripts/check-encrypt.mjs
node scripts/check-umbra.mjs
node scripts/check-magicblock.mjs
node scripts/check-ika.mjs

# Frontend
npm run dev

# Program verification (non-destructive, reads devnet state)
solana program show 9Bvt3jMawHFRRxpaQTtV5VvFdpZkmAZtvwjTrAX9TAtE --url devnet
solana program show HLtWrvLyc2SE3ERWHaEdY4RG84GxFfHv3Qf4NzJPxaF7 --url devnet
solana program show E42nSmqvSCuC1EWbmzYqsdLHimBMeuZyir5dB5gE24rF --url devnet
```
