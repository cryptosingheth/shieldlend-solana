# PR — Core Privacy UI

**Branch**: `feat/core-privacy-ui`
**Off**: `main` at `2816be4`
**Commits**: 12
**Net diff**: ~520 lines added / ~55 lines removed across 8 files
**Tests**: `cargo test --workspace` PASS · `npm run typecheck:frontend` PASS · `npm run build:frontend` PASS · `npm run demo:status` PASS
**Dependency added**: `zustand` (frontend workspace only)

---

## TL;DR

Ships the **shippable shape of ShieldLend** — the protocol's working privacy property (on-chain Groth16 ring proof + nullifier registry + IKA approve_message CPI) is now reflected in a working UI, with honest "Core Privacy" vs "Full Privacy roadmap" tiering that replaces the previous binary "Degraded" framing.

Also fixes the **root cause of every "buttons not working" report** during development: the production CSP forbade `eval()`, which broke Next.js dev mode's Fast Refresh and prevented React from hydrating at all in dev. Production CSP retains its strict policy.

Adds **session persistence** via zustand so page refresh no longer forces re-Connect or re-Unlock, while keeping the AES vault key non-extractable and auto-locked on tab close.

No program code changes. No redeploys. Entirely frontend + docs + one CSP config tweak.

---

## ✅ What works today, fully in the UI

| Feature | Status | How to verify |
|---|---|---|
| **Connect Phantom** | Real, auto-reconnects on refresh | Click chip — popup or silent reconnect |
| **Sign + unlock note vault** (AES-256-GCM + HKDF from wallet signMessage) | Real, auto-unlocks on refresh from sessionStorage | Click chip — Phantom popup → sign |
| **Submit deposit** to `shielded_pool` on devnet | **Real on-chain transaction** signed by Phantom | Deposit tab → 0.1 SOL → Submit deposit → notice shows real tx signature |
| **Create local note only** (no on-chain) | Local crypto-vault only | Deposit tab → 0.1 SOL → Create local note only |
| **Export / Import note vault backup** (encrypted JSON) | Real AES round-trip | Positions tab → Export backup → Import backup in another tab |
| **Positions list** with encrypted note rows | Real | After deposit, see your note appear |
| **History tab** with encrypted activity log | Real | Every deposit logs an entry with real tx signature |
| **Lock Vault** chip toggle | Real | Click VAULT UNLOCKED → clears CryptoKey + sessionStorage |
| **Active screen + withdraw destination mode persisted** | Real | Refresh on Withdraw tab → still on Withdraw |
| **Borrow screen — evidence of confirmed devnet round-trip** | Real, with two clickable IKA tx signature links | Borrow tab → see 2 approve_ika_borrow_message tx sigs from 2026-05-11 |
| **Repay screen — upstream blocker classification** | Honest disclosure | Repay tab → see `magicblock_api_router_tee_limitation` |
| **Privacy rail status panel** — Core (4 green) + Roadmap (6 amber) | Real, env-driven | Positions tab → scroll to panel |
| **Top-bar chip** showing Core Privacy / Full Privacy / Degraded | Real | After Phantom connect on devnet → "Core Privacy" |
| **Pre-alpha disclosure banner** | Mode-aware text | Reflects whether Core rails are healthy |

---

## ⚠️ What is intentionally disabled (next sprint)

| Feature | Why disabled | Disabled-state UX |
|---|---|---|
| **Submit withdraw** button | Two reasons: (1) in-UI snarkjs proof gen + Phantom-signed submit handler not yet wired, (2) withdraw_ring circuit enforces a K=16 anonymity-set on-chain — fresh notes are only withdrawable once 16 unique commitments are in the Merkle tree (ZK protocol property, not a UI gap) | Button disabled with tooltip explaining both reasons + cites `scripts/devnet-fullround.mjs` (198,502 CU on-chain Groth16 evidence, uses DEV/TEST smoke vectors not user notes) |
| **wSOL via Umbra** mode submit | Adapter is post-withdraw roundtrip script, not UI submit | Mode picker still works; the action requires running `scripts/devnet-wsol-umbra-roundtrip.mjs` |
| **Borrow submit handler** | Real flow lives in `scripts/ika-anchor-approval-smoke.mjs` (1568 lines, Node.js); React port is post-submission | Screen shows real devnet evidence (2 confirmed tx signatures); no submit button |
| **Repay submit handler** | Blocked by `verify_private_payment_receipt` fail-closed gate at `programs/lending_pool/src/lib.rs:641-642` (upstream: MagicBlock private-transfer endpoint) | Screen names the exact blocker + classification + unblock path |
| **Liquidation reveal verify** | Blocked by `verify_encrypt_proof` fail-closed at `programs/lending_pool/src/lib.rs:645-650` (upstream: Encrypt threshold decryption callback) | Disclosed in IMPLEMENTATION_STATUS.md |

