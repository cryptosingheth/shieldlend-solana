# PR — Core Privacy UI

**Branch**: `feat/core-privacy-ui`
**Off**: `main` at `2816be4`
**Commits**: 8 (see "Commit-by-commit" below)
**Net diff**: ~310 lines added / ~30 lines removed across 5 files
**Tests**: `cargo test --workspace` PASS · `npm run typecheck:frontend` PASS · `npm run build:frontend` PASS

---

## TL;DR

This PR ships the **shippable shape of ShieldLend** — the protocol's working privacy property (on-chain Groth16 ring proof + nullifier registry) is now reflected in a working UI, with honest "Core Privacy" / "Full Privacy roadmap" tiering that replaces the previous binary "Degraded" framing.

It also fixes the **root cause of every "buttons not working" report** during the session: the production CSP forbade `eval()`, which broke Next.js dev mode's Fast Refresh and prevented React from hydrating at all.

No program code changes. No redeploys. Entirely frontend.

---

## What changed (functional)

### 1. Two-tier protocol mode

`ProtocolMode` now has three states: `core`, `full`, `degraded`. Each privacy rail carries a `tier: "core" | "full"` label.

| Tier | Rails | What's protected |
|---|---|---|
| **Core Privacy** | Programs deployed, ZK artifacts, groth16-solana verifier, nullifier registry | Amount privacy via on-chain Groth16 BN254 ring proof + Active/Locked/Spent nullifier state machine |
| **Full Privacy roadmap** | IKA, MagicBlock PER, VRF, Private Payments, Encrypt FHE, Umbra SDK | Signer privacy, execution privacy, randomness, repayment privacy, FHE oracle, address-layer output privacy |

`modeFromRails()` returns:
- `"full"` when every rail is healthy
- `"core"` when the 4 Core rails are healthy (regardless of Full Privacy rails)
- `"degraded"` otherwise

### 2. Top-bar chip + pre-alpha banner

- **Chip**: now reads `Core Privacy` (green), `Full Privacy` (existing privacy color), or `Degraded` (amber). Tooltip explains the distinction.
- **Banner**: copy is dynamic. In Core mode it names what's protected and explicitly lists which Full Privacy rails are roadmap. Previously the banner always said "Programs not deployed. ZK artifacts stale. All 8 rails offline" — which is factually wrong on `main` today.

### 3. Privacy rail status panel — split into two sections

- **Core Privacy — live on devnet** (4 rails)
- **Full Privacy roadmap — pre-alpha** (6 rails)

Each rail's role text now reflects accurate state (e.g. IKA: "approve_message CPI confirmed on devnet 2026-05-11; gRPC presign/sign still blocked by pre-alpha BCS schema mismatch").

### 4. Withdraw screen — Core Privacy direct path enabled

When `protocolMode` is `core` or `full` AND `destinationMode` is `direct_stealth_address`:

- A green Core Privacy banner explains what the on-chain Groth16 ring proof + nullifier spend protect
- The previously-disabled action button is now enabled
- Click opens `shielded_pool` on Solana Explorer so judges can immediately verify the 198,502 CU C2H withdraw round-trip

The in-browser submit handler (snarkjs proof generation + `store_withdraw_proof` + `withdraw` signing) is still scripted via `scripts/devnet-fullround.mjs` — wiring it into the React submit path is a follow-up. This commit ends the "all buttons disabled" UX while staying honest about what's wired.

### 5. Borrow + Repay screens — evidence-backed, not "intentionally blocked"

**Before**: both screens rendered `<BlockedFlow>` with a generic "intentionally blocked" message.

**After**:

- **Borrow** screen surfaces:
  - The two `approve_ika_borrow_message` tx signatures from 2026-05-11 with direct Solana Explorer links
  - The `lending_pool` program link
  - A checklist of what's wired vs roadmap (5 green ✅, 2 amber 🟡)
  - A button that opens `lending_pool` recent activity on Explorer
- **Repay** screen surfaces:
  - The exact fail-closed gate (`verify_private_payment_receipt`) and the upstream classification (`magicblock_api_router_tee_limitation`)
  - The unblock path with file path
  - What's already live for repay (6 items, 4 green ✅, 2 amber 🟡)
  - File path for the upstream tracking doc

### 6. Phantom detection on Chrome + Brave

`getPhantomProvider()` now checks `window.phantom.solana` (canonical) first, falls back to `window.solana` legacy only if `isPhantom` is set. `connectWallet` now:

- Wraps `provider.connect()` in try/catch so rejections surface to the on-page notice
- Sets the "Connected: ..." message immediately after `connect()` resolves (previously waited for `refreshAccount` RPC, which could hang or take 1–3 seconds)
- Logs to console for self-diagnosis when invoked
- Has a belt-and-suspenders `addEventListener('click')` fallback for paranoia

### 7. CSP relaxed in dev (the actual root cause fix)

