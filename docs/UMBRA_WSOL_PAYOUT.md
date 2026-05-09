# ShieldLend — wSOL Umbra Payout Path

Last updated: 2026-05-09 (branch: live/wsol-umbra-e2e)

---

## Overview

This document describes the wSOL/SPL ShieldLend payout path for the Umbra
privacy rail integration on Solana devnet. It covers:

- Why native SOL cannot be routed directly through Umbra
- The wSOL settlement adapter design and its claim boundary
- How to run the devnet roundtrip script
- What is and is not live on devnet

---

## Why Umbra Requires wSOL (not native SOL)

The Umbra SDK (`@umbra-privacy/sdk@4.0.0`) shields **SPL and Token-2022
token balances**, not native SOL lamports. The SOL-compatible route is
**wSOL** (wrapped SOL), whose mint address is
`So11111111111111111111111111111111111111112`.

The existing ShieldLend C2H (Commit-to-Hash) withdraw instruction writes a
recipient pubkey into `WithdrawArgs.stealth_address` and queues the exit
in `exit_queue` as native SOL lamports. The Umbra SDK has no function that
accepts native SOL; the payout leg must first be in token form.

---

## Design: Two-Step wSOL Settlement Adapter

Rather than modifying the on-chain program (which would require an SPL
token ATA flow inside `shielded_pool`, adding anchor-spl deps, and a
redeployment), the ShieldLend hackathon devnet demo uses a
**post-withdraw settlement adapter**:

```
C2H withdraw (queued exit)
        │
        │ (flush_exits would deliver native SOL — currently fail-closed)
        │
        ▼
wrap SOL → wSOL (So111...1112)
        │
        ▼
Umbra encrypted-balance deposit (wSOL)
        │
        ▼
Umbra encrypted-balance withdraw (wSOL)
```

### Step 1 — C2H Groth16 proof verification

`shielded_pool::store_withdraw_proof` stores the Groth16 proof PDA.
`shielded_pool::withdraw` verifies the proof on-chain (198,502 CU),
consumes the nullifier via NullifierRegistry CPI, and queues the exit.

### Step 2 — wSOL wrap (post-flush simulation)

`flush_exits` is fail-closed in the current workspace (PER adapter
requires Anchor 0.32.1; workspace uses 0.30.1). The exited SOL stays in
the pool PDA. For the demo, a small amount of wallet SOL is wrapped to
wSOL to represent the post-flush payout amount.

**This wrapping step is the claim boundary.** It is a devnet simulation,
not a real SOL transfer from the pool to a wSOL ATA.

### Step 3 — Umbra encrypted-balance flow

The wSOL is deposited into Umbra's encrypted balance:

```
getPublicBalanceToEncryptedBalanceDirectDepositorFunction
  → deposit(walletAddress, wSOLMint, amount)
```

Then withdrawn:

```
getEncryptedBalanceToPublicBalanceDirectWithdrawerFunction
  → withdraw(walletAddress, wSOLMint, amount)
```

Both calls go through the Umbra relayer at
`https://relayer.api-devnet.umbraprivacy.com` and the Umbra devnet program
`DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ`.

---

## Devnet Script

```bash
# Full run (attempts C2H + wSOL Umbra):
node scripts/devnet-wsol-umbra-roundtrip.mjs

# Umbra-only run (skip C2H — use for clean demo runs):
SKIP_C2H=1 node scripts/devnet-wsol-umbra-roundtrip.mjs
# or:
node scripts/devnet-wsol-umbra-roundtrip.mjs --skip-c2h

# or via npm:
npm run smoke:wsol-umbra-roundtrip
```

**Requirements:**
- Devnet wallet at `~/.config/solana/id.json` with ≥ 0.02 SOL
- `@umbra-privacy/sdk@4.0.0` installed (`npm install` at repo root)
- Optional: `WSOL_UMBRA_DEMO_AMOUNT=<lamports>` (default: 1_000_000)

**Live smoke result (2026-05-08):**

| Step | Result |
|---|---|
| Phase 1 — C2H store_withdraw_proof / withdraw | FAILED (custom program error `0x0`) |
| Phase 2 — SOL → wSOL wrap | CONFIRMED |
| Phase 2 — Umbra wSOL deposit | CONFIRMED |
| Phase 2 — Umbra wSOL withdraw | CONFIRMED |

