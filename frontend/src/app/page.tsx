"use client";

import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  CheckCircle,
  CircleAlert,
  Download,
  History,
  Home,
  KeyRound,
  LockKeyhole,
  Radio,
  RotateCcw,
  Shield,
  Upload,
  Wallet,
  XCircle,
} from "lucide-react";
import { useCallback, useMemo, useEffect, useRef, useState } from "react";
import { DENOMINATIONS, PROGRAM_IDS, lamportsToSol, shortHash } from "../lib/contracts";
import { appendHistory, hasPlaintextHistoryRecords, loadHistory, type HistoryRecord } from "../lib/history";
import {
  deriveNoteKey,
  exportNotes,
  hasPlaintextNotes,
  importNotes,
  loadNotes,
  saveNote,
  type StoredNote,
} from "../lib/noteStorage";
import { FULL_PRIVACY_RAILS, modeFromRails, coreRails, fullPrivacyOnlyRails, coreReady, type RailStatus } from "../lib/protocolAdapters";
import {
  getUmbraFundedFlowStatus,
  getUmbraStatus,
  getWsolUmbraPayoutPath,
  planUmbraDestinationRoute,
  type UmbraDestinationMode,
  type UmbraFundedFlowStatus,
  type UmbraStatus,
  type WsolUmbraPayoutPath,
} from "../lib/privacyRails/umbra";
import {
  getConnection,
  getPhantomProvider,
  submitDeposit,
  type SolanaWalletProvider,
} from "../lib/solanaClient";
import { useUiPrefs, useVaultSession, bytesToHex, hexToBytes } from "../lib/stores/uiStore";

type Screen = "positions" | "deposit" | "withdraw" | "borrow" | "repay" | "history";

type EncryptStatus = {
  configured: boolean;
  sdkPackage: string;
  sdkVersion: string;
  grpcApi: string;
  grpcUrl: string;
  programId: string;
  clientConstructed: boolean;
  sdkImportStatus: "blocked" | "not-checked";
  sdkImportNote: string;
  networkKeys: Array<{ account: string; discriminator: number; publicKeyHex: string; active: boolean }>;
  selectedNetworkKeyHex?: string;
  anchorIntegration?: {
    dependencyPattern: string;
    compileStatus: "compile-wired-local-fork" | "blocked";
    blocker: string;
    onChainFheLive: false;
  };
  claimBoundary: string;
};

const nav = [
  { key: "positions" as const, label: "Positions", icon: Home },
  { key: "deposit" as const, label: "Deposit", icon: ArrowDownToLine },
  { key: "withdraw" as const, label: "Withdraw", icon: ArrowUpFromLine },
  { key: "borrow" as const, label: "Borrow", icon: Banknote },
  { key: "repay" as const, label: "Repay", icon: RotateCcw },
  { key: "history" as const, label: "History", icon: History },
];

