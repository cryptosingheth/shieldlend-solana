# MagicBlock Private Payments Live SPL Flow

Last checked: 2026-05-08

## Scope

This branch moves ShieldLend's MagicBlock Private Payments work from placeholder routes to the public MagicBlock Private Payments SPL API:

```text
https://payments.magicblock.app
```

The flow uses devnet wSOL by default:

```text
So11111111111111111111111111111111111111112
```

The implementation builds unsigned transactions through the API, signs locally with the Solana CLI devnet wallet, and submits to the RPC named by the API response's `sendTo` field. Private keys are never printed.

## Commands

Dry-run endpoint and unsigned-builder check:

```bash
node scripts/magicblock-private-payments-live.mjs --dry-run
```

Live devnet flow:

```bash
node scripts/magicblock-private-payments-live.mjs --live
```

Minimal live smoke amount:

```bash
node scripts/magicblock-private-payments-live.mjs --live --amount-base-units=1
```

Environment overrides:

| Variable | Default | Purpose |
|---|---|---|
| `MAGICBLOCK_PRIVATE_PAYMENTS_API_URL` | `https://payments.magicblock.app` | API base URL |
| `MAGICBLOCK_PRIVATE_PAYMENTS_CLUSTER` | `devnet` | API cluster |
| `MAGICBLOCK_PRIVATE_PAYMENTS_MINT` | wSOL mint | SPL mint |
| `MAGICBLOCK_PRIVATE_PAYMENTS_AMOUNT_BASE_UNITS` | `1000000` | SPL base-unit test amount |
| `MAGICBLOCK_PRIVATE_PAYMENTS_KEYPAIR` | `~/.config/solana/id.json` | Local devnet wallet |
| `MAGICBLOCK_BASE_RPC_URL` | `https://api.devnet.solana.com` | Base-chain submit RPC |
| `MAGICBLOCK_EPHEMERAL_RPC_URL` | `https://devnet-router.magicblock.app` | Ephemeral submit RPC override |
| `MAGICBLOCK_AUTO_WRAP_WSOL` | `true` | Wrap local devnet SOL to wSOL before live deposit |

## Endpoints Hit

The script covers:

- `GET /health`
- `GET /v1/mcp`
- `GET /v1/spl/challenge?pubkey=<wallet>&cluster=devnet`
- `POST /v1/spl/login`
- `GET /v1/spl/is-mint-initialized?mint=<mint>&cluster=devnet`
- `GET /v1/spl/balance?address=<wallet>&mint=<mint>&cluster=devnet`
- `GET /v1/spl/private-balance?address=<wallet>&mint=<mint>&cluster=devnet`
- `POST /v1/spl/deposit`
- `POST /v1/spl/transfer` with `visibility=public`
- `POST /v1/spl/transfer` with `visibility=private`
- `POST /v1/spl/withdraw`

## 2026-05-08 Live Results

Dry-run with wSOL:

- API health: `200 {"status":"ok"}`
- wSOL mint initialized: `200`, transfer queue `BPLzXbpayTxP8KVoNtV2uTKyrY7fErS7xdTx6LF82Nua`
- Challenge: `200`, challenge issued
- Public transfer builder: `200`, unsigned legacy transaction returned, `sendTo=base`
- Deposit builder: `200`, unsigned legacy transaction returned, `sendTo=base`
- Private transfer builder: `200`, unsigned legacy transaction returned, `sendTo=ephemeral`
- Withdraw builder: `200`, unsigned legacy transaction returned, `sendTo=base`
- `GET /v1/mcp`: `404 {"error":{"code":"NOT_FOUND","message":"Route not found"}}`

Live minimized flow with `--amount-base-units=1`:

| Step | Status | Signature |
|---|---|---|
| wSOL wrap | Submitted on devnet | `2q5FC6r6HpR2FmKt9nfB1ZjHEYEgAszzBCe73NVxiCeyoYDhd3dePdHVLuJetsWmbWYW2svstPNUpjEf9ZwPPhuP` |
| Deposit | Submitted on devnet | `UtqpXCERPPZoP1HNPXzj1Frmh7MtqXGiE66GMnpZvvrziNQL1YrWVzFfShYB4EU4HAnofmdeJXNhjb1C96XPFct` |
| Private transfer | API builder returned 200, submit blocked | none |
| Withdraw | Submitted on devnet | `4FXm5NYmEf9gTXdGWGUiHB7BzEEXTaAB1WW6GhDS6QN4XKmEtH9Cw9hkRBAsqxHST2M9En39MTwfbLqNV5c9WRpP` |

Private-transfer submit blocker:

```text
Simulation failed.
Message: solana rpc request error: RPC response error -32002: Transaction simulation failed: Blockhash not found; .
```

The same private-transfer submit class also reproduced when `MAGICBLOCK_EPHEMERAL_RPC_URL=https://devnet-tee.magicblock.app`, with:

```text
Simulation failed.
Message: transaction verification error: Blockhash not found.
```

## Claim Boundary

Allowed after this branch:

- MagicBlock Private Payments public API is reachable.
- wSOL mint initialization check is live on the API.
- Challenge signing and `/v1/spl/login` work for the local devnet wallet.
- The API returns unsigned transactions for public transfer, deposit, private transfer, and withdraw.
- wSOL deposit and withdraw transactions returned by MagicBlock Private Payments were signed locally and submitted on devnet.

Not allowed yet:

- Full MagicBlock Private Payments transfer flow is live end-to-end. The private transfer builder works, but submitting the ephemeral transaction is blocked by `Blockhash not found`.
- ShieldLend lending repayment is settled through MagicBlock Private Payments. The protocol still needs a signed/submitted transaction signature or receipt binding path.
- MagicBlock PER Rust macros are wired into Anchor programs. They remain blocked by the Anchor 0.30.1 vs 0.32.1 gap.
- TDX attestation is verified. The SDK still throws the known challenge decode mismatch.