Phase 1 failed with `0x0` in the roundtrip script. This does **not** invalidate the wSOL Umbra
adapter — Phase 2 is independent. For C2H confirmation, see `devnet-fullround.mjs` which
completed the full round-trip (198,502 CU) in a prior devnet session.
Use `SKIP_C2H=1` to run the demo without touching C2H state.

**Output includes:**
- Phase 1 result: C2H nullifier check + attempt (or SKIPPED if flag set)
- Phase 2 result: wSOL wrap tx signature
- Umbra deposit queue signature + callback signature
- Umbra withdraw queue signature + callback signature
- Full JSON report with claim boundary embedded (c2hStatus field)

---

## Claim Boundary

| Claim | Confirmed? | Notes |
|---|---|---|
| ShieldLend C2H Groth16 proof verified on-chain | **Yes (devnet-fullround.mjs)** | 198,502 CU; DEV/TEST trusted setup only; roundtrip script Phase 1 failed with `0x0` |
| Nullifier consumed via NullifierRegistry CPI | **Yes (devnet-fullround.mjs)** | Confirmed from prior devnet session; not re-confirmed in roundtrip script |
| Exit queued in exit_queue | **Yes (devnet-fullround.mjs)** | stealth_address = wallet pubkey in demo |
| SOL transferred from pool to stealth_address | **No** | flush_exits fail-closed; PER adapter not wired |
| wSOL Umbra encrypted-balance deposit confirmed | **Yes** | SDK 4.0.0; devnet relayer; real Umbra program |
| wSOL Umbra encrypted-balance withdraw confirmed | **Yes** | SDK 4.0.0; same flow as umbra-funded-smoke.mjs |
| Native pool SOL routed to Umbra | **No** | Requires flush_exits + SPL payout leg in program |
| Production trusted setup | **No** | DEV/TEST pot14 only |
| IKA relay active | **No** | Direct wallet signer; mock only |
| MagicBlock flush_exits | **No** | Anchor 0.32.1 required; workspace 0.30.1 |

---

## Safe and Unsafe Wording

**Safe to claim:**

> "ShieldLend C2H withdraw ZK proof is verified on-chain (Groth16 BN254,
> 198,502 CU, DEV/TEST) via `devnet-fullround.mjs`. A post-withdraw wSOL
> settlement adapter routes the payout through the Umbra encrypted-balance
> SDK on devnet (SDK 4.0.0, deposit + withdraw confirmed). The roundtrip
> script Phase 1 (C2H) failed with custom error `0x0` — use `SKIP_C2H=1`
> for clean Umbra-only demo runs."

**Do NOT claim:**

> "ShieldLend exits are Umbra-routed."
> "Native SOL withdrawals go through Umbra."
> "flush_exits delivers SOL to the Umbra relayer."
> "Umbra payout is a native protocol feature of ShieldLend."

---

## UI

The `Withdraw` screen in the frontend has three destination modes:

| Mode | Button label | Status |
|---|---|---|
| `direct_stealth_address` | Direct SOL | Lower-privacy; writes a Pubkey into stealth_address |
| `wsol_umbra_adapter` | wSOL via Umbra | Post-withdraw adapter; claim boundary shown inline |
| `umbra` | Umbra SPL | Direct SPL route; blocked pending NEXT_PUBLIC_UMBRA_ENABLED |

Selecting **wSOL via Umbra** renders the `WsolUmbraAdapterPanel` which
displays all three steps, the confirmed claims, and the not-live items.

---

## Related Files

| File | Role |
|---|---|
| `scripts/devnet-wsol-umbra-roundtrip.mjs` | Devnet roundtrip script |
| `scripts/umbra-funded-smoke.mjs` | Earlier standalone wSOL Umbra smoke |
| `frontend/src/lib/privacyRails/umbra.ts` | `getWsolUmbraPayoutPath`, `planUmbraDestinationRoute` |
| `frontend/src/app/page.tsx` | `WsolUmbraAdapterPanel`, `Withdraw` component |
| `docs/IMPLEMENTATION_STATUS.md` | Full implementation ledger |
| `docs/HACKATHON.md` | Hackathon submission framing |