export default function HomePage() {
  // Persisted UI prefs (zustand → localStorage): screen tab + withdraw mode +
  // last connected address. Used to restore the session on refresh.
  const screen = useUiPrefs((s) => s.activeScreen);
  const setScreen = useUiPrefs((s) => s.setActiveScreen);
  const setLastAddress = useUiPrefs((s) => s.setLastAddress);
  const withdrawDestinationMode = useUiPrefs((s) => s.withdrawDestinationMode);
  const setWithdrawDestinationMode = useUiPrefs((s) => s.setWithdrawDestinationMode);

  // Vault session material (zustand → sessionStorage): cleared on tab close
  // so the AES vault key has bounded lifetime even though it auto-unlocks
  // on F5 refresh within the same tab.
  const vaultMaterialHex = useVaultSession((s) => s.keyMaterialHex);
  const vaultMaterialAddress = useVaultSession((s) => s.keyAddress);
  const setVaultMaterial = useVaultSession((s) => s.setVaultMaterial);
  const clearVaultMaterial = useVaultSession((s) => s.clearVaultMaterial);

  // Runtime-only state — not persisted (security or serialization reasons):
  // wallet provider is a runtime JS object; vaultKey is a non-extractable
  // CryptoKey; notes/history are already encrypted in localStorage.
  const [wallet, setWallet] = useState<SolanaWalletProvider | null>(null);
  const [address, setAddress] = useState("");
  const [balance, setBalance] = useState<bigint | null>(null);
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null);
  const [notes, setNotes] = useState<StoredNote[]>([]);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [hasPlaintext, setHasPlaintext] = useState(false);
  const [encryptStatus, setEncryptStatus] = useState<EncryptStatus | null>(null);

  const connected = Boolean(wallet?.publicKey && address);
  const vaultReady = Boolean(vaultKey);
  const protocolMode = useMemo(() => modeFromRails(FULL_PRIVACY_RAILS), []);
  const umbraStatus = useMemo(() => getUmbraStatus(), []);
  const umbraFundedFlowStatus = useMemo(() => getUmbraFundedFlowStatus(), []);
  const wsolUmbraPayoutPath = useMemo(() => getWsolUmbraPayoutPath(), []);

  const refreshAccount = useCallback(async (nextAddress = address, key = vaultKey) => {
    if (!nextAddress) return;
    const lamports = await getConnection().getBalance(await importPublicKey(nextAddress), "confirmed");
    setBalance(BigInt(lamports));
    setHistory(await loadHistory(nextAddress, key));
    setHasPlaintext(hasPlaintextNotes(nextAddress) || hasPlaintextHistoryRecords(nextAddress));
    if (key) setNotes(await loadNotes(nextAddress, key));
  }, [address, vaultKey]);

  useEffect(() => {
    console.log("[ShieldLend] Page mounted — React hydration OK");
    const provider = getPhantomProvider();
    if (!provider) return;
    setWallet(provider);
    // Silent auto-reconnect if Phantom previously authorized this site.
    // `onlyIfTrusted: true` skips the popup; rejects without prompting if not trusted.
    provider
      .connect({ onlyIfTrusted: true })
      .then(async (result) => {
        const addr = result.publicKey.toBase58();
        setAddress(addr);
        setLastAddress(addr);
        console.log("[ShieldLend] Auto-reconnected:", addr.slice(0, 6) + "…");
        // Auto-unlock from sessionStorage if material exists for this address
        if (vaultMaterialHex && vaultMaterialAddress === addr) {
          try {
            const material = hexToBytes(vaultMaterialHex);
            const key = await deriveNoteKey(material, addr);
            setVaultKey(key);
            setNotes(await loadNotes(addr, key));
            setHistory(await loadHistory(addr, key));
            setHasPlaintext(hasPlaintextNotes(addr) || hasPlaintextHistoryRecords(addr));
            console.log("[ShieldLend] Vault auto-unlocked from sessionStorage");
            setMessage(`Welcome back — vault restored from session.`);
          } catch (err) {
            console.warn("[ShieldLend] Vault auto-unlock failed:", err);
            clearVaultMaterial();
          }
        }
        refreshAccount(addr, null).catch((err) => console.error("refreshAccount failed:", err));
      })
      .catch(() => {
        // User hasn't authorized this site yet — that's fine, they can click Connect
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Belt-and-suspenders click handler: registers a vanilla addEventListener
  // on the Connect button so the wallet flow fires even if React's synthetic
  // event system has any issue. The React onClick is still primary; this is
  // a safety net.
  useEffect(() => {
    const btn = document.getElementById("connect-phantom-btn");
    if (!btn) return;
    const handler = () => {
      console.log("[ShieldLend] Connect button clicked (DOM listener)");
      void connectWallet();
    };
    btn.addEventListener("click", handler);
    return () => btn.removeEventListener("click", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-dismiss the notice message after 10 seconds so stale errors don't
  // linger forever. The close button (✕) lets the user dismiss earlier.
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 10_000);
    return () => clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/integrations/encrypt/status")
      .then((response) => (response.ok ? response.json() : null))
      .then((status: EncryptStatus | null) => {
        if (!cancelled) setEncryptStatus(status);
      })
      .catch(() => {
        if (!cancelled) setEncryptStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function connectWallet() {
    console.log("[ShieldLend] connectWallet() invoked");
    setMessage("");
    const provider = getPhantomProvider();
    console.log("[ShieldLend] provider:", provider ? "found" : "null",
      "window.phantom:", typeof window !== "undefined" && Boolean((window as Window).phantom),
      "window.solana:", typeof window !== "undefined" && Boolean((window as Window).solana));
    if (!provider) {
      const hasLegacy = typeof window !== "undefined" && Boolean((window as Window).solana);
      const hasPhantomNs = typeof window !== "undefined" && Boolean((window as Window).phantom);
      setMessage(
        `Phantom wallet was not detected. window.phantom=${hasPhantomNs} window.solana=${hasLegacy}. ` +
        "If you use Brave, set brave://settings/wallet → Default Solana wallet → \"Extensions (no fallback)\" and reload."
      );
      return;
    }
    try {
      const result = await provider.connect();
      setWallet(provider);
      const nextAddress = result.publicKey.toBase58();
      setAddress(nextAddress);
      setLastAddress(nextAddress);
      // Set the success message BEFORE refreshAccount so feedback is immediate.
      // refreshAccount makes a balance RPC that can take seconds; we don't want
      // the user staring at an empty notice while that resolves.
      setMessage(`Connected: ${nextAddress.slice(0, 6)}…${nextAddress.slice(-4)}`);
      refreshAccount(nextAddress, null).catch((err) => {
        console.error("refreshAccount failed:", err);
      });
    } catch (error) {
      setMessage(error instanceof Error ? `Phantom connect rejected: ${error.message}` : "Phantom connect failed.");
    }
  }

  function lockVault() {
    setVaultKey(null);
    setNotes([]);
    setHistory([]);
    clearVaultMaterial();
    setMessage("Vault locked. Session material cleared.");
  }

  async function initializeVault() {
    if (!wallet?.publicKey || !wallet.signMessage) {
      setMessage("Wallet must support signMessage to derive the local encrypted note vault key.");
      return;
    }
    const prompt = new TextEncoder().encode("ShieldLend Solana note vault key v1");
    const signed = await wallet.signMessage(prompt, "utf8");
    const addr = wallet.publicKey.toBase58();
    const key = await deriveNoteKey(signed.signature, addr);
    setVaultKey(key);
    // Cache the signature bytes in sessionStorage so we can re-derive the key
    // after a page refresh without re-prompting the user. The CryptoKey itself
    // is non-extractable; only the input material is stored, scoped to the
    // wallet address that signed it. Cleared on tab close (sessionStorage).
    setVaultMaterial(bytesToHex(signed.signature), addr);
    setNotes(await loadNotes(addr, key));
    setHistory(await loadHistory(addr, key));
    setHasPlaintext(hasPlaintextNotes(addr) || hasPlaintextHistoryRecords(addr));
    setMessage("Local encrypted note vault unlocked for this browser session.");
  }

  async function createLocalNote(amountLamports: bigint) {
    if (!connected || !vaultKey || !address) {
      setMessage("Connect wallet and unlock the note vault first.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const { createNote } = await import("../lib/circuits");
      const note = await createNote(amountLamports);
      const stored = await saveNote(address, note, vaultKey);
      setNotes((current) => [stored, ...current]);
      await appendHistory(
        address,
        { kind: "deposit", amountLamports: amountLamports.toString(), commitment: stored.commitment },
        vaultKey
      );
      setHistory(await loadHistory(address, vaultKey));
      setMessage("Local note created. Funds are not deposited until the ShieldedPool program is deployed and the deposit transaction succeeds.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create local note.");
    } finally {
      setBusy(false);
    }
  }

  async function deposit(amountLamports: bigint) {
    if (!wallet || !connected || !vaultKey || !address) {
      setMessage("Connect wallet and unlock the note vault first.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const { createNote } = await import("../lib/circuits");
      const note = await createNote(amountLamports);
      const { signature } = await submitDeposit({ wallet, amountLamports, commitment: note.commitment });
      const stored = await saveNote(address, note, vaultKey, signature);
      setNotes((current) => [stored, ...current]);
      await appendHistory(
        address,
        { kind: "deposit", amountLamports: amountLamports.toString(), commitment: stored.commitment, txSignature: signature },
        vaultKey
      );
      await refreshAccount(address, vaultKey);
      setMessage(`Deposit submitted: ${signature}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Deposit failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleExportNotes() {
    if (!vaultKey || !address) {
      setMessage("Unlock the note vault first to export notes.");
      return;
    }
    try {
      const json = await exportNotes(address, vaultKey);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `shieldlend-notes-backup-${address.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage("Notes exported. Store this file safely — it is encrypted with your wallet key.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Export failed.");
    }
  }

  const importFileRef = useRef<HTMLInputElement>(null);

  async function handleImportNotes(file: File) {
    if (!vaultKey || !address) {
      setMessage("Unlock the note vault first to import notes.");
      return;
    }
    try {
      const text = await file.text();
      const count = await importNotes(address, vaultKey, text);
      setNotes(await loadNotes(address, vaultKey));
      setMessage(`Imported ${count} note(s) from backup.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import failed.");
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Shield size={24} />
          <div>
            <strong>shieldedSOL</strong>
            <span>Devnet implementation workspace</span>
          </div>
        </div>
        <div className="topbar-actions">
          <span
            className={`chip ${protocolMode === "full" ? "full" : protocolMode === "core" ? "core" : "degraded"}`}
            title={
              protocolMode === "full"
                ? "All 10 rails healthy: Core Privacy + every Full Privacy roadmap rail is live."
                : protocolMode === "core"
                  ? "Core Privacy active: programs deployed + ZK artifacts + on-chain Groth16 + nullifier registry are all live on devnet. Full Privacy rails (IKA full sign, PER macros, VRF, Private Payments transfer, Encrypt on-chain verify) are roadmap."
                  : "Core Privacy rails are not all healthy. Check rail status panel."
            }
          >
            {protocolMode === "full" ? "Full Privacy" : protocolMode === "core" ? "Core Privacy" : "Degraded"}
          </span>
          <button
            className={`chip ${vaultReady ? "ok" : "danger"}`}
            onClick={vaultReady ? lockVault : initializeVault}
            disabled={!connected}
            title={vaultReady
              ? "Click to lock the vault now. Vault auto-locks on tab close."
              : "Sign a message to derive the AES-256-GCM note vault key (AES key is non-extractable)."}
          >
            <LockKeyhole size={14} />
            {vaultReady ? "VAULT UNLOCKED" : "UNLOCK VAULT"}
          </button>
          <button id="connect-phantom-btn" className="chip" onClick={connectWallet}>
            <Wallet size={14} />
            {connected ? shortHash(address) : "Connect Phantom"}
          </button>
        </div>
      </header>

      {/* Pre-alpha disclosure banner — reflects live mode */}
      <section className={`prealpha-banner ${protocolMode === "core" || protocolMode === "full" ? "core" : ""}`}>
        <AlertTriangle size={16} />
        <div>
          <strong>
            {protocolMode === "full"
              ? "PRE-ALPHA — FULL PRIVACY ACTIVE"
              : protocolMode === "core"
                ? "CORE PRIVACY ACTIVE — FULL PRIVACY RAILS ARE ROADMAP"
                : "PRE-ALPHA — CORE PRIVACY UNAVAILABLE"}
          </strong>
          <span>
            {protocolMode === "core" ? (
              <>
                Deposit and withdraw flows protect amount privacy via on-chain Groth16 BN254 ring proof
                verification (DEV/TEST trusted setup; 198,502 CU confirmed on devnet) and the Active/Locked/Spent
                nullifier registry. Pre-alpha external rails (IKA full sign, PER macros, MagicBlock VRF + Private
                Payments transfer, Encrypt on-chain decryption, Umbra native-SOL bridge) are documented roadmap.
                Do not use with real funds. See <code>docs/SUBMISSION_CHECKLIST.md</code> for the full claim boundary.
              </>
            ) : protocolMode === "full" ? (
              <>
                Every privacy rail is healthy. This still uses the DEV/TEST trusted setup — production privacy
                requires a separate Powers of Tau ceremony. Do not use with real funds.
              </>
            ) : (
              <>
                Core Privacy rails are not all healthy. Verify <code>NEXT_PUBLIC_PROGRAMS_DEPLOYED</code> and
                <code>NEXT_PUBLIC_ZK_ARTIFACTS_READY</code> are set in <code>frontend/.env.local</code> (see
                <code>frontend/.env.devnet.example</code>). Do not use with real funds.
              </>
            )}
          </span>
        </div>
      </section>

      {/* localStorage loss warning */}
      {(connected && !vaultReady) && (
        <section className="mode-banner">
          <CircleAlert size={18} />
          <div>
            <strong>Note vault locked.</strong>
            <span>
              Unlock the vault to load encrypted notes. If this browser&apos;s localStorage is cleared before
              you export a backup, your notes and the SOL they represent will be permanently unrecoverable.
              Export a backup after every deposit.
            </span>
          </div>
        </section>
      )}

      {hasPlaintext && (
        <section className="mode-banner">
          <CircleAlert size={18} />
          <div>
            <strong>Plaintext records detected.</strong>
            <span>
              Some notes or history records in this browser&apos;s localStorage are not encrypted.
              They were written before vault encryption was enabled. Fields including commitment hashes
              are XSS-readable. Unlock the vault and re-deposit or export/re-import to re-encrypt.
            </span>
          </div>
        </section>
      )}

      <aside className="sidebar">
        <span className="eyebrow">Operations</span>
        {nav.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.key} className={screen === item.key ? "active" : ""} onClick={() => setScreen(item.key)}>
              <Icon size={16} />
              {item.label}
            </button>
          );
        })}
        <div className="sidebar-card">
          <span>Wallet balance</span>
          <strong>{balance === null ? "--" : lamportsToSol(balance, 3)}</strong>
          <small>{connected ? "Solana devnet RPC" : "Connect Phantom"}</small>
        </div>
      </aside>

      <main className="main">
        {message && (
          <div className="notice" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
            <span style={{ flex: 1 }}>{message}</span>
            <button
              onClick={() => setMessage("")}
              title="Dismiss"
              aria-label="Dismiss message"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--fg-2)",
                cursor: "pointer",
                fontSize: "16px",
                lineHeight: 1,
                padding: "2px 6px",
                flexShrink: 0,
              }}
            >
              ✕
            </button>
          </div>
        )}

        {screen === "positions" && (
          <Positions
            notes={notes}
            connected={connected}
            vaultReady={vaultReady}
            encryptStatus={encryptStatus}
            umbraStatus={umbraStatus}
            umbraFundedFlowStatus={umbraFundedFlowStatus}
            setScreen={setScreen}
            onExport={handleExportNotes}
            onImportClick={() => importFileRef.current?.click()}
          />
        )}
        {screen === "deposit" && (
          <Deposit busy={busy} connected={connected} vaultReady={vaultReady} onDeposit={deposit} onCreateLocalNote={createLocalNote} />
        )}
        {screen === "withdraw" && (
          <Withdraw
            notes={notes}
            connected={connected}
            vaultReady={vaultReady}
            protocolMode={protocolMode}
            destinationMode={withdrawDestinationMode}
            setDestinationMode={setWithdrawDestinationMode}
            umbraStatus={umbraStatus}
            umbraFundedFlowStatus={umbraFundedFlowStatus}
            wsolUmbraPayoutPath={wsolUmbraPayoutPath}
          />
        )}
        {screen === "borrow" && <BorrowScreen notes={notes} />}
        {screen === "repay" && <RepayScreen notes={notes} />}
        {screen === "history" && <HistoryScreen records={history} vaultReady={vaultReady} />}

        {/* Hidden file input for note import */}
        <input
          ref={importFileRef}
          type="file"
          accept="application/json"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleImportNotes(file);
            e.target.value = "";
          }}
        />
      </main>
    </div>
  );
}

async function importPublicKey(address: string) {
  const { PublicKey } = await import("@solana/web3.js");
  return new PublicKey(address);
}

function Positions({
  notes,
  connected,
  vaultReady,
  encryptStatus,
  umbraStatus,
  umbraFundedFlowStatus,
  setScreen,
  onExport,
  onImportClick,
}: {
  notes: StoredNote[];
  connected: boolean;
  vaultReady: boolean;
  encryptStatus: EncryptStatus | null;
  umbraStatus: UmbraStatus;
  umbraFundedFlowStatus: UmbraFundedFlowStatus;
  setScreen: (screen: Screen) => void;
  onExport: () => void;
  onImportClick: () => void;
}) {
  return (
    <section className="stack">
      <Hero title="Positions" subtitle="Local encrypted note vault. No seeded demo positions." />

      {/* What works today / planned / blocked */}
      <WhatWorksTodayPanel />
      <EncryptStatusPanel status={encryptStatus} />

      <div className="grid two">
        <Panel
          title="Local notes"
          action={<button onClick={() => setScreen("deposit")}>Deposit</button>}
        >
          {!connected && <EmptyState text="Connect Phantom to load your wallet." />}
          {connected && !vaultReady && <EmptyState text="Unlock the note vault to load private notes." />}
          {connected && vaultReady && notes.length === 0 && <EmptyState text="No notes found in this browser vault." />}
          {notes.map((note) => <NoteRow key={note.commitment} note={note} />)}
          {vaultReady && (
            <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
              <button onClick={onExport} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 12px", fontSize: "13px" }}>
                <Download size={14} /> Export backup
              </button>
              <button onClick={onImportClick} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 12px", fontSize: "13px" }}>
                <Upload size={14} /> Import backup
              </button>
            </div>
          )}
          {vaultReady && (
            <p className="muted" style={{ marginTop: "8px", fontSize: "12px" }}>
              Export a backup after every deposit. localStorage loss means permanent note loss with no recovery path.
            </p>
          )}
        </Panel>

        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <Panel title="Program deployment status">
            <StatusLine label="NullifierRegistry" value={PROGRAM_IDS.nullifierRegistry} healthy={false} />
            <StatusLine label="ShieldedPool" value={PROGRAM_IDS.shieldedPool} healthy={false} />
            <StatusLine label="LendingPool" value={PROGRAM_IDS.lendingPool} healthy={false} />
            <p className="muted" style={{ marginTop: "8px", fontSize: "12px" }}>
              All program IDs are placeholders. No programs have been deployed. Transactions will fail
              at assertProgramDeployed before any signing occurs.
            </p>
          </Panel>

          <Panel title="Privacy rail status">
            <p className="muted" style={{ marginBottom: "12px", fontSize: "12px" }}>
              Core Privacy = the rails that ship a verifiable privacy property today. Full Privacy = Core
              plus the pre-alpha external rails currently in integration. Statuses reflect env config and
              upstream availability.
            </p>

            <div className="rail-section-header">
              <span className="dot live" />
              <span>Core Privacy — live on devnet</span>
            </div>
            {coreRails().map((rail) => (
              <RailStatusRow key={rail.key} rail={rail} />
            ))}

            <div className="rail-section-header">
              <span className="dot roadmap" />
              <span>Full Privacy roadmap — pre-alpha</span>
            </div>
            {fullPrivacyOnlyRails().map((rail) => (
              <RailStatusRow key={rail.key} rail={rail} />
            ))}
          </Panel>

          <Panel title="Umbra rail status">
            <RailStateLine status={umbraStatus} />
            <dl className="facts" style={{ marginTop: "12px", fontSize: "13px" }}>
              <dt>Network</dt>
              <dd>{umbraStatus.config.network}</dd>
              <dt>Program</dt>
              <dd><code>{shortHash(umbraStatus.config.programId)}</code></dd>
              <dt>Mint</dt>
              <dd>{umbraStatus.config.mintAddress ? <code>{shortHash(umbraStatus.config.mintAddress)}</code> : "Not set"}</dd>
            </dl>
            {umbraStatus.blockers.length > 0 && (
              <ul className="plain-list" style={{ marginTop: "12px", fontSize: "12px" }}>
                {umbraStatus.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
              </ul>
            )}
          </Panel>

          <Panel title="Umbra funded flow">
            <FundedFlowLine status={umbraFundedFlowStatus} />
            <dl className="facts" style={{ marginTop: "12px", fontSize: "13px" }}>
              <dt>Asset</dt>
              <dd>{umbraFundedFlowStatus.assetKind}</dd>
              <dt>Mint</dt>
              <dd>{umbraFundedFlowStatus.mintAddress ? <code>{shortHash(umbraFundedFlowStatus.mintAddress)}</code> : "Not confirmed"}</dd>
              <dt>Deposit tx</dt>
              <dd>{umbraFundedFlowStatus.depositSignature ? <code>{shortHash(umbraFundedFlowStatus.depositSignature)}</code> : "None"}</dd>
              <dt>Withdraw tx</dt>
              <dd>{umbraFundedFlowStatus.withdrawSignature ? <code>{shortHash(umbraFundedFlowStatus.withdrawSignature)}</code> : "None"}</dd>
            </dl>
          </Panel>
        </div>
      </div>
    </section>
  );
}

function EncryptStatusPanel({ status }: { status: EncryptStatus | null }) {
  const clientOk = Boolean(status?.clientConstructed);
  const keyCount = status?.networkKeys.length ?? 0;
  return (
    <Panel title="Encrypt pre-alpha rail">
      <div className="grid two" style={{ gap: "12px" }}>
        <div>
          <StatusLine label="gRPC client" value={status ? status.grpcApi : "loading"} healthy={clientOk} />
          <StatusLine label="Active network keys" value={status ? `${keyCount}` : "loading"} healthy={keyCount > 0} />
          <StatusLine label="SDK package" value={status ? `${status.sdkPackage}@${status.sdkVersion}` : "loading"} healthy={Boolean(status)} />
          <StatusLine
            label="Anchor CPI probe"
            value={status?.anchorIntegration?.compileStatus ?? "loading"}
            healthy={false}
          />
        </div>
        <div className="responsibility" style={{ margin: 0 }}>
          <Radio size={16} />
          <span>
            {status?.claimBoundary ??
              "Encrypt status probe has not returned yet. The rail must remain degraded until the adapter can prove the client surface and active pre-alpha key."}
          </span>
        </div>
      </div>
      {status && (
        <dl className="facts" style={{ marginTop: "16px" }}>
          <dt>Endpoint</dt>
          <dd>{status.grpcUrl}</dd>
          <dt>Program</dt>
          <dd>{shortHash(status.programId, 8, 6)}</dd>
          <dt>SDK import</dt>
          <dd>{status.sdkImportStatus === "blocked" ? "Blocked by package export" : "Not checked"}</dd>
          <dt>Selected key</dt>
          <dd>{status.selectedNetworkKeyHex ? shortHash(status.selectedNetworkKeyHex, 10, 8) : "--"}</dd>
          <dt>On-chain FHE</dt>
          <dd>{status.anchorIntegration?.onChainFheLive ? "Live" : "Not live"}</dd>
        </dl>
      )}
      {status?.anchorIntegration?.blocker && (
        <p className="muted" style={{ marginTop: "12px", fontSize: "12px" }}>
          {status.anchorIntegration.blocker}
        </p>
      )}
      {status?.sdkImportNote && (
        <p className="muted" style={{ marginTop: "12px", fontSize: "12px" }}>
          {status.sdkImportNote}
        </p>
      )}
    </Panel>
  );
}

function WhatWorksTodayPanel() {
  return (
    <Panel title="Privacy rail status — confirmed, partial, and not live">
      <div className="grid two" style={{ gap: "12px" }}>
        <div>
          <p style={{ margin: "0 0 6px", fontWeight: 600, fontSize: "13px", color: "var(--success)" }}>Confirmed on devnet</p>
          <ul className="plain-list" style={{ fontSize: "13px" }}>
            <li>All 3 Anchor programs deployed (NullifierRegistry, ShieldedPool, LendingPool)</li>
            <li>On-chain Groth16 BN254 withdraw verification — DEV/TEST trusted setup; 198,502 CU; full C2H round-trip passed</li>
            <li>DEV/TEST ZK artifacts (withdraw_ring, collateral_ring, repay_ring) — browser WASM + zkey + vkey generated</li>
            <li>NullifierRegistry CPIs — withdraw + borrow lock path confirmed end-to-end on devnet</li>
            <li>Umbra funded devnet wSOL encrypted-balance deposit/withdraw confirmed via SDK 4.0.0</li>
            <li>Encrypt pre-alpha gRPC CreateInput confirmed — live network key + ciphertext returned</li>
            <li>MagicBlock SDK installed; TEE RPC + Router RPC HTTP 200; PER sidecar instruction builders confirmed</li>
            <li>IKA approve_message CPI confirmed on devnet 2026-05-11 — two tx signatures + MessageApproval PDAs created on-chain</li>
            <li>Note vault encryption (AES-256-GCM + HKDF, wallet-derived key); history encryption</li>
            <li>In-UI deposit flow — real Phantom-signed devnet transaction with note vault persistence</li>
          </ul>
        </div>
        <div>
          <p style={{ margin: "0 0 6px", fontWeight: 600, fontSize: "13px", color: "var(--amber)" }}>Partial / fail-closed</p>
          <ul className="plain-list" style={{ fontSize: "13px" }}>
            <li>Umbra SDK adapter — fail-closed for native SOL exits; wSOL/SPL bridge needed for ShieldLend payout routing</li>
            <li>Encrypt gRPC — live client/probe path; LendingPool now compile-wires a separate Encrypt CPI request/reveal path through a local Anchor 0.32 fork, but official upstream encrypt-anchor is still blocked by the AccountInfo crate-family mismatch</li>
            <li>MagicBlock PER sidecar — TypeScript only; Rust macros blocked on Anchor 0.32.1; on-chain PER tx not submitted</li>
            <li>IKA gRPC PresignForDWallet — pre-alpha BCS schema mismatch upstream; approval CPI works, full sign flow blocked</li>
            <li>In-UI withdraw + borrow submit handlers — devnet flows live via scripts (devnet-fullround.mjs, ika-anchor-approval-smoke.mjs); React submit binding ships next sprint</li>
          </ul>
          <p style={{ margin: "12px 0 6px", fontWeight: 600, fontSize: "13px", color: "var(--danger)" }}>Not live — do not claim</p>
          <ul className="plain-list" style={{ fontSize: "13px", color: "var(--fg-2)" }}>
            <li>Production trusted setup — DEV/TEST ptau only; no production ceremony</li>
            <li>IKA relay signing end-to-end — approve_message CPI confirmed; gRPC sign blocked upstream</li>
            <li>MagicBlock Private Payments private-transfer end-to-end — upstream API/router limitation</li>
            <li>Encrypt on-chain FHE health computation — local CPI wiring compiles, but no live encrypted oracle or on-chain decryption path is proven</li>
            <li>Umbra ShieldLend payout routing — native SOL path remains direct stealth_address</li>
            <li>NullifierRegistry CPI on repay — scaffolded; gated on verify_private_payment_receipt (MagicBlock upstream)</li>
          </ul>
        </div>
      </div>
    </Panel>
  );
}

function Deposit({
  busy,
  connected,
  vaultReady,
  onDeposit,
  onCreateLocalNote,
}: {
  busy: boolean;
  connected: boolean;
  vaultReady: boolean;
  onDeposit: (amount: bigint) => Promise<void>;
  onCreateLocalNote: (amount: bigint) => Promise<void>;
}) {
  const disabled = busy || !connected || !vaultReady;
  return (
    <section className="stack">
      <Hero title="Deposit" subtitle="Two paths: a local-only crypto-vault test (no on-chain tx, no SOL locked) or a real Phantom-signed ShieldedPool deposit on devnet." />

      {/* Stuck-deposit warning — most important for demo safety */}
      <div className="notice" style={{ borderColor: "color-mix(in srgb, var(--amber) 55%, var(--line))", background: "color-mix(in srgb, var(--amber) 9%, var(--surface-1))" }}>
        <AlertTriangle size={16} style={{ color: "var(--amber)", flexShrink: 0 }} />
        <div>
          <strong style={{ display: "block", marginBottom: "4px" }}>
            ⚠ &ldquo;Submit deposit&rdquo; locks SOL into the shielded pool with no withdraw path today
          </strong>
          <span>
            Real deposits land in the on-chain <code>shielded_pool</code> PDA. The in-UI withdraw submit
            handler is roadmap (next sprint), and the protocol enforces a K=16 anonymity-set requirement
            on the Merkle tree before any individual withdraw proof can be generated. So today, any SOL
            you deposit via &ldquo;Submit deposit&rdquo; cannot be recovered from the UI — and the existing
            <code> scripts/devnet-fullround.mjs</code> uses hardcoded DEV/TEST smoke vectors, not your
            note&apos;s secret. <strong>For demo recording, use &ldquo;Create local note only&rdquo; (no on-chain tx,
            no SOL locked).</strong> Only click &ldquo;Submit deposit&rdquo; with devnet SOL you are willing to leave
            in the pool.
          </span>
        </div>
      </div>

      {/* Signer warning — always shown */}
      <div className="notice" style={{ borderColor: "color-mix(in srgb, var(--danger) 40%, var(--line))", background: "color-mix(in srgb, var(--danger) 10%, var(--surface-1))" }}>
        <AlertTriangle size={16} style={{ color: "var(--danger)", flexShrink: 0 }} />
        <div>
          <strong style={{ display: "block", marginBottom: "4px" }}>Signer mode: direct_wallet (reduced privacy)</strong>
          <span>
            IKA dWallet relay is not active. Your Phantom wallet public key is the on-chain signer for every
            deposit. IKA pre-alpha SDK is available but uses a single mock signer (not real MPC), and
            LendingPool only has compile-level approve_message CPI wiring until real IKA dWallet accounts
            are supplied and a devnet CPI transaction succeeds. The claim
            &ldquo;depositor wallet hidden&rdquo; is false in this mode. Do not deposit real funds expecting privacy.
          </span>
        </div>
      </div>

      <div className="grid two">
        <Panel title="Fixed denominations">
          <div className="cards">
            {DENOMINATIONS.map((denom) => (
              <div className="choice" key={denom.label}>
                <strong>{denom.label}</strong>
                <span>Commitment amount: {denom.lamports.toString()} lamports</span>
                {/* Safe path FIRST: no on-chain tx, no SOL locked. */}
                <button
                  disabled={busy || !connected || !vaultReady}
                  onClick={() => onCreateLocalNote(denom.lamports)}
                  title="Generates the commitment in-browser and stores an encrypted note locally. No Solana transaction. No SOL locked. Safe for demo recording."
                >
                  ✓ Create local note only (safe)
                </button>
                {/* Real on-chain deposit — locks SOL with no withdraw path today. */}
                <button
                  disabled={disabled}
                  onClick={() => onDeposit(denom.lamports)}
                  title="Submits a real Phantom-signed Solana devnet transaction to shielded_pool::deposit. Locks SOL in the pool PDA with no UI withdraw path today (see warning above). Only click with devnet SOL you can lose."
                >
                  ⚠ Submit deposit (locks SOL — no withdraw path today)
                </button>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="What is real now">
          <ul className="plain-list">
            <li>Wallet connection uses Phantom directly.</li>
            <li>Balance comes from Solana devnet RPC.</li>
            <li>Note secrets are generated in browser.</li>
            <li>Vault key derived from wallet signMessage (AES-256-GCM + HKDF).</li>
            <li>Deposit blocked if ShieldedPool is not deployed (assertProgramDeployed).</li>
            <li>Notes and history encrypted before localStorage write.</li>
          </ul>
          <p className="muted" style={{ marginTop: "12px", fontSize: "12px" }}>
            Export a note backup after any deposit. There is no on-chain recovery path for lost local notes.
          </p>
        </Panel>
      </div>
    </section>
  );
}

function Withdraw({
  notes,
  connected,
  vaultReady,
  protocolMode,
  destinationMode,
  setDestinationMode,
  umbraStatus,
  umbraFundedFlowStatus,
  wsolUmbraPayoutPath,
}: {
  notes: StoredNote[];
  connected: boolean;
  vaultReady: boolean;
  protocolMode: "full" | "core" | "degraded" | "emergency";
  destinationMode: UmbraDestinationMode;
  setDestinationMode: (mode: UmbraDestinationMode) => void;
  umbraStatus: UmbraStatus;
  umbraFundedFlowStatus: UmbraFundedFlowStatus;
  wsolUmbraPayoutPath: WsolUmbraPayoutPath;
}) {
  const route = planUmbraDestinationRoute({
    mode: destinationMode,
    assetKind: destinationMode === "wsol_umbra_adapter" ? "wsol" : "native-sol",
    config: umbraStatus.config,
  });
  // Core Privacy allows the direct_stealth_address path (native-SOL withdraw to a
  // fresh stealth address) because that exercises only the Core rails: on-chain
  // Groth16 ring proof + nullifier spend. Umbra SPL and wSOL adapter paths still
  // need the Umbra rail.
  const isCoreModeDirectPath = (protocolMode === "core" || protocolMode === "full") &&
    destinationMode === "direct_stealth_address";
  const canPrepare = connected && vaultReady && notes.length > 0 && (route.canRoute || isCoreModeDirectPath) &&
    destinationMode !== "wsol_umbra_adapter"; // adapter path uses the roundtrip script, not the UI submit path

  return (
    <section className="stack">
      <Hero
        title="Withdraw"
        subtitle="Three payout paths: native SOL direct, Umbra SPL direct, or wSOL Umbra settlement adapter (post-withdraw two-step)."
      />

      {isCoreModeDirectPath && (
        <div
          className="notice"
          style={{
            borderColor: "color-mix(in srgb, var(--success, #4ade80) 45%, var(--line))",
            background: "color-mix(in srgb, var(--success, #4ade80) 6%, var(--surface-1))",
          }}
        >
          <CheckCircle size={16} style={{ color: "var(--success, #4ade80)", flexShrink: 0 }} />
          <div>
            <strong style={{ display: "block", marginBottom: "4px" }}>Core Privacy active for direct stealth-address withdraw</strong>
            <span>
              The protocol-level privacy property — on-chain Groth16 BN254 ring proof + nullifier spend —
              is live on devnet (198,502 CU full round-trip confirmed). The withdraw destination is a fresh
              stealth address with zero on-chain link to your deposit. Pre-alpha rails (IKA full sign, PER
              macros, Encrypt on-chain verify) are documented roadmap and not required for this path.
            </span>
          </div>
        </div>
      )}

      <div className="notice" style={{ borderColor: "color-mix(in srgb, var(--amber) 45%, var(--line))" }}>
        <AlertTriangle size={16} style={{ color: "var(--amber)", flexShrink: 0 }} />
        <div>
          <strong style={{ display: "block", marginBottom: "4px" }}>Umbra does not make the existing native SOL C2H exit private by itself.</strong>
          <span>
            The official SDK shields SPL/Token-2022 balances, with wSOL as the SOL-compatible token route.
            The wSOL Umbra settlement adapter wraps SOL post-withdraw and routes through Umbra — it is a
            devnet demo adapter, not a native protocol-level exit.
          </span>
        </div>
      </div>

      <div className="grid two">
        <Panel title="Destination mode">
          <div className="segmented">
            <button
              className={destinationMode === "direct_stealth_address" ? "active" : ""}
              onClick={() => setDestinationMode("direct_stealth_address")}
            >
              Direct SOL
            </button>
            <button
              className={destinationMode === "wsol_umbra_adapter" ? "active" : ""}
              onClick={() => setDestinationMode("wsol_umbra_adapter")}
            >
              wSOL via Umbra
            </button>
            <button
              className={destinationMode === "umbra" ? "active" : ""}
              onClick={() => setDestinationMode("umbra")}
            >
              Umbra SPL
            </button>
          </div>

          <div className="route-card" style={{ marginTop: "14px" }}>
            <strong>{route.title}</strong>
            <span>{route.summary}</span>
            <small className={route.canRoute ? "green" : "amber"}>
              {route.canRoute ? "Route available" : route.nextStep}
            </small>
          </div>

          {route.blockers.length > 0 && (
            <ul className="plain-list" style={{ marginTop: "12px", fontSize: "13px" }}>
              {route.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
            </ul>
          )}

          {destinationMode === "wsol_umbra_adapter"
            ? (
              <div className="notice" style={{ marginTop: "14px", borderColor: "color-mix(in srgb, var(--success) 35%, var(--line))", background: "color-mix(in srgb, var(--success) 6%, var(--surface-1))" }}>
                <CheckCircle size={15} style={{ color: "var(--success)", flexShrink: 0 }} />
                <span style={{ fontSize: "12px" }}>
                  Run <code>node scripts/devnet-wsol-umbra-roundtrip.mjs</code> to execute the full adapter flow on devnet.
                  This path is outside the frontend submit button — it requires the roundtrip script and a funded devnet wallet.
                </span>
              </div>
            )
            : (
              <button
                disabled={true}
                title={isCoreModeDirectPath
                  ? "Disabled for two reasons: (1) the in-UI snarkjs proof-generation + Phantom-signed submit handler ships in the next sprint, and (2) the withdraw_ring circuit requires a K=16 anonymity-set on the Merkle tree — fresh notes can only be withdrawn once the on-chain ring contains 16 unique commitments (a property of the ZK protocol, not a UI gap). Devnet evidence: scripts/devnet-fullround.mjs runs the full round-trip with DEV/TEST smoke vectors and produces 198,502 CU on-chain Groth16 verification."
                  : "Submit path requires proof inputs, deployed programs, and the selected destination rail."}
                style={{ marginTop: "16px", padding: "10px 14px" }}
              >
                {isCoreModeDirectPath ? "Submit withdraw (UI binding — next sprint)" : "Prepare withdraw route"}
              </button>
            )
          }
          <p className="muted" style={{ marginTop: "10px", fontSize: "12px" }}>
            Available notes in local vault: {notes.length}.
            {isCoreModeDirectPath ? (
              <>
                {" "}Core Privacy direct path: deposit → on-chain flush_epoch → in-browser <code>snarkjs.fullProve</code>{" "}
                with K=16 ring → nullifier spend → fresh stealth-address payout. The protocol enforces a K=16
                anonymity-set — fresh notes become withdrawable only once the on-chain Merkle tree contains 16
                unique commitments. Devnet flow proven end-to-end via <code>scripts/devnet-fullround.mjs</code>{" "}
                (198,502 CU on-chain Groth16; uses DEV/TEST smoke vectors, not user notes). React submit binding ships next.
              </>
            ) : (
              <>
                {" "}The transaction submit path remains disabled until proof inputs, deployed programs, and the selected
                destination rail are all ready.
              </>
            )}
          </p>
        </Panel>

        {destinationMode === "wsol_umbra_adapter"
          ? <WsolUmbraAdapterPanel path={wsolUmbraPayoutPath} />
          : (
            <Panel title="Umbra status">
              <RailStateLine status={umbraStatus} />
              <dl className="facts" style={{ marginTop: "12px", fontSize: "13px" }}>
                <dt>SDK</dt>
                <dd>@umbra-privacy/sdk 4.0.0</dd>
                <dt>Network</dt>
                <dd>{umbraStatus.config.network}</dd>
                <dt>Program</dt>
                <dd><code>{umbraStatus.config.programId}</code></dd>
                <dt>Indexer</dt>
                <dd>{umbraStatus.config.indexerApiEndpoint ? "Configured" : "Missing"}</dd>
                <dt>Funded flow</dt>
                <dd>{umbraFundedFlowStatus.label}</dd>
                <dt>Funded mint</dt>
                <dd>{umbraFundedFlowStatus.mintAddress ? <code>{shortHash(umbraFundedFlowStatus.mintAddress)}</code> : "Not confirmed"}</dd>
              </dl>
              <p className="muted" style={{ marginTop: "12px", fontSize: "12px" }}>
                Supported route: public SPL/Token-2022 balance to Umbra encrypted balance or receiver-claimable UTXO,
                then Umbra withdrawal/claim. Native SOL requires wSOL or another supported token representation.
              </p>
              {umbraFundedFlowStatus.state !== "live" && (
                <p className="muted" style={{ marginTop: "8px", fontSize: "12px" }}>
                  Funded Umbra status: {umbraFundedFlowStatus.blocker}
                </p>
              )}
            </Panel>
          )
        }
      </div>
    </section>
  );
}

function WsolUmbraAdapterPanel({ path }: { path: WsolUmbraPayoutPath }) {
  return (
    <Panel title="wSOL Umbra settlement adapter">
      <p className="muted" style={{ marginBottom: "12px", fontSize: "12px" }}>
        Post-withdraw Umbra settlement adapter — two steps after the C2H proof verifies on-chain.
        Not a native protocol-level Umbra payout.
      </p>
      <dl className="facts" style={{ fontSize: "13px" }}>
        <dt>Step 1 — C2H</dt>
        <dd style={{ color: "var(--success)" }}>{path.step1}</dd>
        <dt>Step 2 — Wrap</dt>
        <dd>{path.step2}</dd>
        <dt>Step 3 — Umbra</dt>
        <dd>{path.step3}</dd>
      </dl>
      <div className="notice" style={{ marginTop: "14px", borderColor: "color-mix(in srgb, var(--success) 35%, var(--line))", background: "color-mix(in srgb, var(--success) 6%, var(--surface-1))" }}>
        <CheckCircle size={15} style={{ color: "var(--success)", flexShrink: 0 }} />
        <div style={{ fontSize: "12px" }}>
          <strong style={{ display: "block", marginBottom: "4px" }}>Confirmed on devnet</strong>
          <span>{path.claimBoundary}</span>
        </div>
      </div>
      <div className="notice" style={{ marginTop: "10px", borderColor: "color-mix(in srgb, var(--danger) 35%, var(--line))", background: "color-mix(in srgb, var(--danger) 6%, var(--surface-1))" }}>
        <XCircle size={15} style={{ color: "var(--danger)", flexShrink: 0 }} />
        <div style={{ fontSize: "12px" }}>
          <strong style={{ display: "block", marginBottom: "4px" }}>Not live — do not claim</strong>
          <span>{path.notLive}</span>
        </div>
      </div>
      <p className="muted" style={{ marginTop: "12px", fontSize: "12px" }}>
        Script: <code>{path.scriptPath}</code>
      </p>
    </Panel>
  );
}

function BorrowScreen({ notes }: { notes: StoredNote[] }) {
  const approveTx1 = "m5trvfdGc2AtqXh4chLoKdo5cXfCCL7mE3EB7tKHynGdDN5RV12SzpkQX2DgzAFiwzcLtYdQSgBJ1cPPbbj9WBF";
  const approveTx2 = "3AHThchU8EAjQ2aYsbrDy212JJvHPE3ajtLx2ZLKVBxJnfSHnRTTUeZxX2en2zz4UGmUuzMjU3sgbV5J9bkKZbk2";

  return (
    <section className="stack">
      <Hero
        title="Borrow"
        subtitle="Collateral-ring proof + IKA approve_message CPI — backend confirmed end-to-end on devnet 2026-05-11."
      />

      <div
        className="notice"
        style={{
          borderColor: "color-mix(in srgb, var(--success, #4ade80) 45%, var(--line))",
          background: "color-mix(in srgb, var(--success, #4ade80) 6%, var(--surface-1))",
        }}
      >
        <CheckCircle size={16} style={{ color: "var(--success, #4ade80)", flexShrink: 0 }} />
        <div>
          <strong style={{ display: "block", marginBottom: "4px" }}>Backend confirmed end-to-end on devnet</strong>
          <span>
            The full borrow path — <code>store_collateral_proof</code> → <code>lending_pool::borrow</code> →
            <code>nullifier_registry::lock</code> CPI → IKA <code>approve_ika_borrow_message</code> CPI →
            <code>MessageApproval</code> PDA — completed twice on Solana devnet earlier today via the
            <code>ika-anchor-approval-smoke.mjs</code> harness.
          </span>
        </div>
      </div>

      <div className="grid two">
        <Panel title="Confirmed devnet transactions">
          <dl className="facts" style={{ fontSize: "13px" }}>
            <dt>approve_ika_borrow_message tx 1</dt>
            <dd>
              <a
                href={`https://explorer.solana.com/tx/${approveTx1}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ wordBreak: "break-all", color: "var(--privacy)" }}
              >
                {approveTx1.slice(0, 12)}…{approveTx1.slice(-8)}
              </a>
            </dd>
            <dt>approve_ika_borrow_message tx 2</dt>
            <dd>
              <a
                href={`https://explorer.solana.com/tx/${approveTx2}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ wordBreak: "break-all", color: "var(--privacy)" }}
              >
                {approveTx2.slice(0, 12)}…{approveTx2.slice(-8)}
              </a>
            </dd>
            <dt>LendingPool program</dt>
            <dd>
              <code style={{ wordBreak: "break-all", fontSize: "12px" }}>
                J2yn42PLSiRvGEGj24Uj2q4QeGHZa1sbgzs5foLK81qn
              </code>
            </dd>
          </dl>
          <p className="muted" style={{ marginTop: "12px", fontSize: "12px" }}>
            All four entries above are real on-chain devnet artifacts. Tx signatures and program ID are verifiable
            by any client; clicking a tx hash above opens Solana Explorer for that transaction.
          </p>
        </Panel>

        <Panel title="What's wired vs roadmap">
          <ul className="plain-list" style={{ fontSize: "13px", lineHeight: 1.6 }}>
            <li>✅ <strong>store_collateral_proof</strong> — Groth16 collateral-ring verifier wired</li>
            <li>✅ <strong>lending_pool::borrow</strong> — confirmed on devnet via IKA smoke</li>
            <li>✅ <strong>nullifier_registry::lock</strong> — CPI invoked from borrow</li>
            <li>✅ <strong>approve_ika_borrow_message</strong> — IKA approve_message CPI confirmed</li>
            <li>🟡 IKA gRPC <strong>PresignForDWallet</strong> — pre-alpha BCS schema mismatch (upstream)</li>
            <li>🟡 In-browser submit handler — scripted via <code>ika-anchor-approval-smoke.mjs</code>; UI binding follows</li>
          </ul>
          <p className="muted" style={{ marginTop: "12px", fontSize: "12px" }}>
            Available notes in local vault: {notes.length}. To exercise the live borrow flow end-to-end today,
            run <code>node scripts/ika-anchor-approval-smoke.mjs</code> on a devnet-funded wallet.
          </p>
        </Panel>
      </div>
    </section>
  );
}

function RepayScreen({ notes }: { notes: StoredNote[] }) {
  return (
    <section className="stack">
      <Hero
        title="Repay"
        subtitle="Repayment settlement integration — partially live; private-transfer rail pending upstream."
      />

      <div
        className="notice"
        style={{
          borderColor: "color-mix(in srgb, var(--amber) 55%, var(--line))",
          background: "color-mix(in srgb, var(--amber) 7%, var(--surface-1))",
        }}
      >
        <AlertTriangle size={16} style={{ color: "var(--amber)", flexShrink: 0 }} />
        <div>
          <strong style={{ display: "block", marginBottom: "4px" }}>Pending MagicBlock Private Payments unblock</strong>
          <span>
            The repay path in <code>lending_pool::repay</code> calls <code>verify_private_payment_receipt</code> which
            currently fail-closes. The fail-close is intentional until MagicBlock&apos;s Private Payments private-transfer
            endpoint exposes a verifiable receipt format. Classification:
            <code>magicblock_api_router_tee_limitation</code>. Tracked in <code>docs/MAGICBLOCK_PRIVATE_PAYMENTS.md</code>.
          </span>
        </div>
      </div>

      <div className="grid two">
        <Panel title="What's already live for repay">
          <ul className="plain-list" style={{ fontSize: "13px", lineHeight: 1.6 }}>
            <li>✅ <strong>repay_ring</strong> ZK circuit compiled + verifier key</li>
            <li>✅ <strong>verify_repay_proof</strong> — Groth16 BN254 verifier wired in lending_pool</li>
            <li>✅ <strong>nullifier_registry::unlock</strong> — CPI invoked from repay</li>
            <li>✅ MagicBlock Private Payments <strong>deposit + withdraw</strong> confirmed on devnet</li>
            <li>🟡 Private Payments <strong>private-transfer</strong> — upstream router returns Blockhash not found</li>
            <li>🟡 <strong>verify_private_payment_receipt</strong> — fail-closed until receipt format published</li>
          </ul>
        </Panel>

        <Panel title="Unblock path">
          <p style={{ fontSize: "13px" }}>
            Once MagicBlock confirms the private-balance namespace credit and the canonical ephemeral-rollup
            submit RPC, the receipt verification in <code>programs/lending_pool/src/lib.rs:641</code> can be
            wired to the published verification key and the fail-close removed.
          </p>
          <p className="muted" style={{ marginTop: "12px", fontSize: "12px" }}>
            Available notes in local vault: {notes.length}. The script
            <code>scripts/magicblock-private-payments-live.mjs</code> exercises every reachable Private Payments
            API surface and records exact upstream failure modes.
          </p>
        </Panel>
      </div>
    </section>
  );
}

function HistoryScreen({ records, vaultReady }: { records: HistoryRecord[]; vaultReady: boolean }) {
  return (
    <section className="stack">
      <Hero title="History" subtitle="Local records only. Encrypted when vault is unlocked." />
      {!vaultReady && (
        <div className="notice">
          <LockKeyhole size={16} />
          <span>
            Unlock the note vault to load encrypted history records. Records created before vault
            unlock may be stored without sensitive fields (commitment, nullifierHash) to prevent plaintext secrets in localStorage.
          </span>
        </div>
      )}
      <Panel title="Local activity">
        {records.length === 0 && <EmptyState text="No local records yet." />}
        {records.map((record) => (
          <div className="history-row" key={record.id}>
            <History size={16} />
            <strong>{record.kind.toUpperCase()}</strong>
            <span>{record.amountLamports ? lamportsToSol(BigInt(record.amountLamports)) : "--"}</span>
            <small>{record.txSignature ? shortHash(record.txSignature) : "local only"}</small>
            <code>{record.commitment ? shortHash(record.commitment) : "--"}</code>
          </div>
        ))}
      </Panel>
    </section>
  );
}

function Hero({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="hero">
      <span className="eyebrow">ShieldLend Solana</span>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  );
}

function Panel({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty"><KeyRound size={16} /> {text}</div>;
}

function NoteRow({ note }: { note: StoredNote }) {
  return (
    <div className="note-row">
      <span className={`status ${note.status.toLowerCase()}`} />
      <strong>{lamportsToSol(BigInt(note.amountLamports))}</strong>
      <span>{note.status}</span>
      <small>{shortHash(note.commitment)} · {note.depositTx ? shortHash(note.depositTx) : "not deposited"}</small>
    </div>
  );
}

function StatusLine({ label, value, healthy }: { label: string; value: string; healthy: boolean }) {
  const Icon = healthy ? CheckCircle : XCircle;
  return (
    <div className="rail">
      <Icon size={16} className={healthy ? "green" : "amber"} />
      <div>
        <strong>{label}</strong>
        <span>{value}</span>
      </div>
    </div>
  );
}

function RailStateLine({ status }: { status: UmbraStatus }) {
  const Icon = status.state === "live" || status.state === "configured" ? CheckCircle : XCircle;
  const color = status.state === "live" ? "green" : status.state === "configured" ? "amber" : "danger";
  return (
    <div className="rail">
      <Icon size={16} className={color} />
      <div>
        <strong>Umbra {status.label}</strong>
        <span>{status.details}</span>
      </div>
    </div>
  );
}

function FundedFlowLine({ status }: { status: UmbraFundedFlowStatus }) {
  const Icon = status.state === "live" ? CheckCircle : XCircle;
  const color = status.state === "live" ? "green" : status.state === "blocked" ? "danger" : "amber";
  return (
    <div className="rail">
      <Icon size={16} className={color} />
      <div>
        <strong>{status.label}</strong>
        <span>{status.state === "live" ? "Funded Umbra token transaction signature recorded." : status.blocker}</span>
      </div>
    </div>
  );
}

function RailStatusRow({ rail }: { rail: RailStatus }) {
  const Icon = rail.healthy ? CheckCircle : XCircle;
  return (
    <div className="rail">
      <Icon size={16} className={rail.healthy ? "green" : rail.requiredForFullPrivacy ? "amber" : "muted"} />
      <div>
        <strong>{rail.name}</strong>
        <span>{rail.role}</span>
        {!rail.healthy && rail.requiredForFullPrivacy && (
          <small style={{ color: "var(--danger)", display: "block", marginTop: "2px" }}>
            Required for Full Privacy — unavailable
          </small>
        )}
      </div>
    </div>
  );
}
