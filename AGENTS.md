# ShieldLend Solana — Codex Instructions

## Project Purpose

ShieldLend is a privacy-first lending protocol on Solana for the Colosseum Frontier Hackathon 2026. The target architecture combines Anchor programs, Groth16/Circom proofs, relay/private execution/payment rails, encrypted oracle/health computation, and stealth output addresses.

Current implementation posture is pre-alpha/MVP. Programs and frontend should fail closed when verifier keys, deployed programs, or external privacy rails are missing. Do not claim production privacy from stubs or gated pre-alpha integrations.

## Repository Identity

- Canonical local repo: `/Users/opinderpreetsingh/Projects/shieldlend-solana`
- Do not use old iCloud/Codex Workspace copies for active work.
- Do not touch the separate EVM repo (`~/shieldlend-v2`) unless explicitly asked.
- Remote is `origin` pointing to `https://github.com/cryptosingheth/shieldlend-solana.git`; verify remotes before any push.

## Shared Project Memory

Use `.ai/` as shared project memory across Codex and Claude Code:

- Start with `.ai/SESSION_HANDOFF.md`, `.ai/CURRENT_TASK.md`, `.ai/CONTEXT_INDEX.md`, and `.ai/DECISIONS.md`.
- Append durable progress to `.ai/TASK_LOG.md` when meaningful work is completed.
- Update `.ai/SESSION_HANDOFF.md` before ending a substantial session if current status, blockers, verification, or next actions changed.
- Update `.ai/CURRENT_TASK.md` when the active task changes or becomes stale.
- Update `.ai/DECISIONS.md` only for durable architectural/product decisions.

`CLAUDE.md` may contain project-specific context, but do not copy global Claude-specific behavior into this file and do not duplicate long content between the two instruction files.

## Tech Stack

- Solana Anchor workspace with three programs:
  - `programs/shielded_pool`
  - `programs/lending_pool`
  - `programs/nullifier_registry`
- Rust workspace using `anchor-lang = "0.30.1"`.
- Circom/Groth16 circuits under `circuits/`.
- Next.js frontend under `frontend/` with React, TypeScript, Tailwind, `@solana/web3.js`, `snarkjs`, IKA SDK, and Encrypt pre-alpha client.

## Build And Test Commands

Use the commands already defined in `package.json`:

- `npm run check:env` validates required tools and env vars.
- `npm run test:programs` runs `cargo test --workspace`.
- `npm run test:anchor` runs `anchor test` and requires Anchor/Solana tooling plus deployment readiness.
- `npm run typecheck:frontend` runs frontend TypeScript checks.
- `npm run build:frontend` builds the Next.js frontend.
- `npm run circuits:compile` compiles all three Circom circuits into `build/circuits/`.

Known current blockers from `.ai/`: Solana CLI and Anchor CLI may be missing; program IDs are placeholders until `anchor build` / `anchor keys list`; ZK artifacts and external protocol integrations are not production-ready.

## Codex Working Rules

- Inspect only the files needed for the task. Prefer high-signal files first: README, package/config files, `.ai/` memory, focused docs, and directly relevant source files.
- Do not commit, push, open PRs, or amend commits unless the user explicitly asks.
- Stage specific files only if committing is explicitly requested.
- Preserve fail-closed behavior for missing verifier keys, protocol SDKs, deployed programs, and privacy rails.
- Keep privacy claims aligned with implementation status: IKA and Encrypt are pre-alpha; MagicBlock/Umbra/groth16 work must be verified against current integration state before stronger claims.
- Do not add plaintext note-storage paths or fake demo success states.
- Keep SOL custody in `shielded_pool`; `lending_pool` remains accounting-only.
- Use Umbra SDK for stealth address work; do not add custom ECDH logic.
- Use `groth16-solana` for on-chain proof verification; do not replace it with remote verification.
- Before ending meaningful work, update the relevant `.ai/` memory files so the next agent can resume without rereading the whole repo.

## Unknowns To Verify Per Task

- Whether local Solana CLI, Anchor CLI, Circom, and snarkjs are installed.
- Whether current deployed program IDs exist or placeholder IDs are still in use.
- Whether external protocol SDK availability/status has changed since the last `.ai/` handoff.
- Whether docs or implementation have drifted from `.ai/` memory.
