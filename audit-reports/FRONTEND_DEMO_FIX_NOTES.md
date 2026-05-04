# ShieldLend Frontend Demo Fix Notes

**Track**: Frontend / UI  
**Branch**: fix/frontend-demo-status  
**Date**: 2026-05-04  
**Source**: FINAL_AUDIT_REPORT.md findings D-01, D-02, B-01, C-05, C-06, E-01, E-03, C-07

---

## Summary

This pass makes the frontend privacy status truthful, demo-ready, and aligned with the final audit.
No backend program logic or ZK circuit files were modified.

---

## Changes Made

### A. Truthful UI (`frontend/src/app/page.tsx`)

1. **Pre-alpha / Scaffold Mode banner** — persistent red banner always visible at the top of the app.
   Clearly states: programs not deployed, ZK artifacts stale, all 8 required privacy rails offline, no
   privacy properties hold, do not use with real funds.

2. **Privacy rail status panel** — expanded from 5 rails to 9, now includes:
   - `programs_deployed` — defaults false (env: `NEXT_PUBLIC_PROGRAMS_DEPLOYED`)
   - `zk_artifacts` — defaults false (env: `NEXT_PUBLIC_ZK_ARTIFACTS_READY`)
   - `groth16-solana verifier` — hardcoded false (dependency not in Cargo.toml)
   - `IKA dWallet relay` — env-var gated (was already correct)
   - `MagicBlock PER` — **fixed**: was hardcoded `true`, now `Boolean(process.env.NEXT_PUBLIC_PER_ENABLED)`
   - `MagicBlock VRF` — hardcoded false (no VRF proof verification exists)
   - `MagicBlock Private Payments` — env-var gated (was already correct)
   - `Encrypt FHE` — env-var gated (was already correct)
   - `Umbra SDK` — optional, env-var gated (was already correct)
   Each rail shows CheckCircle (green) when healthy, XCircle (amber) when blocked, with an inline
   "Required for Full Privacy — unavailable" label on required-but-missing rails.

3. **Deposit signer warning** — prominent red warning box rendered before denomination cards:
   "Your Phantom wallet public key will be the permanent transaction signer for every deposit.
   The claim 'depositor wallet hidden' is false until the IKA relay is wired."

4. **Blocked flows unchanged** — Withdraw / Borrow / Repay remain in `BlockedFlow` components
   with updated reason strings listing exact prerequisites.

5. **"What works today / scaffolded / unsafe to claim" panel** — new panel on Positions screen
   with three columns: working now, scaffolded/fail-closed, unsafe to claim. Covers all 7 claims
   from audit Section 9.

6. **Protocol mode indicator** — `modeFromRails(FULL_PRIVACY_RAILS)` result shown in the topbar
   chip ("Full Privacy" vs "Degraded"). Currently always "Degraded".

7. **localStorage loss warning** — shown when wallet is connected but vault is not yet unlocked.

8. **Plaintext record warning** — shown when `hasPlaintextNotes()` or `hasPlaintextHistoryRecords()`
   detects pre-encryption records in localStorage.

### B. Privacy Status Code (`frontend/src/lib/protocolAdapters.ts`)

- **Critical fix**: `per.healthy` changed from hardcoded `true` to `Boolean(process.env.NEXT_PUBLIC_PER_ENABLED)`.
  Per audit finding D-02 / High severity finding N-01: no PER macros exist in any program.
- Added `programs_deployed` and `zk_artifacts` rails with env-var-backed defaults (false).
- Updated `RailStatus.key` union type to include the two new keys.
- `modeFromRails()` unchanged — already correctly returns "degraded" when any required rail is false.

### C. History Encryption (`frontend/src/lib/history.ts`)

- `loadHistory(address, vaultKey?)` — now async, decrypts AES-GCM records when vault key is provided.
  Plaintext records (from before this fix) are still loaded but without re-encryption.
- `appendHistory(address, record, vaultKey?)` — now async. When vault key provided: encrypts full
  record (AES-GCM-256). When no vault key: stores sanitized record without `commitment`,
  `nullifierHash`, `merkleRoot`, `proofPublicSignalsHash`, `settlementReceiptHash` to prevent
  plaintext secrets in localStorage.
