# MagicBlock Private Payments Live SPL Flow

Last checked: 2026-05-09

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

Live devnet deposit/withdraw flow:

```bash
node scripts/magicblock-private-payments-live.mjs --live-deposit-withdraw
```

Minimal live smoke amount:

```bash
node scripts/magicblock-private-payments-live.mjs --live-deposit-withdraw --amount-base-units=1
```

Isolated private-transfer submit diagnostic:

```bash
node scripts/magicblock-private-payments-live.mjs --live-private-transfer --amount-base-units=1
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
| `MAGICBLOCK_TEE_RPC_URL` | `https://devnet-tee.magicblock.app` | TEE submit diagnostic RPC |
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

## 2026-05-09 Hardening Results

The live runner now has separate modes:

- `--dry-run`: requests health/endpoints/builders and records blockhash diagnostics without signing or sending.
- `--live-deposit-withdraw`: signs and submits only the deposit/withdraw flow.
- `--live-private-transfer`: signs and submits only the private-transfer diagnostic path.

Blockhash diagnosis for `POST /v1/spl/transfer` with `visibility=private`:

- The unsigned legacy transaction's decoded `recentBlockhash` matches the API `recentBlockhash`.
- Base devnet RPC reports the API private-transfer blockhash invalid and its `lastValidBlockHeight` already expired relative to base devnet.
- MagicBlock TEE RPC reports the API private-transfer blockhash invalid.
- MagicBlock router RPC does not expose `getBlockHeight`, so the script cannot validate expiry there.
- Refreshing the transaction blockhash from the router RPC before signing still fails on router submit with:

```text
Simulation failed.
Message: solana rpc request error: RPC response error -32002: Transaction simulation failed: Blockhash not found; .
```

- Refreshing from TEE before signing fails with:

```text
Simulation failed.
Message: transaction verification error: Transaction loads a writable account that cannot be written.
```

- Refreshing from base devnet before signing submitted the private-transfer transaction, but this is a base-RPC fallback and does not confirm the intended `sendTo=ephemeral` / router private-transfer path:

```text
2BA9bAEk78cxfDHDqDDHaGs6CsbYdSXn17hGEV7DHitWm873CNSecigThUvqwJEa9oX6q8btGKfPAmrC2MnvtV1s
```

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

Live minimized deposit/withdraw flow with `--amount-base-units=1`:

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
- Local blockhash refresh can submit the private-transfer transaction through base devnet RPC.

Not allowed yet:

- Full MagicBlock Private Payments transfer flow is live end-to-end. The private transfer builder works, and base devnet accepts the refreshed transaction, but the intended ephemeral/router path is still blocked by `Blockhash not found`.
- ShieldLend lending repayment is settled through MagicBlock Private Payments. The protocol still needs a signed/submitted transaction signature or receipt binding path.
- MagicBlock PER Rust macros are wired into Anchor programs. They remain blocked by the Anchor 0.30.1 vs 0.32.1 gap.
- TDX attestation is verified. The SDK still throws the known challenge decode mismatch.
