# Current Task

## Status: IKA approve_ika_borrow_message CPI CONFIRMED on devnet (2026-05-11); Encrypt Option B compile-wired on live/encrypt-anchor (2026-05-10); MagicBlock Private Payments final diagnostics complete (2026-05-11)

### IKA Anchor CPI Hardening Pass (2026-05-11)

**Result: PARTIAL**

#### What landed

- `lending_pool` redeployed to fix `DeclaredProgramIdMismatch` (binary had wrong `declare_id!`).
- `registry_writer` PDA `3BkCT5ACdAyWNvo6Cv9RDq8BbHav1wuavH7N3X8NbUwF` added permanently to `nullifier_registry::authorized_programs`.
- `approve_ika_borrow_message` CPI confirmed on devnet **twice**:
  - tx 1: `m5trvfdGc2AtqXh4chLoKdo5cXfCCL7mE3EB7tKHynGdDN5RV12SzpkQX2DgzAFiwzcLtYdQSgBJ1cPPbbj9WBF`
  - tx 2: `3AHThchU8EAjQ2aYsbrDy212JJvHPE3ajtLx2ZLKVBxJnfSHnRTTUeZxX2en2zz4UGmUuzMjU3sgbV5J9bkKZbk2`
- `MessageApproval` PDAs created on-chain both times.
- Script hardened: `SOLANA_RPC_URL`, retry wrappers, randomized DKG session nonce, real attestation in presign, three-case authority handler.

#### Remaining gap

IKA gRPC `PresignForDWallet` fails with `invalid signed_request_data: unexpected end of input` (gRPC code 3). Category (b) IKA coordinator/gRPC issue: BCS schema mismatch between our local definition and the coordinator's current format. Cannot resolve without IKA pre-alpha Rust BCS source.

#### Commit

`e1770ec feat: confirm IKA approve_ika_borrow_message CPI on devnet`

---

### MagicBlock Private Payments Final Diagnostics (2026-05-11 — live/magicblock-private-payments)

- Hardened `scripts/magicblock-private-payments-live.mjs` so `--live-private-transfer` now runs the full funded path:
  - ensure local SOL -> wSOL when needed
  - login/auth through `/v1/spl/challenge` and `/v1/spl/login`
  - check or initialize the wSOL mint queue
  - deposit wSOL through MagicBlock Private Payments
  - poll public and authenticated private balances after deposit
  - probe all private transfer balance namespaces
  - submit the documented `base -> ephemeral` top-up route if deposit does not expose private balance
  - attempt private transfer using the same owner/mint/amount context
- Added JSON report fields:
  - `balanceSnapshots`
  - `depositCreditChecks`
  - `privateBalanceTopUpAttempts`
  - `transferRouteDiagnostics`
  - `privateTransferBlockerClassification`
- Updated `docs/MAGICBLOCK_PRIVATE_PAYMENTS.md`, `docs/HACKATHON.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/SUBMISSION_CHECKLIST.md`, and `scripts/demo-status.mjs` with the new claim boundary.

## Live Results From 2026-05-10 / 2026-05-11

- `node scripts/check-magicblock.mjs` — PASS with network access:
  - TEE RPC HTTP 200
  - Router RPC HTTP 200 / method-not-found for `getHealth`, still reachable
  - Private Payments `/health` HTTP 200
  - wSOL mint initialized=true
  - `/v1/mcp` remains 404
  - TDX attestation still throws `challenge must decode to 64 bytes`
- `node scripts/magicblock-private-payments-live.mjs --dry-run` — PASS:
  - health/challenge/mint/balance/deposit/withdraw/private-transfer builders return expected responses
  - private-transfer builder returns `sendTo=ephemeral`
  - decoded tx blockhash matches API blockhash
- `node scripts/magicblock-private-payments-live.mjs --live-deposit-withdraw` — PASS:
  - wSOL wrap + SyncNative: `Z9YyUK7y7iUwkKQo73chxngq9V2X45Q6Emrv6KRJoKj2roZjibH6nWnSruB8kPf3X4ZnXqFb6ehCjZQviQMFVM1`
  - deposit: `28hBK6aKZzYoZ5uYynu2QkYG5sLJ7zWAiEacTodfFN22cvCcb4Meu57xEcEeFLFJwqBUL1yGLn9Mn2R5wdE3LgZF`
  - withdraw: `5SiFVzahhkmQaD8uM4qhWWgTBhKDjcEccm6ui7L4ryAtZJiygZGnUQ1fNDuP9K9w9eFe5rUtyibR3hoc96hQHBBn`