- `hasPlaintextHistoryRecords(address)` — new helper, used for the plaintext warning banner.
- All callers in `page.tsx` updated to `await` both functions and pass `vaultKey`.

### D. Note Storage (`frontend/src/lib/noteStorage.ts`)

- `exportNotes(address, key)` — new export function. Produces encrypted JSON backup
  (format: `shieldlend-solana-notes-backup-v1`). Notes re-encrypted with vault key before export.
- `importNotes(address, key, backupJson)` — new import function. Decrypts backup, merges with
  existing notes (deduplicated by commitment), persists encrypted.
- `hasPlaintextNotes(address)` — new helper for the plaintext warning banner.
- `loadNotes` — adds `console.warn` when plaintext notes are found (audit finding C-07: silent
  promotion without warning was an XSS risk).

### E. Note Export/Import UI

- Export/Import buttons on Positions screen (vault must be unlocked).
- Browser `<a download>` triggers for export (encrypted JSON file).
- Hidden `<input type="file">` for import with file picker trigger.
- Warning text: "Export a backup after every deposit. localStorage loss means permanent note loss."

### F. Security Headers (`frontend/next.config.mjs`)

Added `headers()` config with the following headers on all routes:

| Header | Value | Note |
|---|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; ...` | `wasm-unsafe-eval` required for snarkjs WebAssembly instantiation |
| `X-Frame-Options` | `DENY` | Prevents clickjacking |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME sniffing |
| `Referrer-Policy` | `no-referrer` | No referrer sent to any third party |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Locks down browser APIs |
| `X-DNS-Prefetch-Control` | `off` | Prevents DNS-level information leakage |

**WASM exception documented**: `'wasm-unsafe-eval'` in `script-src` is intentional and required for
`snarkjs`/`circomlibjs`. Without it, `WebAssembly.instantiate()` fails silently in strict CSP environments,
breaking proof generation. The exception is commented in the config.

### G. README (`README.md`)

- **Current Build Status** table updated: removed stale TODO rows, added accurate scaffold status,
  noted missing artifacts explicitly.
- **Privacy Status** table: all 13 audit-flagged `✓` claims changed to `[NOT IMPLEMENTED]` with
  one-line evidence reference. Items that are genuinely implemented (note vault, history encryption,
  fixed denominations) retain `✓ — implemented`. Items designed but not yet deployed retain `✓ — designed`.

---

## What Is NOT Fixed In This Pass

These findings require backend, ZK, or cross-track work and are tracked in separate notes files:

| Finding | Track | Blocker |
|---|---|---|
| C-01: Cross-program CPI wiring absent | Backend | Requires Anchor program changes |
| C-07/C-10: Ring decoys are integers 2–16 | ZK | `circuits.ts:123–127` — ZK track owns |
| C-09: Domain separator = 13 | ZK | Requires circuit recompile and artifact regeneration |
| C-11: groth16-solana not in Cargo.toml | Backend | Requires Cargo.toml change |
| C-14: User wallet is relay signer | Backend+Frontend | Requires IKA integration in solanaClient.ts |
| ZK-A-01/02/03: Missing ZK artifacts | ZK | ZK track |

---

## Test Plan for This Fix

Run after applying this patch:

1. `npm run typecheck:frontend` — must pass with zero errors
2. `npm run build:frontend` — must succeed
3. Visual check: pre-alpha banner visible at top
4. Visual check: privacy rail panel shows 9 rails, all red/amber
5. Visual check: deposit screen shows signer warning
6. Vault unlock → export backup → download JSON file
7. Import the backup → note count unchanged
8. History records after vault unlock: verify localStorage contains no plaintext `nullifier`/`secret` strings
9. Check `per.healthy` is false in FULL_PRIVACY_RAILS (no env var set)

---

## Files Modified

```
frontend/src/lib/protocolAdapters.ts   — per.healthy fix, 2 new rails
frontend/src/lib/history.ts            — async + AES-GCM encryption
frontend/src/lib/noteStorage.ts        — export/import, plaintext warning
frontend/src/app/page.tsx              — full UI update
frontend/src/app/globals.css           — prealpha-banner, danger class, grid rows
frontend/next.config.mjs               — security headers
README.md                              — downgraded 13 false claims
```
