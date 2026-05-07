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
  getUmbraStatus,
  planUmbraDestinationRoute,
  type UmbraDestinationMode,
  type UmbraStatus,
} from "../lib/privacyRails/umbra";
import {
  getConnection,
  getPhantomProvider,
  submitDeposit,
  type SolanaWalletProvider,
} from "../lib/solanaClient";

type Screen = "positions" | "deposit" | "withdraw" | "borrow" | "repay" | "history";

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
  const [withdrawDestinationMode, setWithdrawDestinationMode] = useState<UmbraDestinationMode>("direct_stealth_address");

  const connected = Boolean(wallet?.publicKey && address);
  const vaultReady = Boolean(vaultKey);
  const protocolMode = useMemo(() => modeFromRails(FULL_PRIVACY_RAILS), []);
  const umbraStatus = useMemo(() => getUmbraStatus(), []);

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
            umbraStatus={umbraStatus}
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
  umbraStatus,
  setScreen,
  onExport,
  onImportClick,
}: {
  notes: StoredNote[];
  connected: boolean;
  vaultReady: boolean;
  umbraStatus: UmbraStatus;
  setScreen: (screen: Screen) => void;
  onExport: () => void;
  onImportClick: () => void;
}) {
  return (
    <section className="stack">
      <Hero title="Positions" subtitle="Local encrypted note vault. No seeded demo positions." />

      {/* What works today / planned / blocked */}
      <WhatWorksTodayPanel />

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
        </div>
      </div>
    </section>
  );
}

function WhatWorksTodayPanel() {
  return (
    <Panel title="Scaffold status — what works, what is planned, what is blocked">
      <div className="grid two" style={{ gap: "12px" }}>
        <div>
          <p style={{ margin: "0 0 6px", fontWeight: 600, fontSize: "13px", color: "var(--success)" }}>Working now</p>
          <ul className="plain-list" style={{ fontSize: "13px" }}>
            <li>Wallet connection (Phantom, Solana devnet)</li>
            <li>Devnet balance via RPC</li>
            <li>Note secret generation (browser WebCrypto)</li>
            <li>Note vault encryption (AES-256-GCM + HKDF, wallet-derived key)</li>
            <li>History log encryption (AES-256-GCM, same vault key)</li>
            <li>Note backup export / import</li>
            <li>Deposit blocked until programs deployed (assertProgramDeployed)</li>
            <li>Rust unit tests (8 categories, local only)</li>
          </ul>
        </div>
        <div>
          <p style={{ margin: "0 0 6px", fontWeight: 600, fontSize: "13px", color: "var(--amber)" }}>Scaffolded / fail-closed</p>
          <ul className="plain-list" style={{ fontSize: "13px" }}>
            <li>All 3 Anchor programs (cargo check passes, not deployed)</li>
            <li>ZK circuits written, not compiled to final artifacts</li>
            <li>Withdraw / Borrow / Repay UI (intentionally blocked)</li>
            <li>IKA + Encrypt API routes (return context JSON, no SDK calls)</li>
            <li>Protocol mode logic (always Degraded until rails go online)</li>
          </ul>
          <p style={{ margin: "12px 0 6px", fontWeight: 600, fontSize: "13px", color: "var(--danger)" }}>Unsafe to claim today</p>
          <ul className="plain-list" style={{ fontSize: "13px", color: "var(--fg-2)" }}>
            <li>Depositor wallet hidden — user wallet is on-chain signer today</li>
            <li>K=16 anonymity — ring decoys are integers 2–16, not real commitments</li>
            <li>Double-spend prevention — NullifierRegistry CPIs absent</li>
            <li>IKA FutureSign wired — API routes echo JSON, no SDK call</li>
            <li>MagicBlock PER batching — no PER macros in any program</li>
            <li>Encrypt FHE oracle — verifier returns error, no ciphertexts</li>
            <li>Umbra SDK — installed, but native SOL exits remain blocked unless routed through a supported SPL/Token-2022 rail</li>
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
          <strong style={{ display: "block", marginBottom: "4px" }}>Privacy warning: your wallet is the on-chain signer today.</strong>
          <span>
            IKA dWallet relay is not wired. Your Phantom wallet public key will be the permanent transaction
            signer for every deposit. The claim &ldquo;depositor wallet hidden&rdquo; is false until the IKA relay
            is deployed and wired in solanaClient.ts. Do not deposit with real funds expecting privacy.
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
}: {
  notes: StoredNote[];
  connected: boolean;
  vaultReady: boolean;
  destinationMode: UmbraDestinationMode;
  setDestinationMode: (mode: UmbraDestinationMode) => void;
  umbraStatus: UmbraStatus;
}) {
  const route = planUmbraDestinationRoute({
    mode: destinationMode,
    assetKind: "native-sol",
    config: umbraStatus.config,
  });
  const canPrepare = connected && vaultReady && notes.length > 0 && route.canRoute;

  return (
    <section className="stack">
      <Hero
        title="Withdraw"
        subtitle="C2H direct stealth_address withdraw remains available as the lower-privacy path. Umbra routing is fail-closed until the withdrawal asset is a supported SPL/Token-2022 mint."
      />

      <div className="notice" style={{ borderColor: "color-mix(in srgb, var(--amber) 45%, var(--line))" }}>
        <AlertTriangle size={16} style={{ color: "var(--amber)", flexShrink: 0 }} />
        <div>
          <strong style={{ display: "block", marginBottom: "4px" }}>Umbra does not make the existing native SOL C2H exit private by itself.</strong>
          <span>
            The official SDK shields SPL/Token-2022 balances, with wSOL as the SOL-compatible token route.
            ShieldLend still needs a wSOL/SPL exit leg before an Umbra transaction can be submitted.
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
              Direct
            </button>
            <button
              className={destinationMode === "umbra" ? "active" : ""}
              onClick={() => setDestinationMode("umbra")}
            >
              Umbra
            </button>
          </div>

          <div className="route-card">
            <strong>{route.title}</strong>
            <span>{route.summary}</span>
            <small className={route.canRoute ? "green" : "amber"}>{route.canRoute ? "Route can be prepared" : route.nextStep}</small>
          </div>

          {route.blockers.length > 0 && (
            <ul className="plain-list" style={{ marginTop: "12px", fontSize: "13px" }}>
              {route.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
            </ul>
          )}

          <button disabled={!canPrepare} style={{ marginTop: "16px", padding: "10px 14px" }}>
            Prepare withdraw route
          </button>
          <p className="muted" style={{ marginTop: "10px", fontSize: "12px" }}>
            Available notes in local vault: {notes.length}. The transaction submit path remains disabled until proof inputs,
            deployed programs, and the selected destination rail are all ready.
          </p>
        </Panel>

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
          </dl>
          <p className="muted" style={{ marginTop: "12px", fontSize: "12px" }}>
            Supported route: public SPL/Token-2022 balance to Umbra encrypted balance or receiver-claimable UTXO,
            then Umbra withdrawal/claim. Native SOL requires wSOL or another supported token representation.
          </p>
        </Panel>
      </div>
    </section>
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
