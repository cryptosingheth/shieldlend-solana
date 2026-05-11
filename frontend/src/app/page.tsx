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
import { FULL_PRIVACY_RAILS, modeFromRails, type RailStatus } from "../lib/protocolAdapters";
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
  const [screen, setScreen] = useState<Screen>("positions");
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
  const [withdrawDestinationMode, setWithdrawDestinationMode] = useState<UmbraDestinationMode>("direct_stealth_address");

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
    const provider = getPhantomProvider();
    if (provider) setWallet(provider);
  }, []);

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
    setMessage("");
    const provider = getPhantomProvider();
    if (!provider) {
      setMessage("Phantom wallet was not found. Install Phantom, switch to Solana devnet, then reconnect.");
      return;
    }
    const result = await provider.connect();
    setWallet(provider);
    const nextAddress = result.publicKey.toBase58();
    setAddress(nextAddress);
    await refreshAccount(nextAddress, null);
  }

  async function initializeVault() {
    if (!wallet?.publicKey || !wallet.signMessage) {
      setMessage("Wallet must support signMessage to derive the local encrypted note vault key.");
      return;
    }
    const prompt = new TextEncoder().encode("ShieldLend Solana note vault key v1");
    const signed = await wallet.signMessage(prompt, "utf8");
    const key = await deriveNoteKey(signed.signature, wallet.publicKey.toBase58());
    setVaultKey(key);
    const addr = wallet.publicKey.toBase58();
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
          <span className={`chip ${protocolMode === "full" ? "full" : "degraded"}`}>
            {protocolMode === "full" ? "Full Privacy" : "Degraded"}
          </span>
          <button className={`chip ${vaultReady ? "ok" : "danger"}`} onClick={initializeVault} disabled={!connected}>
            <LockKeyhole size={14} />
            {vaultReady ? "VAULT UNLOCKED" : "UNLOCK VAULT"}
          </button>
          <button className="chip" onClick={connectWallet}>
            <Wallet size={14} />
            {connected ? shortHash(address) : "Connect Phantom"}
          </button>
        </div>
      </header>

      {/* Pre-alpha scaffold banner — always visible */}
      <section className="prealpha-banner">
        <AlertTriangle size={16} />
        <div>
          <strong>PRE-ALPHA / SCAFFOLD MODE</strong>
          <span>
            Programs not deployed. ZK artifacts stale. All 8 required privacy rails offline.
            No privacy properties hold. Do not use with real funds.
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
        {message && <div className="notice">{message}</div>}

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
            destinationMode={withdrawDestinationMode}
            setDestinationMode={setWithdrawDestinationMode}
            umbraStatus={umbraStatus}
            umbraFundedFlowStatus={umbraFundedFlowStatus}
            wsolUmbraPayoutPath={wsolUmbraPayoutPath}
          />
        )}
        {screen === "borrow" && (
          <BlockedFlow
            title="Borrow"
            notes={notes}
            reason="Borrow requires: deployed LendingPool, collateral_ring proof verification, NullifierRegistry CPI (lock), IKA FutureSign pre-authorization, and a real PER exit queue for disbursement."
          />
        )}
        {screen === "repay" && (
          <BlockedFlow
            title="Repay"
            notes={notes}
            reason="Repay requires: MagicBlock Private Payments receipts, repay_ring ZK artifacts and verification, NullifierRegistry CPI (unlock), and a deployed LoanAccount PDA for the selected loan."
          />
        )}
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
              Full Privacy mode cannot activate while any required rail is unavailable.
              Statuses reflect env config; use scripts/check-umbra.mjs for Umbra health probes.
            </p>
            {FULL_PRIVACY_RAILS.map((rail) => (
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
        </dl>
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
            <li>Umbra funded devnet wSOL encrypted-balance deposit/withdraw confirmed via SDK 4.0.0</li>
            <li>Encrypt pre-alpha gRPC CreateInput confirmed — live network key + ciphertext returned</li>
            <li>MagicBlock SDK installed; TEE RPC + Router RPC HTTP 200; PER sidecar instruction builders confirmed</li>
            <li>IKA SDK probe confirmed; IKA approve_message Anchor CPI compile-wired in LendingPool from official pre-alpha source</li>
            <li>Note vault encryption (AES-256-GCM + HKDF, wallet-derived key); history encryption</li>
          </ul>
        </div>
        <div>
          <p style={{ margin: "0 0 6px", fontWeight: 600, fontSize: "13px", color: "var(--amber)" }}>Partial / fail-closed</p>
          <ul className="plain-list" style={{ fontSize: "13px" }}>
            <li>Umbra SDK adapter — fail-closed for native SOL exits; wSOL/SPL bridge needed for ShieldLend payout routing</li>
            <li>Encrypt gRPC — client/probe only; program-side FHE fail-closed (Anchor 0.32 not upgraded)</li>
            <li>MagicBlock PER sidecar — TypeScript only; Rust macros blocked on Anchor 0.32.1; on-chain PER tx not submitted</li>
            <li>IKA adapter — SDK probe + compile-level CPI status; direct wallet fallback labelled reduced privacy</li>
            <li>Withdraw / Borrow / Repay UI — intentionally blocked until full rail dependencies are live</li>
          </ul>
          <p style={{ margin: "12px 0 6px", fontWeight: 600, fontSize: "13px", color: "var(--danger)" }}>Not live — do not claim</p>
          <ul className="plain-list" style={{ fontSize: "13px", color: "var(--fg-2)" }}>
            <li>Production trusted setup — DEV/TEST ptau only; no production ceremony</li>
            <li>IKA relay signing — mock signer (pre-alpha); no real devnet approve_message tx submitted</li>
            <li>MagicBlock Private Payments — URL not configured; TDX attestation challenge mismatch (SDK 0.8.8 delta)</li>
            <li>Encrypt on-chain FHE health computation — verifier fail-closed; no encrypted oracle</li>
            <li>Umbra ShieldLend payout routing — native SOL C2H path remains direct stealth_address</li>
            <li>NullifierRegistry CPIs in withdraw/borrow/repay — scaffolded, not executed end-to-end</li>
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
      <Hero title="Deposit" subtitle="Creates a real local note and attempts a real ShieldedPool transaction. Fails at assertProgramDeployed until programs are on-chain." />

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
                <button disabled={disabled} onClick={() => onDeposit(denom.lamports)}>
                  Submit deposit
                </button>
                <button disabled={busy || !connected || !vaultReady} onClick={() => onCreateLocalNote(denom.lamports)}>
                  Create local note only
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
  destinationMode,
  setDestinationMode,
  umbraStatus,
  umbraFundedFlowStatus,
  wsolUmbraPayoutPath,
}: {
  notes: StoredNote[];
  connected: boolean;
  vaultReady: boolean;
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
  const canPrepare = connected && vaultReady && notes.length > 0 && route.canRoute &&
    destinationMode !== "wsol_umbra_adapter"; // adapter path uses the roundtrip script, not the UI submit path

  return (
    <section className="stack">
      <Hero
        title="Withdraw"
        subtitle="Three payout paths: native SOL direct, Umbra SPL direct, or wSOL Umbra settlement adapter (post-withdraw two-step)."
      />

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
              <button disabled={!canPrepare} style={{ marginTop: "16px", padding: "10px 14px" }}>
                Prepare withdraw route
              </button>
            )
          }
          <p className="muted" style={{ marginTop: "10px", fontSize: "12px" }}>
            Available notes in local vault: {notes.length}. The transaction submit path remains disabled until proof inputs,
            deployed programs, and the selected destination rail are all ready.
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

function BlockedFlow({ title, notes, reason }: { title: string; notes: StoredNote[]; reason: string }) {
  return (
    <section className="stack">
      <Hero title={title} subtitle="Intentionally blocked until on-chain and proof dependencies are real." />
      <Panel title="Why this is not clickable yet">
        <p>{reason}</p>
        <p className="muted">Available notes in local vault: {notes.length}</p>
      </Panel>
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
