# ShieldLend — Submission Checklist

**Event**: Colosseum Frontier Hackathon 2026
**Branch**: `convergence/privacy-rails-integration`
**Integration commit**: `93375d4`

---

## GitHub

- [ ] Branch `convergence/privacy-rails-integration` pushed to remote
- [ ] PR created against `main` with description linking to `docs/HACKATHON.md`
- [ ] Confirm all five integration commits are present:
  - `93375d4` feat: integrate privacy rail adapters and live status
  - `edbc82d` feat: merge rail/ika
  - `f7ac98b` feat: merge rail/magicblock
  - `f0fd4dd` feat: merge rail/umbra
  - `d5faa6b` feat: merge rail/encrypt

---

## Devnet Transaction Signatures

### C2H Groth16 Withdraw Round-Trip

- [ ] Locate and record devnet tx signatures from `devnet-fullround.mjs` run:
  - deposit tx: `_______________________________________________`
  - flush_epoch tx: `_______________________________________________`
  - store_withdraw_proof tx: `_______________________________________________`
  - withdraw tx: `_______________________________________________`

> These signatures confirm on-chain Groth16 BN254 verification (198,502 CU).
> Verify on Solana Explorer devnet before submission.

### Umbra Devnet Signatures — 2026-05-12 fresh round-trip (wallet `C2qTgyZ1PS23aHnYUDXTDS4VEYUrZhecowL94uDkkuTe`)

Run via `npm run setup:devnet-wallet` (new helper) + `$env:SKIP_C2H="1"; npm run smoke:wsol-umbra-roundtrip` (PowerShell) — produced 9 confirmed on-chain transactions in one run. Encrypted-balance state proof: deposit moved balance 0 → 1,000,000; withdraw moved balance 1,000,000 → 0. `adapterLive: true`, `umbrawSolFlowLive: true`.

- [x] wSOL wrap: `2DWwADQY6Ty2iwe7t48rDXgqKYQ99fVRRgayntJGnvRnFr7n2C2tjS9UMeZNFT4mzPNUXjGrUU43vhzKjFY5UeoC`
- [x] Umbra registration 1: `358QmfyTRRcgrV7T1JMzcxSDeS5iVkfdNfPH4zpi3nbU8pfTSrKqgrPacFnLHFKYfWfPeLdHnJK5AA57YDKpPQCt`
- [x] Umbra registration 2: `3fvPkXUqDPxDcVmvAiGcfgMQNPbS5a5kSekDJt7DHM2zZRFjjjN874Bd594XdbR5XiRRiCXteQAXRaHob1AWLS5p`
- [x] Umbra deposit queue: `5SURTjiZM8oujeeMChMYA1f6NvgyanTocwTAw6E8ZSny7wAZb3ZxJ1b3321uy9yhbRkxLLcJ6VBHFXfRmGNYGZe5`
- [x] Umbra deposit callback (finalized in 1.6s): `66Vnro1iQmxQAt6FmwSiKcjSsQbym2th3tymffAVT8EVjWazjmeYvj7kSYG1JrFs18KMD3TMsHBJCvXtcnCcPLPU`
- [x] Umbra deposit rent reclaim: `3RWd6DVantupHUVxGYqdEZZCjogEgp39A3ZAzcQvXF9Hu2aqk7bNbLMNyVXaHLBnp1miWjbkvwHpZwMmqUtJjuVb`
- [x] Umbra withdraw queue: `2PvzbYVpa4AEFFTmqaYcnSUhpH883YzCBtw5XdPTzEBjjC26cmP6nfxM3ArozdWiG4ykc18jkP4WJSr3bddvCtBN`
- [x] Umbra withdraw callback (finalized in 2.5s): `673pMzN2arBYfb8CPaYMBdiLcW9qUt4hW1nt8ayWiK8S9KB9iCGA4ZCwCUb1rhrGctQR1mTMHgBi4PwnYY1zEfNG`
- [x] Umbra withdraw rent reclaim: `4WZYX7A1ZA7pBojSKh2HMBRLMUwscXf3HkoHr5HHCQ36X4jNDK79ukTHZsfZv3M5ena7tYUt8Sq5WCECKTwTKGKp`