---

## 🛣 Roadmap — what's left for production

| # | Item | Effort | Blocker |
|---|---|---|---|
| 1 | In-UI withdraw submit handler — snarkjs.fullProve() in browser, then store_withdraw_proof + withdraw via Phantom | 2-3h | Requires K=16 anonymity-set + at minimum 1 real on-chain deposit by user |
| 2 | VRF dummy-commitment insertion at flush_epoch (would fill the K=16 ring sooner) | 4-6h on Mac/Linux | Real MagicBlock VRF SDK wiring; redeploy `shielded_pool` |
| 3 | In-UI borrow submit handler — collateral_ring proof gen + IKA approve_message CPI from React | 8-12h | Port of `scripts/ika-anchor-approval-smoke.mjs` to browser; IKA SDK in browser |
| 4 | Real in-UI repay | n/a | Upstream: MagicBlock Private Payments private-transfer endpoint must accept `sendTo=ephemeral` |
| 5 | Production trusted setup ceremony (pot14 → pot28) | 1-3 days | Multi-contributor Powers of Tau ceremony |
| 6 | PER macros (`#[ephemeral]`/`#[delegate]`/`#[commit]`) on `shielded_pool` queue accounts | 4-8h on Mac/Linux | Anchor 0.32 + redeploy + retest full C2H round-trip |
| 7 | Umbra native SOL → wSOL bridge inside `shielded_pool::flush_exits` | 6-10h on Mac/Linux | Touches the withdrawal path; risk to existing 198,502 CU C2H green |
| 8 | Live Encrypt FHE decryption verify keeper | 4-6h on our side; weeks on Encrypt side | Encrypt team must deliver the threshold callback for 3rd-party caller programs |
| 9 | IKA gRPC `PresignForDWallet` full sign flow | n/a (upstream) | IKA team publishes pre-alpha BCS schema or fixes their coordinator |

The post-submission roadmap is detailed in [`docs/MAC_DEV_HANDOFF.md`](MAC_DEV_HANDOFF.md) (when committed) — written for a Mac/Linux developer with Anchor 0.32 + Solana CLI installed.

---

## What changed (functional)

### 1. Two-tier protocol mode

`ProtocolMode` now has three states: `core`, `full`, `degraded`. Each privacy rail carries a `tier: "core" | "full"` label.

| Tier | Rails | What's protected |
|---|---|---|
| **Core Privacy** | Programs deployed, ZK artifacts, groth16-solana verifier, nullifier registry | Amount privacy via on-chain Groth16 BN254 ring proof + Active/Locked/Spent nullifier state machine |
| **Full Privacy roadmap** | IKA, MagicBlock PER, VRF, Private Payments, Encrypt FHE, Umbra SDK | Signer privacy, execution privacy, randomness, repayment privacy, FHE oracle, address-layer output privacy |

`modeFromRails()` returns `"full"` if every rail is healthy, `"core"` if the 4 Core rails are healthy, otherwise `"degraded"`.

### 2. Tiered chip + banner + rail panel

- **Chip**: reads `Core Privacy` (green), `Full Privacy` (privacy color), or `Degraded` (amber). Tooltip explains the distinction.
- **Banner**: dynamic copy — in Core mode it names what's protected and explicitly lists the Full Privacy roadmap rails. Previously the banner always said "Programs not deployed. ZK artifacts stale. All 8 rails offline" — factually wrong on `main` today.
- **Rail status panel**: split into "Core Privacy — live on devnet" (4 rails) and "Full Privacy roadmap — pre-alpha" (6 rails).

### 3. Evidence-backed Borrow + Repay screens

Replaced `<BlockedFlow>` stubs with real evidence panels showing tx signatures, file paths, and upstream blocker classifications. Tx-signature anchors open Solana Explorer (this is standard Web3 UX — viewing a tx hash is proof, not redirect).

### 4. Phantom canonical-namespace detection + connect hardening

`getPhantomProvider()` checks `window.phantom.solana` first (current Phantom docs), falls back to `window.solana` legacy only if `isPhantom` is set. `connectWallet`:

- Wraps `provider.connect()` in try/catch so rejections surface to the on-page notice
- Sets the "Connected: ..." message immediately after `connect()` resolves
- Logs to console for self-diagnosis
- DOM `addEventListener('click')` fallback wired alongside React onClick

### 5. Zustand session persistence

Two stores with split persistence backends ([`frontend/src/lib/stores/uiStore.ts`](../frontend/src/lib/stores/uiStore.ts)):

| Slice | Backend | Persists | What it enables |
|---|---|---|---|
| `useUiPrefs` (lastAddress, activeScreen, withdrawDestinationMode) | `localStorage` | Across browser sessions | Phantom silent auto-reconnect; refresh keeps you on the same tab |
| `useVaultSession` (keyMaterialHex, keyAddress) | `sessionStorage` | Across page refresh, **NOT** across tab close | F5 auto-unlocks the vault by re-deriving the AES key from cached signature bytes |

**Vault auto-lock on tab close** is intentional — caps the lifetime of the signature material that derives the encryption key. New "Lock Vault" toggle on the chip lets users manually lock without waiting for tab close.

**Security note** (also in the source file): caching signature bytes in sessionStorage is XSS-readable for the tab session duration. Acceptable for a devnet demo; production should use IndexedDB with non-extractable CryptoKey + idle-timeout auto-lock.

### 6. The root-cause CSP fix

`frontend/next.config.mjs` previously set `script-src 'self' 'wasm-unsafe-eval'` for both dev and production. Production CSP forbidding `eval()` is correct. Applying the same CSP in dev broke Next.js Fast Refresh — its React Refresh runtime needs `eval()` for HMR. Without it the runtime crashed at boot, React never hydrated, and **no event handlers bound** — including every button.

Fix: relax CSP only in dev (`NODE_ENV !== "production"`). Production retains the original strict policy.

This was the root cause of every "Connect Phantom does nothing" / "Withdraw button does nothing" / "no buttons work" report during development.

### 7. Stale-claims cleanup + segmented CSS fix

- `WhatWorksTodayPanel` previously said "Withdraw / Borrow / Repay UI — intentionally blocked" and "NullifierRegistry CPIs scaffolded, not executed end-to-end" — both factually wrong (borrow CPI confirmed on devnet today; Borrow/Repay screens are evidence-backed now). Updated.
- `.segmented` CSS used hardcoded `grid-template-columns: repeat(2, ...)` which wrapped the 3-button Withdraw destination picker onto two rows. Now uses `grid-auto-flow: column` so any number of buttons fit on one row.

---

## What was NOT changed

- ❌ No changes to any `programs/*` Rust source
- ❌ No redeploys, no new program IDs
- ❌ No changes to the actual on-chain protocol behavior
- ❌ No changes to the existing devnet round-trip (`scripts/devnet-fullround.mjs` still produces 198,502 CU withdraw on the same program IDs)
- ❌ No changes to `Anchor.toml`, root `Cargo.toml`, the Solana workspace deps
- ❌ No changes to any privacy-rail adapter logic (`frontend/src/lib/privacyRails/*` untouched)
- ❌ No changes to `cargo test --workspace` (still 47 tests, all passing)
- ❌ No new claims promoted in `SUBMISSION_CHECKLIST.md` — UI now surfaces existing claims more accurately

---

## Test plan (manual QA — ~10 minutes, mostly inspection)

### Pre-test

```bash
git checkout feat/core-privacy-ui
cd frontend && cp .env.devnet.example .env.local  # if .env.local doesn't exist
cd ..
npm install              # zustand was added
npm run dev              # starts dev server on http://localhost:3000
```

Open Chrome + Phantom installed, Phantom switched to Solana Devnet.

### Tests

