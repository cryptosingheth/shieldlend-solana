# Context Index — ShieldLend Solana

Key files and folders. After `/clear`, load: AGENTS.md → CLAUDE.md → SESSION_HANDOFF.md → CURRENT_TASK.md → this file.

---

## Workspace Identity

| Item | Value |
|---|---|
| Canonical path | `/Users/opinderpreetsingh/Projects/shieldlend-solana` |
| Old paths (do not use) | iCloud/Codex Workspace copies archived; `~/shieldlend-solana` archived |
| EVM repo (separate) | `~/shieldlend-v2` — do not modify unless explicitly asked |
| Branch | `upgrade/anchor-032-privacy-rails` |
| Remote: origin | `https://github.com/cryptosingheth/shieldlend-solana.git` |

## Agent Instructions

| Path | Purpose |
|---|---|
| `AGENTS.md` | Codex-compatible project instructions; points to `.ai/` as shared project memory |
| `CLAUDE.md` | Claude Code project context; use as reference only, avoid duplicating global Claude-specific rules |

---

## Build & Test Commands

| Command | What it does |
|---|---|
| `npm run check:env` | Validates CLI tools + env vars |
| `npm run test:programs` | `cargo test --workspace` (Rust unit tests) |
| `npm run test:anchor` | `anchor test` (requires Anchor CLI) |
| `npm run build:frontend` | Next.js production build |
| `npm run typecheck:frontend` | TypeScript type check |
| `npm run circuits:compile` | Compiles all 3 circom circuits to `build/circuits/` |
| `anchor build` | Compiles Anchor programs + generates IDLs (requires Anchor CLI) |
| `anchor keys list` | Shows program IDs (use to replace placeholders) |

**CLI prerequisites**:
- `solana` CLI installed
- `anchor` CLI installed (`0.32.1`)
- `circom` installed (`2.2.3`)
- `snarkjs` available (`0.7.6`; `--version` prints usage and exits non-zero)

---

## Programs (Anchor / Rust)

| Path | ID (placeholder) | Role |
|---|---|---|
| `programs/shielded_pool/` | `9Bvt3jMawHFRRxpaQTtV5VvFdpZkmAZtvwjTrAX9TAtE` | SOL custody; Poseidon Merkle; epoch deposit queue; VRF flush |
| `programs/lending_pool/` | `HLtWrvLyc2SE3ERWHaEdY4RG84GxFfHv3Qf4NzJPxaF7` | Accounting only (no SOL); interest model; borrow/repay/liquidation |
| `programs/nullifier_registry/` | `E42nSmqvSCuC1EWbmzYqsdLHimBMeuZyir5dB5gE24rF` | PDA nullifier set; Active/Locked/Spent state machine |
| `Anchor.toml` | — | Workspace config; cluster = Localnet; wallet = `~/.config/solana/id.json` |
| `Cargo.toml` | — | Root workspace; `anchor-lang = "0.32.1"` |

---

## ZK Circuits

| Path | Status |
|---|---|
| `circuits/withdraw_ring.circom` | Compiles; browser WASM generated; zkey/vkey blocked without `.ptau` |
| `circuits/collateral_ring.circom` | Compiles; browser WASM generated; zkey/vkey blocked without `.ptau` |
| `circuits/repay_ring.circom` | Compiles; browser WASM generated; zkey/vkey blocked without `.ptau` |
| `frontend/public/circuits/*.wasm` | Generated 2026-05-05 by `scripts/generate-zk-artifacts.mjs` |

---

## Frontend

| Path | Purpose |
|---|---|
| `frontend/src/lib/circuits.ts` | snarkjs proof generation |
| `frontend/src/lib/noteStorage.ts` | AES-256-GCM note vault |
| `frontend/src/lib/solanaClient.ts` | Wallet/RPC/program instruction boundaries; PROGRAM_IDS |
| `frontend/src/lib/privacyRails/umbra.ts` | Official Umbra SDK adapter, fail-closed route planning, SPL/Token-2022 action wrappers |
| `frontend/src/app/` | Pages: Deposit, Withdraw, Borrow, Repay, Positions, History |
| `frontend/package.json` | Next.js 15, React 19, @solana/web3.js, @ika.xyz/sdk, @encrypt.xyz/pre-alpha-solana-client, @umbra-privacy/sdk |

---

## Docs

