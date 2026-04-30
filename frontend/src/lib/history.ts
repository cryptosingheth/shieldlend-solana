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

const keyFor = (address: string) => `shieldlend_solana_history_${address.toLowerCase()}`;

export function loadHistory(address: string): HistoryRecord[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(keyFor(address));
  return raw ? (JSON.parse(raw) as HistoryRecord[]) : [];
}

export function appendHistory(address: string, record: Omit<HistoryRecord, "id" | "createdAt">): HistoryRecord {
  const next: HistoryRecord = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    ...record,
  };
  const records = [next, ...loadHistory(address)];
  localStorage.setItem(keyFor(address), JSON.stringify(records));
  return next;
}

export function buildDisclosurePacket(records: HistoryRecord[]) {
  return {
    format: "shieldlend-solana-disclosure-v1",
    exportedAt: new Date().toISOString(),
    records,
  };
}