| # | Test | Expected |
|---|---|---|
| T1 | Open page, DevTools Console | Page loads. Console shows `[ShieldLend] Page mounted — React hydration OK`. Zero red CSP errors. |
| T2 | Top-right chip | "Core Privacy" in green |
| T3 | Banner | Amber, starts with "CORE PRIVACY ACTIVE — FULL PRIVACY RAILS ARE ROADMAP" |
| T4 | Privacy rail status panel | 4 green Core rows + 6 amber/red roadmap rows |
| T5 | Click **Connect Phantom** | Notice: `Connected: HEm…CJtC`. Chip text updates to truncated address. |
| T6 | Click **UNLOCK VAULT** | Phantom popup → Approve. Notice: vault unlocked. Chip says VAULT UNLOCKED. |
| T7 | **Refresh the page** (F5) | Auto-reconnects (no popup). Auto-unlocks vault from sessionStorage. Notice: "Welcome back — vault restored from session." |
| T8 | Click **Deposit** tab → 0.1 SOL → "Submit deposit" (NOT "Create local note only") | Phantom popup → Approve → notice shows real devnet tx signature; History tab shows it. **This is a real on-chain Phantom-signed transaction.** |
| T9 | Click **Withdraw** tab → "Direct SOL" mode | Green Core Privacy banner. Action button reads "Submit withdraw (UI binding — next sprint)" and is disabled. Hover tooltip explains K=16 anonymity-set requirement + scripts/devnet-fullround.mjs evidence. |
| T10 | Click **Borrow** tab | Green "Backend confirmed end-to-end on devnet" banner. Two clickable IKA tx-signature links. Wired-vs-roadmap checklist. |
| T11 | Click **Repay** tab | Amber "Pending MagicBlock Private Payments unblock" banner. Names `verify_private_payment_receipt` + `magicblock_api_router_tee_limitation`. |
| T12 | Click chip "VAULT UNLOCKED" | Vault locks. Notes/history clear from memory. sessionStorage cleared. |
| T13 | Close tab, reopen | Auto-reconnects from localStorage. Vault stays locked (sessionStorage cleared on tab close). |

### Automated checks

```bash
npm run typecheck:frontend    # PASS
npm run build:frontend        # PASS (Next.js production build)
npm run demo:status           # PASS
cargo test --workspace        # PASS (47 tests, unchanged)
```

---

## Commit-by-commit

| Commit | Title |
|---|---|
| `ea32695` | feat(rails): tier protocol rails into Core + Full Privacy |
| `8cc7f55` | feat(ui): render tiered Core / Full Privacy status |
| `69e0932` | feat(withdraw): enable Core Privacy direct stealth-address path |
| `638ac49` | feat(borrow,repay): replace BlockedFlow with evidence-backed screens |
| `f5e63d9` | fix(wallet): detect Phantom via window.phantom.solana canonical path |
| `1de07de` | fix(connect): show 'Connected: ...' message immediately after wallet.connect() |
| `b77aa42` | fix(connect): add DOM-listener fallback + diagnostic console logs |
| `b8e57b0` | **fix(dev): allow unsafe-eval in dev CSP so Next.js Fast Refresh can hydrate** ← THE ROOT-CAUSE FIX |
| `6b1306d` | docs: add Core Privacy UI PR description, test plan, and reviewer checklist |
| `25ed2b4` | fix(ui): reconcile stale claims + remove Explorer-redirect buttons |
| `09cddca` | feat(session): zustand persistence for wallet + vault session + UI prefs |
| `428b03a` | docs(withdraw): surface K=16 anonymity-set requirement in disabled-state copy |

---

## Demo video script (post-merge)

5-minute walkthrough — every click resolves to verifiable state, no Explorer detours required.

1. **Open http://localhost:3000** (after `npm run dev`) — show the "Core Privacy" chip, amber banner.
2. **Connect Phantom** — chip updates to address.
3. **UNLOCK VAULT** — Phantom popup → sign → vault unlocked.
4. **Deposit tab** — 0.1 SOL → Submit deposit → Phantom popup → approve → notice shows real tx signature.
5. **Positions tab** — note appears in vault.
6. **History tab** — deposit recorded with tx signature.
7. **Withdraw tab** — show the green Core Privacy banner, the disabled button, hover tooltip explaining K=16 anonymity-set.
8. **Borrow tab** — show two confirmed IKA tx signature links.
9. **Repay tab** — show the upstream blocker classification.
10. **Refresh page** (F5) — show that Phantom auto-reconnects and vault auto-unlocks (no popups needed).
11. **Privacy rail status panel** — show Core (4 green) vs Roadmap (6 amber/red).

Total: ~3-5 minutes. Every screen shows real state.

---

## Reviewer checklist

- [ ] Pull the branch, confirm 12 commits on top of `main`
- [ ] Run automated checks (typecheck / build / demo:status / cargo test) — all PASS
- [ ] Run through tests T1–T13 manually in Chrome
- [ ] Confirm `git diff main..feat/core-privacy-ui --stat` shows ~520+ insertions / ~55 deletions across the expected files only
- [ ] Verify Connect Phantom + UNLOCK VAULT + Refresh actually persists (T7 is the key test for the zustand work)
- [ ] Confirm no program code, scripts, or Anchor config touched
- [ ] Approve and merge

After merge, this branch can be deleted. Roadmap items continue on separate branches per `docs/MAC_DEV_HANDOFF.md`.
