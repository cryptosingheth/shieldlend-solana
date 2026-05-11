/**
 * UI / session store — zustand with split persistence.
 *
 * Persistence strategy is deliberate per field to balance UX vs security:
 *
 *  | Field                  | Survives refresh? | Survives tab close? | Why                                                    |
 *  |------------------------|-------------------|---------------------|--------------------------------------------------------|
 *  | lastAddress            | YES (localStorage)| YES                 | Triggers Phantom silent auto-reconnect on mount        |
 *  | activeScreen           | YES (localStorage)| YES                 | UX preference only — non-sensitive                     |
 *  | withdrawDestinationMode| YES (localStorage)| YES                 | UX preference only — non-sensitive                     |
 *  | vaultKeyMaterialHex    | YES (sessionStor.)| NO                  | Sensitive: derives the AES vault key. Auto-locks       |
 *  |                        |                   |                     | on tab close so a stolen browser/session has limited   |
 *  |                        |                   |                     | window. Acceptable for devnet demo; production wants   |
 *  |                        |                   |                     | IndexedDB + non-extractable CryptoKey + idle-timeout.  |
 *
 * What is NOT in this store (and intentionally so):
 *  - the Phantom provider object (runtime, not serializable)
 *  - the derived AES CryptoKey (extractable: false; can't be persisted)
 *  - notes / history (already encrypted in localStorage by noteStorage/history modules)
 *  - wallet balance, busy flag, message, encryptStatus (transient UI state)
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

type StorageBackend = "local" | "session";

function namespacedStorage(backend: StorageBackend) {
  if (typeof window === "undefined") return undefined;
  return backend === "session" ? window.sessionStorage : window.localStorage;
}

// ─── Persisted-to-localStorage slice ─────────────────────────────────────────

export interface UiPrefsState {
  lastAddress: string | null;
  activeScreen: "positions" | "deposit" | "withdraw" | "borrow" | "repay" | "history";
  withdrawDestinationMode: "direct_stealth_address" | "wsol_umbra_adapter" | "umbra";
  setLastAddress: (addr: string | null) => void;
  setActiveScreen: (screen: UiPrefsState["activeScreen"]) => void;
  setWithdrawDestinationMode: (mode: UiPrefsState["withdrawDestinationMode"]) => void;
}

export const useUiPrefs = create<UiPrefsState>()(
  persist(
    (set) => ({
      lastAddress: null,
      activeScreen: "positions",
      withdrawDestinationMode: "direct_stealth_address",
      setLastAddress: (addr) => set({ lastAddress: addr }),
      setActiveScreen: (screen) => set({ activeScreen: screen }),
      setWithdrawDestinationMode: (mode) => set({ withdrawDestinationMode: mode }),
    }),
    {
      name: "shieldlend.ui",
      storage: createJSONStorage(() => namespacedStorage("local") ?? sessionStorageShim()),
    }
  )
);

// ─── Persisted-to-sessionStorage slice (vault key material) ──────────────────

export interface VaultSessionState {
  /** Hex-encoded raw signature bytes returned by wallet.signMessage().
   *  These deterministically re-derive the AES vault CryptoKey via HKDF,
   *  so caching them in sessionStorage lets us auto-unlock the vault on
   *  page refresh without a second Phantom popup. Cleared on tab close. */
  keyMaterialHex: string | null;
  /** Wallet address the key material was derived for. Used to detect
   *  wallet switches — if the address changes, the cached key is invalid. */
  keyAddress: string | null;
  setVaultMaterial: (hex: string, address: string) => void;
  clearVaultMaterial: () => void;
}

export const useVaultSession = create<VaultSessionState>()(
  persist(
    (set) => ({
      keyMaterialHex: null,
      keyAddress: null,
      setVaultMaterial: (hex, address) => set({ keyMaterialHex: hex, keyAddress: address }),
      clearVaultMaterial: () => set({ keyMaterialHex: null, keyAddress: null }),
    }),
    {
      name: "shieldlend.vault.session",
      storage: createJSONStorage(() => namespacedStorage("session") ?? sessionStorageShim()),
    }
  )
);

// SSR-safe shim — zustand's persist middleware initializes during render,
// which runs on the server during App Router prerendering. Return a no-op
// storage on the server so persist initialization doesn't throw.
function sessionStorageShim(): Storage {
  let map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear() { map = new Map(); },
    getItem(k) { return map.get(k) ?? null; },
    key(i) { return Array.from(map.keys())[i] ?? null; },
    removeItem(k) { map.delete(k); },
    setItem(k, v) { map.set(k, v); },
  };
}

// ─── Helpers used by page.tsx ────────────────────────────────────────────────

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}