### Umbra Devnet Signatures (Confirmed — prior session, retained)

- [x] wSOL wrap + SyncNative: `cyQG7Bw7Skuu2QCMu8Gvmx5JSfbcSwGGD3utoRq7jm3iAkxKHCgKjXeGxjBBGL3ZWYYe1JTqykdAQFj5thw85As`
- [x] Umbra deposit queue: `SZeGJ9FMkhiAnz2hq9oeWSgX1pccrE5rCqgZWjUMd4pu7ZzaHrNM9K6aaMxqqNfZ1cYHWSvwYYAp5gJwhtTovyx`
- [x] Umbra deposit callback: `2nPcvgkfXhYWuAAxHfhjH8WCi4afguYbhqu3uYdpYgEH1As5jB8R2evfiUWXmFekz1CXfhB1HwHosiQKYGjCxMVL`
- [x] Umbra deposit rent reclaim: `2MFBu2kb2VFPHRRhDYK4ip9uwm3Vm8vaYGdhCogx9V4LBCwjw3nrjx1oY6JefQkRPX3T9P2ttcVPcw6L4Rkh7Uib`
- [x] Umbra withdraw queue: `yVdTJQi8DxnRyB1BBW2zkTenm7WhxXAqztXqoAsqUQdnEdKhqUBQrWACbMeLkdEGkCuGbPGKVYfGAVzRLLeHg5u`
- [x] Umbra withdraw callback: `31UinqaCswx1kNJGpZbGoFgr6AH8nrBfLMEhgm1z3FNgJdAtbjDsPxvbv3iC7r6i7DpR5t3YvUyMcpHUeD4HnVau`
- [x] Umbra withdraw rent reclaim: `4zm2xwJ4TfCGTTwtcG72wfj3xXjsYiDfNqZBRY1Kp2qyszwezjywjJCC63LphzUK9Qbs5jhbv37NLYEFcLfoqKEm`

---

## Demo Video Scenes

Record in this order:

- [ ] Scene 1: Terminal — run `node scripts/demo-status.mjs` — show branch, commit, artifact hashes, program IDs, claim boundary output
- [ ] Scene 2: Terminal — run `node scripts/check-encrypt.mjs` — show gRPC endpoint reachable, ciphertext handle printed
- [ ] Scene 3: Terminal — run `node scripts/check-umbra.mjs` — show SDK version, devnet program ID, funded tx signatures
- [ ] Scene 3b: Terminal — run `SKIP_C2H=1 node scripts/devnet-wsol-umbra-roundtrip.mjs` — show wSOL wrap + Umbra deposit + Umbra withdraw + claim boundary (C2H skipped; use devnet-fullround.mjs for C2H scene; Phase 1 failed with `0x0` in full run)
- [ ] Scene 4: Terminal — run `node scripts/check-magicblock.mjs` — show TEE HTTP 200, Router HTTP 200, 13/13 SDK functions, documented warns
- [ ] Scene 5: Terminal — run `node scripts/check-ika.mjs` — show SDK/WASM confirmed, B1/B2/B3 blockers printed with source evidence
- [ ] Scene 6: Browser — open `http://localhost:3000` — show Privacy Status panel with all four rail statuses
- [ ] Scene 7: Browser — show Deposit screen — highlight IKA mode selector with "reduced privacy" label
- [ ] Scene 8: Browser — show Withdraw screen — select "wSOL via Umbra" mode — show WsolUmbraAdapterPanel with step 1/2/3 and claim boundary
- [ ] Scene 9: Solana Explorer — open devnet and show the C2H withdraw transaction confirming on-chain Groth16 BN254 result

---

## Screenshots

- [ ] Screenshot: `node scripts/demo-status.mjs` full terminal output
- [ ] Screenshot: `node scripts/check-magicblock.mjs` showing TEE HTTP 200 + warns
- [ ] Screenshot: Privacy Status panel in frontend (all rails showing)
- [ ] Screenshot: Solana Explorer — shielded_pool program (`9Bvt3jMawHFRRxpaQTtV5VvFdpZkmAZtvwjTrAX9TAtE`) on devnet
- [ ] Screenshot: Solana Explorer — C2H withdraw transaction showing 198,502 CU

