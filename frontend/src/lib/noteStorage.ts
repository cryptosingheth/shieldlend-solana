import { type Note } from "./circuits";
import { fieldToBytes32, lamportsToSol } from "./contracts";

export type NoteStatus = "Active" | "Locked" | "Spent";

export interface StoredNote {
  nullifierHash?: string;
  commitment: string;
  nullifier: string;
  secret: string;
  amountLamports: string;
  leafIndex?: string;
  depositTx?: string;
  depositedAt: number;
  status: NoteStatus;
  label?: string;
}

interface EncryptedNote {
  _enc: true;
  iv: string;
  ct: string;
}

type NoteRecord = StoredNote | EncryptedNote;

const STORAGE_KEY = (address: string) => `shieldlend_solana_notes_${address.toLowerCase()}`;

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function isEncrypted(record: NoteRecord): record is EncryptedNote {
  return (record as EncryptedNote)._enc === true;
}

export async function deriveNoteKey(keyMaterial: Uint8Array, address: string): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(keyMaterial),
    { name: "HKDF" },
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode(`shieldlend-solana-note-salt-${address.toLowerCase()}`),
      info: new TextEncoder().encode("shieldlend-solana-note-encryption-v1"),
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptNote(note: StoredNote, key: CryptoKey): Promise<EncryptedNote> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(note));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return { _enc: true, iv: bytesToHex(iv), ct: bytesToHex(new Uint8Array(ct)) };
}

async function decryptNote(record: EncryptedNote, key: CryptoKey): Promise<StoredNote> {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(hexToBytes(record.iv)) },
    key,
    toArrayBuffer(hexToBytes(record.ct))
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as StoredNote;
}

export function hasPlaintextNotes(address: string): boolean {
  if (typeof window === "undefined") return false;
  const raw = localStorage.getItem(STORAGE_KEY(address));
  if (!raw) return false;
  try {
    const records = JSON.parse(raw) as NoteRecord[];
    return records.some((r) => !isEncrypted(r));
  } catch {
    return false;
  }
}

export async function loadNotes(address: string, key: CryptoKey | null): Promise<StoredNote[]> {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(STORAGE_KEY(address));
  if (!raw) return [];

  const records = JSON.parse(raw) as NoteRecord[];
  const notes: StoredNote[] = [];
  for (const record of records) {
    if (!isEncrypted(record)) {
      // Plaintext note predates vault encryption. nullifier and secret are XSS-readable.
      console.warn("[ShieldLend] Plaintext note found in localStorage. Unlock vault and re-save to encrypt.");
      notes.push(record);
      continue;
    }
    if (!key) continue;
    try {
      notes.push(await decryptNote(record, key));
    } catch {
      // Wrong wallet-derived key or corrupted local record. Keep other notes loadable.
    }
  }
  return notes;
}

export async function saveNote(
  address: string,
  note: Note,
  key: CryptoKey,
  depositTx?: string
): Promise<StoredNote> {
  const stored: StoredNote = {
    nullifierHash: note.nullifierHash ? fieldToBytes32(note.nullifierHash) : undefined,
    commitment: fieldToBytes32(note.commitment),
    nullifier: note.nullifier.toString(16),
    secret: note.secret.toString(16),
    amountLamports: note.amountLamports.toString(),
    leafIndex: note.leafIndex?.toString(),
    depositTx,
    depositedAt: Date.now(),
    status: "Active",
  };

  const existing = await loadNotes(address, key);
  const deduped = existing.filter((item) => item.commitment !== stored.commitment);
  const encrypted = await Promise.all([stored, ...deduped].map((item) => encryptNote(item, key)));
  localStorage.setItem(STORAGE_KEY(address), JSON.stringify(encrypted));
  return stored;
}

export async function updateNoteStatus(
  address: string,
  commitment: string,
  status: NoteStatus,
  key: CryptoKey
): Promise<void> {
  const notes = await loadNotes(address, key);
  const updated = notes.map((note) => (note.commitment === commitment ? { ...note, status } : note));
  const encrypted = await Promise.all(updated.map((note) => encryptNote(note, key)));
  localStorage.setItem(STORAGE_KEY(address), JSON.stringify(encrypted));
}

export async function exportNotes(address: string, key: CryptoKey): Promise<string> {
  const notes = await loadNotes(address, key);
  if (notes.length === 0) throw new Error("No notes to export.");
  const encrypted = await Promise.all(notes.map((note) => encryptNote(note, key)));
  return JSON.stringify(
    {
      format: "shieldlend-solana-notes-backup-v1",
      address,
      exportedAt: new Date().toISOString(),
      count: notes.length,
      notes: encrypted,
    },
    null,
    2
  );
}

export async function importNotes(address: string, key: CryptoKey, backupJson: string): Promise<number> {
  let data: { format: string; notes: EncryptedNote[] };
  try {
    data = JSON.parse(backupJson) as { format: string; notes: EncryptedNote[] };
  } catch {
    throw new Error("Invalid backup file: could not parse JSON.");
  }
  if (data.format !== "shieldlend-solana-notes-backup-v1") {
    throw new Error(`Unrecognized backup format: ${data.format}`);
  }
  const imported: StoredNote[] = [];
  for (const enc of data.notes) {
    try {
      imported.push(await decryptNote(enc, key));
    } catch {
      // Skip records encrypted with a different key.
    }
  }
  if (imported.length === 0) {
    throw new Error("No notes could be decrypted. The backup file may belong to a different wallet.");
  }
  const existing = await loadNotes(address, key);
  const merged = [...imported];
  for (const note of existing) {
    if (!merged.some((m) => m.commitment === note.commitment)) merged.push(note);
  }
  const encrypted = await Promise.all(merged.map((n) => encryptNote(n, key)));
  localStorage.setItem(STORAGE_KEY(address), JSON.stringify(encrypted));
  return imported.length;
}

export function storedNoteToNote(stored: StoredNote): Note {
  return {
    nullifier: BigInt(`0x${stored.nullifier}`),
    secret: BigInt(`0x${stored.secret}`),
    amountLamports: BigInt(stored.amountLamports),
    commitment: BigInt(stored.commitment),
    nullifierHash: stored.nullifierHash ? BigInt(stored.nullifierHash) : undefined,
    leafIndex: stored.leafIndex ? BigInt(stored.leafIndex) : undefined,
  };
}

export function noteLabel(note: StoredNote): string {
  if (note.label) return note.label;
  const date = new Date(note.depositedAt).toLocaleDateString();
  return `${lamportsToSol(BigInt(note.amountLamports))} · ${note.status} · ${date}`;
}
