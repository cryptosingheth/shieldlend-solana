export type HistoryKind = "deposit" | "withdraw" | "borrow" | "repay" | "liquidation";

export interface HistoryRecord {
  id: string;
  kind: HistoryKind;
  amountLamports?: string;
  borrowBucketLamports?: string;
  commitment?: string;
  nullifierHash?: string;
  merkleRoot?: string;
  proofPublicSignalsHash?: string;
  settlementReceiptHash?: string;
  loanId?: string;
  txSignature?: string;
  createdAt: number;
}

interface EncryptedHistoryRecord {
  _enc: true;
  iv: string;
  ct: string;
}

type HistoryRaw = HistoryRecord | EncryptedHistoryRecord;

const keyFor = (address: string) => `shieldlend_solana_history_${address.toLowerCase()}`;

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

function isEncryptedRecord(record: HistoryRaw): record is EncryptedHistoryRecord {
  return (record as EncryptedHistoryRecord)._enc === true;
}

async function encryptHistoryRecord(record: HistoryRecord, key: CryptoKey): Promise<EncryptedHistoryRecord> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(record));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return { _enc: true, iv: bytesToHex(iv), ct: bytesToHex(new Uint8Array(ct)) };
}

async function decryptHistoryRecord(record: EncryptedHistoryRecord, key: CryptoKey): Promise<HistoryRecord | null> {
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toArrayBuffer(hexToBytes(record.iv)) },
      key,
      toArrayBuffer(hexToBytes(record.ct))
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as HistoryRecord;
  } catch {
    return null;
  }
}

export function hasPlaintextHistoryRecords(address: string): boolean {
  if (typeof window === "undefined") return false;
  const raw = localStorage.getItem(keyFor(address));
  if (!raw) return false;
  try {
    const records = JSON.parse(raw) as HistoryRaw[];
    return records.some((r) => !isEncryptedRecord(r));
  } catch {
    return false;
  }
}

export async function loadHistory(address: string, vaultKey?: CryptoKey | null): Promise<HistoryRecord[]> {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(keyFor(address));
  if (!raw) return [];

  const records = JSON.parse(raw) as HistoryRaw[];
  const result: HistoryRecord[] = [];

  for (const record of records) {
    if (isEncryptedRecord(record)) {
      if (vaultKey) {
        const decrypted = await decryptHistoryRecord(record, vaultKey);
        if (decrypted) result.push(decrypted);
      }
      // Encrypted records are skipped without a vault key — they cannot be decrypted.
    } else {
      // Plaintext record from before encryption was enabled. Load it but note it is unencrypted.
      result.push(record as HistoryRecord);
    }
  }

  return result;
}

export async function appendHistory(
  address: string,
  record: Omit<HistoryRecord, "id" | "createdAt">,
  vaultKey?: CryptoKey | null
): Promise<HistoryRecord> {
  const next: HistoryRecord = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    ...record,
  };

  const raw = localStorage.getItem(keyFor(address));
  const existing: HistoryRaw[] = raw ? (JSON.parse(raw) as HistoryRaw[]) : [];

  let stored: HistoryRaw;
  if (vaultKey) {
    stored = await encryptHistoryRecord(next, vaultKey);
  } else {
    // No vault key: strip sensitive fields (commitment, nullifierHash) to avoid
    // storing cryptographic secrets in plaintext localStorage.
    stored = {
      id: next.id,
      createdAt: next.createdAt,
      kind: next.kind,
      amountLamports: next.amountLamports,
      txSignature: next.txSignature,
      loanId: next.loanId,
    } as HistoryRecord;
  }

  localStorage.setItem(keyFor(address), JSON.stringify([stored, ...existing]));
  return next;
}

export function buildDisclosurePacket(records: HistoryRecord[]) {
  return {
    format: "shieldlend-solana-disclosure-v1",
    exportedAt: new Date().toISOString(),
    records,
  };
}