---

## Environment Variables Needed for Full Demo

| Variable | Required? | Purpose |
|---|---|---|
| `SOLANA_CLUSTER=devnet` | Yes | All Solana RPC calls |
| `SOLANA_WALLET_PATH` | Yes | Umbra smoke, devnet balance check |
| `NEXT_PUBLIC_SOLANA_CLUSTER=devnet` | Yes | Frontend RPC |
| `ENCRYPT_GRPC_ENDPOINT` | Optional | Defaults to `pre-alpha-dev-1.encrypt.ika-network.net:443` in check script |
| `NEXT_PUBLIC_MAGICBLOCK_PRIVATE_PAYMENTS_URL` | Optional | Defaults to `https://payments.magicblock.app`; override only if MagicBlock provides another API base |
| `MAGICBLOCK_PRIVATE_PAYMENTS_AMOUNT_BASE_UNITS` | Optional | Live script amount; minimized smoke used `1` base unit |
| `NEXT_PUBLIC_UMBRA_NETWORK=devnet` | Optional | Frontend Umbra network override |

---

## Known Limitations (Disclose to Judges)

These are implementation gaps, not design gaps:

1. **Trusted setup is DEV/TEST only** — `pot14` ceremony used during development. Production `pot28` ceremony requires a separate Powers of Tau ceremony. No production privacy is implied.

2. **IKA relay signing not active** — `ika-dwallet-anchor` CPI crate is not published as of this submission. All on-chain transactions use direct wallet signing. The deposit screen labels this "reduced privacy." Three source-backed blockers are documented in `scripts/check-ika.mjs`.

3. **MagicBlock PER Rust macros not in Anchor programs** — the workspace now uses Anchor 0.32.1, but `#[ephemeral]`, `#[delegate]`, and `#[commit]` are not wired into ShieldLend programs. The TypeScript PER SDK builders are verified but no on-chain PER transaction is submitted.

4. **MagicBlock Private Payments partially live** — Public API health/challenge/login/mint/balance/builders work. wSOL deposit and withdraw submitted on devnet. The private-transfer harness now runs SOL -> wSOL, login, mint check, deposit, balance polling, transfer namespace probing, and a submitted `base -> ephemeral` top-up retry. After deposit and after the top-up route, authenticated private-balance polling still does not show sufficient private wSOL credit for the same owner/mint, and transfer execution fails with Token Program `0x1` InsufficientFunds; router also still fails with `Blockhash not found`.

5. **MagicBlock TDX attestation challenge mismatch** — SDK 0.8.8 challenge format does not match current devnet TEE expected format. TEE RPC itself responds HTTP 200. Attestation verification is not claimed.

6. **Umbra native SOL payout not routed** — C2H withdraw releases native SOL to `WithdrawArgs.stealth_address` directly. Umbra SDK requires SPL/Token-2022. The SOL → wSOL wrap leg inside ShieldedPool is not implemented.

7. **Encrypt on-chain FHE not active** — Official upstream `encrypt-anchor` is still incompatible with Anchor 0.32.1 because of the `solana_account_info` crate-family split. ShieldLend vendors a minimal Anchor 0.32 compatibility fork and compile-wires a separate LendingPool request/reveal path, but no live Encrypt ciphertext/decryption-request round-trip is proven. gRPC `CreateInput` is still the only live Encrypt path.

---

## Claim Boundary

Allowed claims (confirmed by devnet evidence):

