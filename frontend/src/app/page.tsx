"use client";

import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  CircleAlert,
  History,
  Home,
  KeyRound,
  LockKeyhole,
  RotateCcw,
  Shield,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DENOMINATIONS, PROGRAM_IDS, lamportsToSol, shortHash } from "../lib/contracts";
import { appendHistory, loadHistory, type HistoryRecord } from "../lib/history";
import { deriveNoteKey, loadNotes, saveNote, type StoredNote } from "../lib/noteStorage";
import { FULL_PRIVACY_RAILS } from "../lib/protocolAdapters";
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

  const connected = Boolean(wallet?.publicKey && address);
  const vaultReady = Boolean(vaultKey);

  const refreshAccount = useCallback(async (nextAddress = address, key = vaultKey) => {
    if (!nextAddress) return;
    const lamports = await getConnection().getBalance(await importPublicKey(nextAddress), "confirmed");
    setBalance(BigInt(lamports));
    setHistory(loadHistory(nextAddress));
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
    setNotes(await loadNotes(wallet.publicKey.toBase58(), key));
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
      appendHistory(address, {
        kind: "deposit",
        amountLamports: amountLamports.toString(),
        commitment: stored.commitment,
      });
      setHistory(loadHistory(address));
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
      appendHistory(address, {
        kind: "deposit",
        amountLamports: amountLamports.toString(),
        commitment: stored.commitment,
        txSignature: signature,
      });
      await refreshAccount(address, vaultKey);
      setMessage(`Deposit submitted: ${signature}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Deposit failed.");
    } finally {
      setBusy(false);
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

      <section className="mode-banner">
        <CircleAlert size={18} />
        <div>
          <strong>No dummy success states.</strong>
          <span>Actions call real wallet/RPC paths where possible and block when programs or verifiers are not deployed.</span>
        </div>
      </section>

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
        {screen === "positions" && <Positions notes={notes} connected={connected} vaultReady={vaultReady} setScreen={setScreen} />}
        {screen === "deposit" && <Deposit busy={busy} connected={connected} vaultReady={vaultReady} onDeposit={deposit} onCreateLocalNote={createLocalNote} />}
        {screen === "withdraw" && <BlockedFlow title="Withdraw" notes={notes} reason="Withdrawal needs compiled WASM/zkey artifacts, a deployed ShieldedPool verifier path, and an Umbra stealth recipient adapter." />}
        {screen === "borrow" && <BlockedFlow title="Borrow" notes={notes} reason="Borrow needs deployed LendingPool, collateral proof verification, NullifierRegistry CPI, IKA pre-alpha FutureSign approval, and a real PER exit queue." />}
        {screen === "repay" && <BlockedFlow title="Repay" notes={notes} reason="Repay needs MagicBlock Private Payments receipts, repay_ring verification, and a deployed LendingPool account for the selected loan." />}
        {screen === "history" && <HistoryScreen records={history} />}
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
  setScreen,
}: {
  notes: StoredNote[];
  connected: boolean;
  vaultReady: boolean;
  setScreen: (screen: Screen) => void;
}) {
  return (
    <section className="stack">
      <Hero title="Positions" subtitle="This screen now shows only your local encrypted note vault. No seeded demo positions are displayed." />
      <div className="grid two">
        <Panel title="Local notes" action={<button onClick={() => setScreen("deposit")}>Deposit</button>}>
          {!connected && <EmptyState text="Connect Phantom to load your wallet." />}
          {connected && !vaultReady && <EmptyState text="Unlock the note vault to load private notes." />}
          {connected && vaultReady && notes.length === 0 && <EmptyState text="No notes found in this browser vault." />}
          {notes.map((note) => <NoteRow key={note.commitment} note={note} />)}
        </Panel>
        <Panel title="Deployment status">
          <StatusLine label="NullifierRegistry" value={PROGRAM_IDS.nullifierRegistry} />
          <StatusLine label="ShieldedPool" value={PROGRAM_IDS.shieldedPool} />
          <StatusLine label="LendingPool" value={PROGRAM_IDS.lendingPool} />
          <p className="muted">These IDs are configured in code, but the frontend checks RPC deployment before sending real protocol instructions.</p>
        </Panel>
        <Panel title="Privacy rail status">
          {FULL_PRIVACY_RAILS.map((rail) => (
            <StatusLine
              key={rail.key}
              label={rail.name}
              value={`${rail.healthy ? "configured" : "blocked"} - ${rail.role}`}
            />
          ))}
          <p className="muted">IKA and Encrypt are wired through their pre-alpha integration endpoints. Production privacy claims remain limited to the guarantees their current docs provide.</p>
        </Panel>
      </div>
    </section>
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
      <Hero title="Deposit" subtitle="This creates a real local note and attempts a real ShieldedPool transaction. If the program is not deployed, it fails before signing." />
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
            <li>Note vault encryption key is derived from wallet `signMessage`.</li>
            <li>Deposit transaction is blocked if ShieldedPool is not deployed.</li>
          </ul>
        </Panel>
      </div>
    </section>
  );
}

function BlockedFlow({ title, notes, reason }: { title: string; notes: StoredNote[]; reason: string }) {
  return (
    <section className="stack">
      <Hero title={title} subtitle="This flow is intentionally blocked until its on-chain and proof dependencies are real." />
      <Panel title="Why this is not clickable yet">
        <p>{reason}</p>
        <p className="muted">Available notes in local vault: {notes.length}</p>
      </Panel>
    </section>
  );
}

function HistoryScreen({ records }: { records: HistoryRecord[] }) {
  return (
    <section className="stack">
      <Hero title="History" subtitle="Only local records created in this browser are shown. There are no seeded transaction rows." />
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

function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rail">
      <CircleAlert size={16} className="amber" />
      <div>
        <strong>{label}</strong>
        <span>{value}</span>
      </div>
    </div>
  );
}
