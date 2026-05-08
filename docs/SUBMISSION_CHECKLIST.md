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

### Umbra Devnet Signatures (Confirmed)

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
- [ ] Scene 3b: Terminal — run `node scripts/devnet-wsol-umbra-roundtrip.mjs` — show wSOL wrap + Umbra deposit + Umbra withdraw; note claim boundary printed in output
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
| `NEXT_PUBLIC_MAGICBLOCK_PRIVATE_PAYMENTS_URL` | Optional | Private Payments check — Discord-gated; adapter fails closed without it |
| `NEXT_PUBLIC_UMBRA_NETWORK=devnet` | Optional | Frontend Umbra network override |

---

## Known Limitations (Disclose to Judges)

These are implementation gaps, not design gaps:

1. **Trusted setup is DEV/TEST only** — `pot14` ceremony used during development. Production `pot28` ceremony requires a separate Powers of Tau ceremony. No production privacy is implied.

2. **IKA relay signing not active** — `ika-dwallet-anchor` CPI crate is not published as of this submission. All on-chain transactions use direct wallet signing. The deposit screen labels this "reduced privacy." Three source-backed blockers are documented in `scripts/check-ika.mjs`.

3. **MagicBlock PER Rust macros not in Anchor programs** — Anchor 0.30.1 is used to protect the confirmed Groth16 round-trip. PER requires `#[ephemeral]`, `#[delegate]`, `#[commit]` macros from Anchor 0.32.1. The TypeScript PER SDK builders are verified but no on-chain PER transaction is submitted.

4. **MagicBlock Private Payments not configured** — The API URL is Discord-gated. The adapter is wired and fails closed when the URL is absent.

5. **MagicBlock TDX attestation challenge mismatch** — SDK 0.8.8 challenge format does not match current devnet TEE expected format. TEE RPC itself responds HTTP 200. Attestation verification is not claimed.

6. **Umbra native SOL payout not routed** — C2H withdraw releases native SOL to `WithdrawArgs.stealth_address` directly. Umbra SDK requires SPL/Token-2022. The SOL → wSOL wrap leg inside ShieldedPool is not implemented.

7. **Encrypt on-chain FHE not active** — `encrypt-anchor` requires Anchor 0.32.1. Program-side integration is fail-closed. Only the gRPC client probe is live.

---

## Claim Boundary

Allowed claims (confirmed by devnet evidence):

| Claim | Evidence |
|---|---|
| Three Anchor programs deployed on Solana devnet | `solana program show` output; Anchor.toml program IDs |
| Full Groth16 BN254 withdraw round-trip on devnet | Devnet tx signatures; 198,502 CU; pairing passed |
| Nullifier registry CPI and proof consumed | Devnet tx signatures |
| Umbra funded wSOL deposit/withdraw on devnet | Seven confirmed tx signatures above |
| Encrypt pre-alpha gRPC probe live | Ciphertext handle `5VZ8BhpS...CA6y` returned |
| MagicBlock TEE + Router RPC HTTP 200 | `check-magicblock.mjs` output |
| MagicBlock PER SDK builders verified | 13/13 SDK functions, 17/17 sidecar tests |
| IKA SDK/WASM confirmed with source-backed blockers | `check-ika.mjs` output |

Not allowed (must not claim):

- Production ZK trusted setup
- Production privacy
- IKA relay signing active
- MagicBlock Private Payments live
- MagicBlock PER macros in Anchor programs
- MagicBlock TDX attestation verified
- Umbra native SOL ShieldLend payout
- Encrypt on-chain FHE active

---

## Final Pre-Submission Checklist

- [ ] `npm run typecheck:frontend` exits 0
- [ ] `npm run build:frontend` exits 0
- [ ] `node scripts/demo-status.mjs` exits 0 and prints expected claim boundary
- [ ] `node scripts/check-encrypt.mjs` exits 0
- [ ] `node scripts/check-umbra.mjs` exits 0
- [ ] `node scripts/check-magicblock.mjs` exits 0
- [ ] `node scripts/check-ika.mjs` exits 0
- [ ] All six demo video scenes recorded
- [ ] All five screenshots captured
- [ ] C2H devnet tx signatures filled in above
- [ ] GitHub branch pushed
- [ ] Submission form filled with GitHub branch URL and one-liner