| Claim | Evidence |
|---|---|
| Three Anchor programs deployed on Solana devnet | `solana program show` output; Anchor.toml program IDs |
| Full Groth16 BN254 withdraw round-trip on devnet | Devnet tx signatures; 198,502 CU; pairing passed |
| Nullifier registry CPI and proof consumed | Devnet tx signatures |
| Umbra funded wSOL deposit/withdraw on devnet | Seven confirmed tx signatures above |
| Encrypt pre-alpha gRPC probe live | Ciphertext handle `DX9ipt7W...QwEZ` returned |
| MagicBlock TEE + Router RPC HTTP 200 | `check-magicblock.mjs` output |
| MagicBlock PER SDK builders verified | 13/13 SDK functions, 17/17 sidecar tests |
| MagicBlock Private Payments wSOL deposit/withdraw on devnet | `docs/MAGICBLOCK_PRIVATE_PAYMENTS.md`; tx signatures below |
| MagicBlock Private Payments funded private-transfer diagnosis | `docs/MAGICBLOCK_PRIVATE_PAYMENTS.md`; classified as MagicBlock API/router/TEE limitation because deposit and the submitted `base -> ephemeral` route do not expose usable private wSOL balance before Token Program `0x1` |
| IKA SDK/WASM confirmed with source-backed blockers | `check-ika.mjs` output |
| IKA Anchor CPI compile-wired + devnet DKG/dWallet transfer confirmed | `check:ika-cpi` + `smoke:ika-approval` output |
| IKA `approve_ika_borrow_message` CPI CONFIRMED on devnet (2026-05-11) | `smoke:ika-approval`; two approval tx signatures on record; `MessageApproval` PDAs created on-chain |

### IKA Approval Devnet Signatures

- [x] `approve_ika_borrow_message` tx 1: `m5trvfdGc2AtqXh4chLoKdo5cXfCCL7mE3EB7tKHynGdDN5RV12SzpkQX2DgzAFiwzcLtYdQSgBJ1cPPbbj9WBF`
- [x] `approve_ika_borrow_message` tx 2: `3AHThchU8EAjQ2aYsbrDy212JJvHPE3ajtLx2ZLKVBxJnfSHnRTTUeZxX2en2zz4UGmUuzMjU3sgbV5J9bkKZbk2`
- [ ] IKA gRPC presign/sign: blocked by `PresignForDWallet: unexpected end of input` (coordinator BCS schema mismatch)

Not allowed (must not claim):

- Production ZK trusted setup
- Production privacy
- IKA relay signing active end-to-end (approval CPI confirmed on devnet; gRPC presign/sign blocked by IKA pre-alpha coordinator BCS schema mismatch; IKA pre-alpha is single mock signer, not production MPC)
- MagicBlock Private Payments private transfer through the intended ephemeral/router path
- MagicBlock PER macros in Anchor programs
- MagicBlock TDX attestation verified

### MagicBlock Private Payments Devnet Signatures

