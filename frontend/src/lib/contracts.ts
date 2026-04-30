export const PROGRAM_IDS = {
  nullifierRegistry: "HsaVmvSd88h8w5LVtD9byiTu8N6zZrpu3KxuXH592GRL",
  shieldedPool: "EKMPkr2qFAQ8g7P4rNsaGPKVpx2T7eC5fDzYXwfWJge7",
  lendingPool: "2y2t22zkJ8ZyHpCDWM5j2u47vvstFRLpQjzhy42FR4UT",
} as const;

export const DENOMINATIONS = [
  { label: "0.1 SOL", lamports: 100_000_000n, depth: 64, flushMinutes: 6 },
  { label: "1 SOL", lamports: 1_000_000_000n, depth: 27, flushMinutes: 14 },
  { label: "10 SOL", lamports: 10_000_000_000n, depth: 3, flushMinutes: null },
] as const;

export const BORROW_BUCKETS = [
  { label: "0.05 SOL", lamports: 50_000_000n },
  { label: "0.1 SOL", lamports: 100_000_000n },
  { label: "0.5 SOL", lamports: 500_000_000n },
  { label: "1 SOL", lamports: 1_000_000_000n },
] as const;

export function fieldToBytes32(value: bigint): string {
  const hex = value.toString(16).padStart(64, "0");
  return `0x${hex}`;
}

export function lamportsToSol(lamports: bigint, decimals = 4): string {
  const whole = lamports / 1_000_000_000n;
  const fraction = lamports % 1_000_000_000n;
  const scaled = (fraction * 10n ** BigInt(decimals)) / 1_000_000_000n;
  return `${whole}.${scaled.toString().padStart(decimals, "0")} SOL`;
}

export function shortHash(value: string, head = 6, tail = 4): string {
  if (value.length <= head + tail) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}