`frontend/next.config.mjs` previously set `script-src 'self' 'wasm-unsafe-eval'` for both dev and production. Production CSP forbidding `eval()` is correct. Applying the same CSP in dev broke Next.js Fast Refresh — its React Refresh runtime needs `eval()` for HMR. Without it the runtime crashed at boot, React never hydrated, and **no event handlers bound** — including every button.

This was the root cause of every "Connect Phantom does nothing" / "Withdraw button does nothing" / "no buttons work" report.

Fix: relax CSP only in dev. Production retains the original strict policy.

---

## What was NOT changed

- ❌ No changes to any `programs/*` Rust source
- ❌ No redeploys, no new program IDs
- ❌ No changes to the actual on-chain protocol behavior
- ❌ No changes to the existing devnet round-trip (`scripts/devnet-fullround.mjs` still produces 198,502 CU withdraw on the same program IDs)
- ❌ No changes to `Anchor.toml`, `Cargo.toml`, the workspace dependencies
- ❌ No changes to any external SDK adapter logic (`frontend/src/lib/privacyRails/*` untouched)
- ❌ No changes to the `cargo test --workspace` test suite (still 47 tests, all passing)
- ❌ No new claims in `SUBMISSION_CHECKLIST.md` — the *evidence* the UI shows is the same evidence already in the checklist

---

## Test plan (manual QA — ~10 minutes)

### Pre-test setup

```bash
git checkout feat/core-privacy-ui
git log --oneline -8     # confirm 8 commits on top of main 2816be4
cd frontend && cp .env.devnet.example .env.local  # if .env.local doesn't exist
cd ..
npm install              # if first time on the branch
npm run dev              # starts dev server on http://localhost:3000
```

Then open `http://localhost:3000` in Chrome with Phantom installed and on Solana devnet.

### Test cases

| # | Test | Expected |
|---|---|---|
| T1 | Open http://localhost:3000 in fresh browser tab | Page loads. DevTools Console shows `[ShieldLend] Page mounted — React hydration OK`. No red errors. (Specifically: no `EvalError ... unsafe-eval is not an allowed source` errors.) |
| T2 | Top-right chip | Reads **"Core Privacy"** in green |
| T3 | Pre-alpha banner | Amber, starts with "CORE PRIVACY ACTIVE — FULL PRIVACY RAILS ARE ROADMAP", body names the 198,502 CU evidence + roadmap rails |
| T4 | Scroll to "Privacy rail status" panel | Shows two sections: **"Core Privacy — live on devnet"** (4 green ✅ rows) and **"Full Privacy roadmap — pre-alpha"** (6 amber/red rows) |
| T5 | Click **Connect Phantom** | Phantom popup appears (or silently auto-connects if pre-authorized). Console logs `[ShieldLend] Connect button clicked` and `[ShieldLend] connectWallet() invoked`. On-page notice shows `Connected: <short address>`. Top-right chip text changes to your wallet address. |
| T6 | Click **UNLOCK VAULT** | Phantom popup asks to sign a message. Approve. Notice shows "Local encrypted note vault unlocked..." |
| T7 | Click **Deposit** tab in sidebar | Deposit screen loads. Three denomination cards visible. "Submit deposit" and "Create local note only" buttons are now enabled (since wallet connected + vault unlocked) |
| T8 | Click **Withdraw** tab in sidebar → ensure "Direct SOL" mode is selected | Green Core Privacy banner appears explaining what the path protects. Action button reads "View shielded_pool on Solana Explorer". Click it → opens https://explorer.solana.com/address/9Bvt3jMawHFRRxpaQTtV5VvFdpZkmAZtvwjTrAX9TAtE?cluster=devnet in a new tab |
| T9 | Switch to **wSOL via Umbra** mode | Banner about wSOL Umbra settlement adapter still shows; the existing two-step roundtrip-script flow is unchanged |
| T10 | Click **Borrow** tab | New screen with two confirmed devnet tx signatures (clickable links to Solana Explorer), wired-vs-roadmap checklist, and an "Open lending_pool activity on Solana Explorer" button |
| T11 | Click **Repay** tab | New screen showing the upstream blocker classification (`magicblock_api_router_tee_limitation`), what's already wired for repay (4 ✅ rows), and the unblock path with file path reference |
| T12 | Refresh page once connected | Wallet stays connected; vault stays unlocked across the session; chip still reads Core Privacy |
| T13 | Disconnect Phantom from the site (via the Phantom extension popup) then reload | Should fall back to "Connect Phantom" text on the chip and the not-connected empty states |

### Automated checks

```bash
npm run typecheck:frontend    # PASS — exits 0
npm run build:frontend        # PASS — Next.js production build succeeds with same web-worker warning as main
npm run demo:status           # PASS — all green except expected DEV/TEST trusted setup warning
cargo test --workspace        # PASS — 47 tests unchanged
```

### What to watch for during testing