- [x] wSOL wrap: `2q5FC6r6HpR2FmKt9nfB1ZjHEYEgAszzBCe73NVxiCeyoYDhd3dePdHVLuJetsWmbWYW2svstPNUpjEf9ZwPPhuP`
- [x] MagicBlock deposit: `UtqpXCERPPZoP1HNPXzj1Frmh7MtqXGiE66GMnpZvvrziNQL1YrWVzFfShYB4EU4HAnofmdeJXNhjb1C96XPFct`
- [x] MagicBlock withdraw: `4FXm5NYmEf9gTXdGWGUiHB7BzEEXTaAB1WW6GhDS6QN4XKmEtH9Cw9hkRBAsqxHST2M9En39MTwfbLqNV5c9WRpP`
- [x] Latest wSOL wrap + SyncNative: `Z9YyUK7y7iUwkKQo73chxngq9V2X45Q6Emrv6KRJoKj2roZjibH6nWnSruB8kPf3X4ZnXqFb6ehCjZQviQMFVM1`
- [x] Latest MagicBlock deposit/withdraw check deposit: `28hBK6aKZzYoZ5uYynu2QkYG5sLJ7zWAiEacTodfFN22cvCcb4Meu57xEcEeFLFJwqBUL1yGLn9Mn2R5wdE3LgZF`
- [x] Latest MagicBlock deposit/withdraw check withdraw: `5SiFVzahhkmQaD8uM4qhWWgTBhKDjcEccm6ui7L4ryAtZJiygZGnUQ1fNDuP9K9w9eFe5rUtyibR3hoc96hQHBBn`
- [x] Funded private-transfer check deposit: `51eRJbsp8mDMGRcacCmwtf6BV84Mgo5V28D6GRLygBqbrmnbXQHL3CPNJEM9E7JPBS5wCRGAHDcWxi3frCQRsiFZ`
- [x] Funded private-transfer retry wSOL wrap: `2hCZ9opwH4L9mhgGV6rsQSRP7R6QGn7ddhpVKirLUg5Q2Daj9awvHBPoAEi8EhtYpgqykBzA9ZEdETR2xV4KttBX`
- [x] Funded private-transfer retry deposit: `4kiDc7ZgQ4XU3KMGqHK4VodAorK9BTtGbfLrVi9Rhi5dBpcfqGTh7GVTwPjDf6WpPjHTBcgZ1eokjNc2i2u3JdDs`
- [x] Private-transfer namespace retry deposit: `3PZH1cguYCd9QUb5Rdvb72So59UbNrfriYbrUdZyGf1YvEm7WgCyHKLbxrZdbx1zFEwZWuMMXdzuxJbXzh8ry7ed`
- [x] Private-transfer namespace retry wSOL wrap: `XRAyJP9aKLU9pBetQPAjxn276xWMEtsrEBXKJBDKg6cUQyftxz1rvhai5L2mnbBpKBpj5ePenKVSUMo5NEAfwRf`
- [x] Private-transfer namespace retry `base -> ephemeral` top-up: `34r7RQe2Acea6VCn3TLLCQJYUB6VjBPukWqt63c7uQEEkYWbSwgwrSaJNLVg74HLAuW9jrRn2fPkL81LtDogRHL9`
- [x] 2026-05-11 deposit/withdraw run — wSOL wrap: `3H1Gthzf5P5zXLkfxUs1GvRNdaVjS9nBdojaE9mi4Qu4fS8rMyBL3dWWm1KpRNVWCv4GCV7Ca9T1z8HiSQt4t9Cd`
- [x] 2026-05-11 deposit/withdraw run — deposit: `4nPf5MCPHrpssBH4dnRfzVvXYBTfsNqde1jCmNTSKn8G1A67wSqjHg1oRA5tbnuPRx7nfNJ5xa1oxPzEm61kGp1Z`
- [x] 2026-05-11 deposit/withdraw run — withdraw: `2jdcAiFGZRqqCsdgH6jNLWxRAtE1noPsF3KVw45jStuc8PjbEfiHuP2wvVDYGL2TsdhUQUaPVJHDj71Y9aYkeKG3`
- [x] 2026-05-11 private-transfer run — deposit: `C2FXHGmDSJG6nzbRH39vS6sntw1FpKYQTu221QuekhdLrKGJPPDzgi4JroEzjuRizWhWuQuRazq3ZNT8RMrb4Yr`
- [x] 2026-05-11 private-transfer run — base→ephemeral top-up: `xrtkQrWS75Wz8t1pXK2yQAwnzJzTyMvgWHVubZFe1uaGZLxzrjurYymbkEvQojRAWLt6eyhPNVNjU9zbWv73rTw`
- [ ] MagicBlock private transfer through ephemeral/router RPC: blocked — 12 authenticated private-balance polls return `"balance":"0"` after deposit + top-up; router `Blockhash not found`; TEE/base Token Program `0x1`
- Umbra native SOL ShieldLend payout
- Encrypt on-chain FHE active

---

## Final Pre-Submission Checklist

- [x] `npm run typecheck:frontend` exits 0
- [x] `npm run build:frontend` exits 0
- [x] `node scripts/demo-status.mjs` exits 0 and prints expected claim boundary
- [ ] `node scripts/check-encrypt.mjs` exits 0
- [ ] `node scripts/check-umbra.mjs` exits 0
- [x] `node scripts/check-magicblock.mjs` exits 0
- [x] `node scripts/magicblock-private-payments-live.mjs --dry-run` exits 0
- [x] `node scripts/magicblock-private-payments-live.mjs --live-deposit-withdraw` submitted (2026-05-11)
- [ ] `node scripts/check-ika.mjs` exits 0
- [ ] All six demo video scenes recorded
- [ ] All five screenshots captured
- [ ] C2H devnet tx signatures filled in above
- [ ] GitHub branch pushed
- [ ] Submission form filled with GitHub branch URL and one-liner
