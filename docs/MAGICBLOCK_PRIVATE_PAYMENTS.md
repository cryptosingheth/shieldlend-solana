# MagicBlock Private Payments Live SPL Flow

Last checked: 2026-05-11

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

Funded private-transfer diagnostic:

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
| `MAGICBLOCK_PRIVATE_BALANCE_POLL_ATTEMPTS` | `6` | Private-balance polling attempts after deposit |
| `MAGICBLOCK_PRIVATE_BALANCE_POLL_DELAY_MS` | `2500` | Delay between private-balance polling attempts |

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

## 2026-05-11 Confirmation Run

Re-ran all safe checks. No change in behavior.

`--live-deposit-withdraw`:

| Step | Signature |
|---|---|
| wSOL wrap | `3H1Gthzf5P5zXLkfxUs1GvRNdaVjS9nBdojaE9mi4Qu4fS8rMyBL3dWWm1KpRNVWCv4GCV7Ca9T1z8HiSQt4t9Cd` |
| MagicBlock deposit | `4nPf5MCPHrpssBH4dnRfzVvXYBTfsNqde1jCmNTSKn8G1A67wSqjHg1oRA5tbnuPRx7nfNJ5xa1oxPzEm61kGp1Z` |
| MagicBlock withdraw | `2jdcAiFGZRqqCsdgH6jNLWxRAtE1noPsF3KVw45jStuc8PjbEfiHuP2wvVDYGL2TsdhUQUaPVJHDj71Y9aYkeKG3` |

`--live-private-transfer`:

| Step | Signature |
|---|---|
| Deposit before transfer | `C2FXHGmDSJG6nzbRH39vS6sntw1FpKYQTu221QuekhdLrKGJPPDzgi4JroEzjuRizWhWuQuRazq3ZNT8RMrb4Yr` |
| wSOL wrap for base→ephemeral top-up | `5VSKZu5vsTEE3nrxNAqcnAU5DzhRBLV95SjDomwV4QzQviJZFkvF8c8SRfBXaJKsHCgztaAnsRp46wSnA9NPDpVr` |
| base→ephemeral top-up | `xrtkQrWS75Wz8t1pXK2yQAwnzJzTyMvgWHVubZFe1uaGZLxzrjurYymbkEvQojRAWLt6eyhPNVNjU9zbWv73rTw` |

12 authenticated `/v1/spl/private-balance` polls (6 after deposit, 6 after top-up) all returned `"balance":"0","location":"base"`. Classification: `magicblock_api_router_tee_limitation` — unchanged.

Other checks:
- `node scripts/check-magicblock.mjs` — PASS; TEE/router/API reachable; TDX attestation warn unchanged
- `node scripts/magicblock-private-payments-live.mjs --dry-run` — PASS
- `npm run typecheck:frontend` — PASS
- `npm run build:frontend` — PASS
- `cargo test --workspace` — PASS, 47 tests
- `anchor build --no-idl` — PASS (requires Solana tools in PATH: `PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"`)

## 2026-05-10 Funded Private-Transfer Results

`--live-private-transfer` now runs the full funding sequence before attempting a private transfer:

```text
ensure SOL -> wSOL
login/auth
check or initialize wSOL mint
deposit wSOL into MagicBlock Private Payments
poll public and authenticated private balance
attempt private transfer using the same owner/mint/amount context
```

Live run:

```bash
node scripts/magicblock-private-payments-live.mjs --live-private-transfer
```

Observed result:

- Wallet already had `1000000` base units of wSOL at start.
- `GET /v1/spl/is-mint-initialized` returned `initialized=true` for wSOL.
- Deposit transaction submitted on devnet:

```text
51eRJbsp8mDMGRcacCmwtf6BV84Mgo5V28D6GRLygBqbrmnbXQHL3CPNJEM9E7JPBS5wCRGAHDcWxi3frCQRsiFZ
```

Retry result:

- Wallet started with `0` wSOL; the script wrapped `1000000` base units:

```text
2hCZ9opwH4L9mhgGV6rsQSRP7R6QGn7ddhpVKirLUg5Q2Daj9awvHBPoAEi8EhtYpgqykBzA9ZEdETR2xV4KttBX
```

- Retry deposit submitted:

```text
4kiDc7ZgQ4XU3KMGqHK4VodAorK9BTtGbfLrVi9Rhi5dBpcfqGTh7GVTwPjDf6WpPjHTBcgZ1eokjNc2i2u3JdDs
```

- After the confirmed deposit, six authenticated `/v1/spl/private-balance` polls for the same owner/mint returned:

```json
{"location":"base","balance":"0"}
```

- Private-transfer submit attempts then failed:
  - Router/ephemeral: `Blockhash not found`
  - TEE: `custom program error: 0x1`
  - Base fallback: Token Program log `Error: insufficient funds`

Additional namespace retry:

- `/v1/spl/transfer` accepts all four private balance-route builder variants:
  - `fromBalance=base`, `toBalance=base` -> `sendTo=base`
  - `fromBalance=base`, `toBalance=ephemeral` -> `sendTo=base`
  - `fromBalance=ephemeral`, `toBalance=base` -> `sendTo=ephemeral`
  - `fromBalance=ephemeral`, `toBalance=ephemeral` -> `sendTo=ephemeral`
- Because the documented `base -> ephemeral` route exists, the live private-transfer mode now tries it after deposit fails to surface private balance.
- Latest `base -> ephemeral` top-up retry submitted:

```text
34r7RQe2Acea6VCn3TLLCQJYUB6VjBPukWqt63c7uQEEkYWbSwgwrSaJNLVg74HLAuW9jrRn2fPkL81LtDogRHL9
```

- The top-up consumed the public wSOL, but six authenticated `/v1/spl/private-balance` polls still returned:

```json
{"location":"base","balance":"0"}
```

- The actual `ephemeral -> ephemeral` private transfer remained blocked with router `Blockhash not found` and Token Program `0x1` InsufficientFunds on TEE/base fallback attempts.

Classification after the `base -> ephemeral` retry:

```text
magicblock_api_router_tee_limitation
```

Reason: the public API accepts and submits the documented `base -> ephemeral` transfer route for the same owner/mint, but the authenticated private-balance endpoint still does not expose a usable ephemeral/private wSOL credit, and the subsequent private-transfer execution still fails. Until MagicBlock confirms the missing namespace/account context or router behavior, do not classify this as a live private-transfer rail.

## 2026-05-09 Hardening Results

The live runner now has separate modes:

- `--dry-run`: requests health/endpoints/builders and records blockhash diagnostics without signing or sending.
- `--live-deposit-withdraw`: signs and submits only the deposit/withdraw flow.
- `--live-private-transfer`: prepares wSOL, authenticates, checks mint initialization, deposits wSOL, verifies public/private balance, and then attempts the private-transfer diagnostic path.

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
- The private-transfer harness now covers SOL -> wSOL, auth, mint check, deposit, balance polling, and transfer attempts against the same owner/mint context.

Not allowed yet:

- Full MagicBlock Private Payments transfer flow is live end-to-end. The private transfer builder works, but the funded path does not show sufficient private wSOL credit after deposit and transfer execution fails with Token Program `0x1` InsufficientFunds. The intended ephemeral/router path also still blocks with `Blockhash not found`.
- ShieldLend lending repayment is settled through MagicBlock Private Payments. The protocol still needs a signed/submitted transaction signature or receipt binding path.
- MagicBlock PER Rust macros are wired into Anchor programs. They remain blocked by the Anchor 0.30.1 vs 0.32.1 gap.
- TDX attestation is verified. The SDK still throws the known challenge decode mismatch.