| Path | Purpose |
|---|---|
| `docs/architecture.md` | Anchor program designs, account models, CPI flows, ZK circuit specs |
| `docs/PRIVACY_AND_THREAT_MODEL.md` | Privacy properties, adversary model, residual risks |
| `docs/DESIGN_DECISIONS.md` | Full ADR log |
| `docs/HACKATHON.md` | Track-by-track integration details (IKA, MagicBlock, Umbra) |
| `docs/NOTE_LIFECYCLE.md` | Note state machine, three-step liquidation, protocol parameters |
| `docs/VISUAL_FLOWS.md` | User flow diagrams with protocol explanations |
| `docs/USER_JOURNEYS_AND_TEST_PLAN.md` | Product journey matrix + pass/block status |
| `docs/IMPLEMENTATION_PLAN.md` | Phase-by-phase implementation checklist |
| `docs/DESIGN_PLAN.md` | Product/UI design direction and screen planning |
| `docs/ANCHOR_032_UPGRADE.md` | Anchor 0.32.1 upgrade ledger, validations, and warnings |
| `security-checklist.md` | Pre-submission security review checklist |

---

## Config & Scripts

| Path | Purpose |
|---|---|
| `.env.example` | All env vars needed (Solana, MagicBlock, IKA, Encrypt, Umbra) |
| `scripts/check-env.mjs` | Validates cargo, solana, anchor, circom, snarkjs + env vars |
| `scripts/check-ika.mjs` | IKA SDK + Anchor CPI compile-wiring probe; no network call |
| `scripts/ika-anchor-cpi-diagnostic.mjs` | Reports IKA CPI authority PDA, local compile wiring, and missing external dWallet/message approval state |
| `scripts/check-umbra.mjs` | Validates Umbra SDK package, program ID, devnet indexer health, relayer health |
| `scripts/umbra-smoke.mjs` | Initializes Umbra SDK client and queries devnet user account without submitting token action |
| `package.json` | Root workspace scripts |

---

## Tests

| Path | Purpose |
|---|---|
| `tests/shielded_pool.ts` | Anchor test scaffold |
| `tests/lending_pool.ts` | Anchor test scaffold |
| `tests/nullifier_registry.ts` | Anchor test scaffold |
| Rust unit tests (inline) | 8 categories: denominations, root retention, fail-closed guards, rate model, interest accrual, writer auth |

---

## Recent Git Context

| Commit | Context |
|---|---|
| `dafc627 Implement ShieldLend Solana MVP scaffold` | Added Anchor workspace, three programs, circuits updates, frontend MVP shell, integration adapters, tests, env script, design files, and security checklist |
| `bbb8a09 docs: remove internal evm lineage references` | Cleaned docs for standalone Solana framing |
| `09b5404 docs: consolidate solana architecture docs` | Consolidated Solana architecture documentation |

---

## External Resources

| Resource | Notes |
|---|---|
| `https://github.com/cryptosingheth/shieldlend-solana.git` | Standalone public GitHub repo (last pushed: `bc891b9`) |
| `groth16-solana` crate | On-chain BN254 Groth16 verifier — not yet wired |
| MagicBlock PER/VRF/PrivatePayments | Discord: `discord.com/invite/MBkdC3gxcv` — join for devnet access |
| IKA dWallet | Pre-alpha gated devnet — single mock signer; `lending_pool` has compile-level `approve_message` CPI wiring, but no live approval tx |
| Encrypt FHE | Pre-alpha — plaintext on-chain storage, no real encryption yet |
| Umbra SDK | Solana mainnet alpha (Feb 2026) — strongest ready integration |

## Audit Reports (new — 2026-05-03/04)

| Path | Purpose |
|---|---|
| `audit-reports/00_AUDIT_BRIEF.md` | Discovery brief — component map, status classifications, unknowns |
| `audit-reports/01_ARCHITECTURE_IMPLEMENTATION_REVIEW.md` | Architecture vs implementation gaps (Pass 1+2 merged) |
| `audit-reports/02_ZK_CIRCUIT_REVIEW.md` | Circuit constraints, signal ordering, artifact status (Pass 1+2 merged) |
| `audit-reports/03_SOLANA_ANCHOR_REVIEW.md` | Anchor account constraints, CPI gaps, signer trust (Pass 1+2 merged) |
| `audit-reports/04_BACKEND_INTEGRATION_REVIEW.md` | Adapter stubs, API routes, receipt trust (Pass 1+2 merged) |
| `audit-reports/05_FRONTEND_PRIVACY_REVIEW.md` | Client crypto, relay path, rail status accuracy (Pass 1+2 merged) |
| `audit-reports/06_PRIVACY_THREAT_MODEL_REVIEW.md` | Privacy claim vs code reality, mode transitions (Pass 1+2 merged) |
| `audit-reports/07_TESTING_DEMO_READINESS_REVIEW.md` | Test coverage gaps, demo path, failure points (Pass 1+2 merged) |
| `audit-prompts/08_final_synthesis.md` | Prompt for final synthesis — not yet run |

---

## Needs Confirmation

- Current external protocol availability/status may have changed since these local files were written.
- Full Anchor IDL generation remains blocked by Anchor/proc-macro2 compatibility and should be handled separately.