- `node scripts/magicblock-private-payments-live.mjs --live-private-transfer` — PARTIAL/BLOCKED:
  - deposit submitted: `51eRJbsp8mDMGRcacCmwtf6BV84Mgo5V28D6GRLygBqbrmnbXQHL3CPNJEM9E7JPBS5wCRGAHDcWxi3frCQRsiFZ`
  - retry from zero wSOL wrapped: `2hCZ9opwH4L9mhgGV6rsQSRP7R6QGn7ddhpVKirLUg5Q2Daj9awvHBPoAEi8EhtYpgqykBzA9ZEdETR2xV4KttBX`
  - retry deposit submitted: `4kiDc7ZgQ4XU3KMGqHK4VodAorK9BTtGbfLrVi9Rhi5dBpcfqGTh7GVTwPjDf6WpPjHTBcgZ1eokjNc2i2u3JdDs`
  - namespace retry deposit submitted: `3PZH1cguYCd9QUb5Rdvb72So59UbNrfriYbrUdZyGf1YvEm7WgCyHKLbxrZdbx1zFEwZWuMMXdzuxJbXzh8ry7ed`
  - namespace retry wrapped wSOL: `XRAyJP9aKLU9pBetQPAjxn276xWMEtsrEBXKJBDKg6cUQyftxz1rvhai5L2mnbBpKBpj5ePenKVSUMo5NEAfwRf`
  - namespace retry `base -> ephemeral` top-up submitted: `34r7RQe2Acea6VCn3TLLCQJYUB6VjBPukWqt63c7uQEEkYWbSwgwrSaJNLVg74HLAuW9jrRn2fPkL81LtDogRHL9`
  - after deposit, authenticated `/v1/spl/private-balance` polling returned `balance: "0"` and `location: "base"` for the same owner/mint after six attempts
  - after the submitted `base -> ephemeral` top-up, authenticated `/v1/spl/private-balance` still returned `balance: "0"` and `location: "base"` after six attempts
  - private-transfer attempts:
    - router/ephemeral: `Blockhash not found`
    - TEE: `custom program error: 0x1`
    - base fallback: Token Program log `Error: insufficient funds`
  - classification: `magicblock_api_router_tee_limitation`

2026-05-11 confirmation run:
- wSOL wrap: `3H1Gthzf5P5zXLkfxUs1GvRNdaVjS9nBdojaE9mi4Qu4fS8rMyBL3dWWm1KpRNVWCv4GCV7Ca9T1z8HiSQt4t9Cd`
- deposit: `4nPf5MCPHrpssBH4dnRfzVvXYBTfsNqde1jCmNTSKn8G1A67wSqjHg1oRA5tbnuPRx7nfNJ5xa1oxPzEm61kGp1Z`
- withdraw: `2jdcAiFGZRqqCsdgH6jNLWxRAtE1noPsF3KVw45jStuc8PjbEfiHuP2wvVDYGL2TsdhUQUaPVJHDj71Y9aYkeKG3`

### Encrypt Anchor Compatibility Boundary (2026-05-10 — live/encrypt-anchor)

Allowed claim: Encrypt pre-alpha gRPC CreateInput works live and returns ciphertext handles for modeled ShieldLend health/risk values. Option B (`vendor/encrypt-anchor-anchor032`) compile-wires the CPI path. No on-chain FHE is live.

- Hardening commit: `7a2118b feat: harden encrypt anchor demo rail`.
- Official `encrypt-anchor` upstream CPI probe blocked: `EncryptContext` expects `solana_account_info` 3.1.x; Anchor 0.32.1 supplies 2.3.x `AccountInfo`.
- Added `vendor/encrypt-anchor-anchor032`, a minimal local compatibility fork rebased onto `anchor-lang = "0.32.1"`.
- `programs/lending_pool` compile-wires:
  - `request_liquidation_reveal_via_encrypt`
  - `verify_liquidation_reveal_via_encrypt`
- Legacy generic verifier remains fail-closed at `EncryptVerifierNotWired`; no on-chain FHE or on-chain decryption is live.

---

## Validation (submission-clean pass 2026-05-11)

- `npm run typecheck:frontend` — PASS
- `npm run build:frontend` — PASS with existing `web-worker`/ffjavascript warning
- `cargo test --workspace` — PASS, 53 tests
- `anchor build --no-idl` — PASS with existing Anchor CLI/version and cfg/syscall warnings

## Claim Boundary

- Do not claim production ZK trusted setup (DEV/TEST pot14 only).
- Do not claim IKA relay signing active end-to-end (approval CPI confirmed; gRPC presign/sign blocked by BCS schema mismatch).
- Do not claim MagicBlock PER Rust macros wired in Anchor programs.
- Do not claim MagicBlock Private Payments private transfer via intended ephemeral/router path confirmed.
- Do not claim native protocol-level Umbra payout (wSOL adapter is post-withdraw simulation; flush_exits fail-closed).
- Do not claim Encrypt on-chain FHE active (Anchor 0.32.1 present; current official CPI blocked by AccountInfo crate-family mismatch; local fork compile-wires path only).
- Do not claim upgraded Anchor 0.32.1 binaries are deployed (no redeploy performed for the Anchor upgrade task).
- Do NOT claim C2H confirmed by roundtrip script (Phase 1 FAILED with `0x0`; C2H confirmed only via `devnet-fullround.mjs`).
- Do not claim production privacy.
- Allowed: MagicBlock Private Payments public API is live/reachable; challenge/login works; wSOL mint is initialized; deposit/withdraw builders and live submissions work on devnet; private-transfer harness now exercises deposit plus documented `base -> ephemeral` top-up before the real Token Program failure.
- Not allowed: full MagicBlock Private Payments private transfer is live end-to-end; ShieldLend repayment settlement is MagicBlock-bound; MagicBlock PER Rust macros are deployed; TDX attestation is verified.

---

## Pending

1. Push `convergence/privacy-rails-integration` to remote.
2. Create PR against `main`.
3. Fill C2H devnet tx signatures into `docs/SUBMISSION_CHECKLIST.md`.
4. Record demo scenes (especially Scene 5/6 for IKA and Scene 7 for Encrypt).

## Next Actions (MagicBlock)

1. Ask MagicBlock which private-balance namespace/account context should be credited by `/v1/spl/deposit` and `base -> ephemeral`, or whether `/v1/spl/private-balance` currently mirrors base balance only.
2. Ask MagicBlock which RPC should accept `sendTo=ephemeral` private-transfer transactions and whether the API-provided blockhash should be accepted by router/TEE.
3. Once private transfer succeeds with a real private-balance credit and confirmed signature, wire receipt/signature binding into the ShieldLend repay path.