- **No 40+ red CSP errors on first page load.** If you see `Uncaught EvalError ... 'unsafe-eval' is not an allowed source` in dev, the CSP fix didn't take effect — kill the dev server fully (all node processes) and restart.
- **Click handlers fire.** Every clickable element (sidebar tabs, top-bar chips, Deposit/Withdraw/Borrow tabs, action buttons) should respond to click. The previous symptom (no buttons doing anything) was caused by React failing to hydrate due to the CSP issue.
- **Phantom on Chrome:** the canonical namespace is `window.phantom.solana`. If you're on a wallet other than Phantom that hijacks `window.solana` without setting `isPhantom`, the diagnostic message will print your `window.phantom`/`window.solana` flags so the failure mode is visible.

---

## Commit-by-commit

| Commit | Title | Files |
|---|---|---|
| `ea32695` | `feat(rails): tier protocol rails into Core + Full Privacy` | `frontend/src/lib/protocolAdapters.ts` |
| `8cc7f55` | `feat(ui): render tiered Core / Full Privacy status` | `frontend/src/app/page.tsx`, `frontend/src/app/globals.css` |
| `69e0932` | `feat(withdraw): enable Core Privacy direct stealth-address path` | `frontend/src/app/page.tsx` |
| `638ac49` | `feat(borrow,repay): replace BlockedFlow with evidence-backed screens` | `frontend/src/app/page.tsx` |
| `f5e63d9` | `fix(wallet): detect Phantom via window.phantom.solana canonical path` | `frontend/src/lib/solanaClient.ts`, `frontend/src/types/solana-wallet.d.ts`, `frontend/src/app/page.tsx` |
| `1de07de` | `fix(connect): show 'Connected: ...' message immediately after wallet.connect()` | `frontend/src/app/page.tsx` |
| `b77aa42` | `fix(connect): add DOM-listener fallback + diagnostic console logs` | `frontend/src/app/page.tsx` |
| `b8e57b0` | `fix(dev): allow unsafe-eval in dev CSP so Next.js Fast Refresh can hydrate` | `frontend/next.config.mjs` |

The CSP fix (`b8e57b0`) is the one that finally made the buttons work; everything before it was correct code but invisible to the user because React never hydrated.

---

## Claim-boundary impact

The disciplined claim boundary in `docs/SUBMISSION_CHECKLIST.md` and `docs/IMPLEMENTATION_STATUS.md` is **unchanged**. This PR does not promote any claim from "do not claim" to "allowed claim" — it only makes the *existing* "allowed claims" visible and operable in the UI.

| Submission angle | Before this PR | After this PR |
|---|---|---|
| Umbra Side Track | 7 tx signatures + adapter docs | Same evidence + working Withdraw screen that surfaces the route picker and stealth-address destination clearly |
| Encrypt + IKA Frontier | 2 CPI tx signatures + gRPC ciphertext | Same evidence + working Borrow screen with clickable Explorer links to the IKA approval transactions |
| Colosseum / MagicBlock | SDK + deposit/withdraw evidence | Same evidence + a Repay screen that names the exact upstream blocker and proves we know the unblock path |

The demo video can now show: user opens app → all buttons clickable → Core Privacy chip green → click through Borrow tab → see real on-chain evidence → click through Withdraw tab → see Core Privacy banner → click action button → land on Solana Explorer showing the real program. Every click resolves to verifiable devnet state.

---

## Known follow-ups (not in this PR)

1. **In-browser submit handler for Withdraw.** Today the action button opens Solana Explorer instead of constructing a `store_withdraw_proof` + `withdraw` transaction. The handler logic exists in `scripts/devnet-fullround.mjs` (Node.js); porting it to React requires bundling snarkjs proof generation and signing into the click handler. Estimated 4–6h. Lives on a separate branch when wired.
2. **In-browser submit handler for Borrow.** The IKA approval flow lives in `scripts/ika-anchor-approval-smoke.mjs` (1568 lines). Porting to React is heavier — estimated 8–12h. Defer to post-submission.
3. **`docs/MAC_DEV_HANDOFF.md`** — companion handoff doc covering open implementation items 1–6 (PER macros, real VRF, SOL→wSOL bridge, Encrypt verify keeper, Private Payments receipt verifier, IKA gRPC presign). Lives as an untracked file in this checkout pending team direction on where to land it.

---

## Reviewer checklist

- [ ] Pull the branch and verify the 8 commits listed above are present
- [ ] Run the 4 automated checks listed in "Automated checks" — all PASS
- [ ] Run through tests T1–T13 manually in Chrome
- [ ] Confirm `git diff main..feat/core-privacy-ui --stat` shows only the 5 files: `next.config.mjs`, `globals.css`, `page.tsx`, `protocolAdapters.ts`, `solanaClient.ts`, `solana-wallet.d.ts` (no program code, no Anchor config, no scripts)
- [ ] Approve and merge

After merge, this branch can be deleted. The follow-up work in `docs/MAC_DEV_HANDOFF.md` continues on separate branches.
