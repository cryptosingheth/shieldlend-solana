/**
 * ShieldLend Solana circuit interface.
 *
 * Proofs are generated client-side. Secrets and nullifiers never leave the
 * browser vault. All nullifiers use the approved position-dependent formula:
 *
 *   nullifierHash = Poseidon(nullifier, leaf_index, SHIELDED_POOL_PROGRAM_ID)
 */

import { buildPoseidon } from "circomlibjs";

export const FIELD_SIZE = BigInt(
  "21888242871839275222246405745257275088548364400416034343698204186575808495617"
);

export const MERKLE_LEVELS = 24;
export const RING_SIZE = 16;

// Must match the constants in circuits/*.circom. Regenerate when the deployed
// shielded_pool program id is finalized.
export const SHIELDED_POOL_PROGRAM_ID_FIELD = 13n;

export const CIRCUIT_PATHS = {
  withdraw: {
    wasm: "/circuits/withdraw_ring.wasm",
    zkey: "/circuits/withdraw_ring.zkey",
  },
  collateral: {
    wasm: "/circuits/collateral_ring.wasm",
    zkey: "/circuits/collateral_ring.zkey",
  },
  repay: {
    wasm: "/circuits/repay_ring.wasm",
    zkey: "/circuits/repay_ring.zkey",
  },
} as const;

export interface Note {
  nullifier: bigint;
  secret: bigint;
  amountLamports: bigint;
  commitment: bigint;
  nullifierHash?: bigint;
  leafIndex?: bigint;
}

export interface MerklePath {
  pathElements: bigint[];
  pathIndices: number[];
  root: bigint;
  leafIndex: bigint;
}

export interface ZkProofResult {
  proof: object;
  publicSignals: string[];
}

export interface RepayPublicContext {
  loanId: bigint;
  outstandingBalance: bigint;
  settlementReceiptHash: bigint;
  repaymentVault: bigint;
}

export function randomFieldElement(): bigint {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value % FIELD_SIZE;
}

export async function poseidonHash(inputs: bigint[]): Promise<bigint> {
  const poseidon = await buildPoseidon();
  return poseidon.F.toObject(poseidon(inputs)) as bigint;
}

export async function computeCommitment(
  nullifier: bigint,
  secret: bigint,
  amountLamports: bigint
): Promise<bigint> {
  return poseidonHash([secret, nullifier, amountLamports]);
}

export async function computeNullifierHash(
  nullifier: bigint,
  leafIndex: bigint
): Promise<bigint> {
  return poseidonHash([nullifier, leafIndex, SHIELDED_POOL_PROGRAM_ID_FIELD]);
}

export async function computeReceiptBindingHash(
  ctx: RepayPublicContext,
  nullifierHash: bigint
): Promise<bigint> {
  return poseidonHash([
    ctx.loanId,
    nullifierHash,
    ctx.outstandingBalance,
    ctx.settlementReceiptHash,
    ctx.repaymentVault,
  ]);
}

export async function createNote(amountLamports: bigint): Promise<Note> {
  const nullifier = randomFieldElement();
  const secret = randomFieldElement();
  const commitment = await computeCommitment(nullifier, secret, amountLamports);
  return { nullifier, secret, amountLamports, commitment };
}

function validateMerklePath(path: MerklePath): void {
  if (path.pathElements.length !== MERKLE_LEVELS) {
    throw new Error(`pathElements must contain ${MERKLE_LEVELS} items`);
  }
  if (path.pathIndices.length !== MERKLE_LEVELS) {
    throw new Error(`pathIndices must contain ${MERKLE_LEVELS} items`);
  }
}

function buildRing(commitment: bigint): { ring: bigint[]; ringIndex: number } {
  const ring = [commitment];
  for (let i = 1; i < RING_SIZE; i++) ring.push(BigInt(i + 1));
  return { ring, ringIndex: 0 };
}

export async function generateWithdrawProof(
  note: Note,
  merklePath: MerklePath
): Promise<ZkProofResult> {
  validateMerklePath(merklePath);
  const snarkjs = await import("snarkjs");
  const { ring, ringIndex } = buildRing(note.commitment);
  const nullifierHash = await computeNullifierHash(note.nullifier, merklePath.leafIndex);

  const input = {
    secret: note.secret.toString(),
    nullifier: note.nullifier.toString(),
    denomination: note.amountLamports.toString(),
    leaf_index: merklePath.leafIndex.toString(),
    pathElements: merklePath.pathElements.map(String),
    pathIndices: merklePath.pathIndices.map(String),
    ring_index: ringIndex.toString(),
    ring: ring.map(String),
    nullifierHash: nullifierHash.toString(),
    root: merklePath.root.toString(),
  };

  return snarkjs.groth16.fullProve(
    input,
    CIRCUIT_PATHS.withdraw.wasm,
    CIRCUIT_PATHS.withdraw.zkey
  );
}

export async function generateCollateralProof(
  note: Note,
  merklePath: MerklePath,
  borrowedLamports: bigint,
  minRatioBps: bigint
): Promise<ZkProofResult> {
  validateMerklePath(merklePath);
  const snarkjs = await import("snarkjs");
  const { ring, ringIndex } = buildRing(note.commitment);
  const nullifierHash = await computeNullifierHash(note.nullifier, merklePath.leafIndex);

  const input = {
    secret: note.secret.toString(),
    nullifier: note.nullifier.toString(),
    denomination: note.amountLamports.toString(),
    leaf_index: merklePath.leafIndex.toString(),
    pathElements: merklePath.pathElements.map(String),
    pathIndices: merklePath.pathIndices.map(String),
    ring_index: ringIndex.toString(),
    ring: ring.map(String),
    nullifierHash: nullifierHash.toString(),
    root: merklePath.root.toString(),
    borrowed: borrowedLamports.toString(),
    minRatioBps: minRatioBps.toString(),
  };

  return snarkjs.groth16.fullProve(
    input,
    CIRCUIT_PATHS.collateral.wasm,
    CIRCUIT_PATHS.collateral.zkey
  );
}

export async function generateRepayProof(
  note: Note,
  leafIndex: bigint,
  context: RepayPublicContext
): Promise<ZkProofResult> {
  const snarkjs = await import("snarkjs");
  const nullifierHash = await computeNullifierHash(note.nullifier, leafIndex);
  const receiptBindingHash = await computeReceiptBindingHash(context, nullifierHash);

  const input = {
    nullifier: note.nullifier.toString(),
    leaf_index: leafIndex.toString(),
    nullifierHash: nullifierHash.toString(),
    loanId: context.loanId.toString(),
    outstandingBalance: context.outstandingBalance.toString(),
    settlementReceiptHash: context.settlementReceiptHash.toString(),
    repaymentVault: context.repaymentVault.toString(),
    receiptBindingHash: receiptBindingHash.toString(),
  };

  return snarkjs.groth16.fullProve(
    input,
    CIRCUIT_PATHS.repay.wasm,
    CIRCUIT_PATHS.repay.zkey
  );
}

export function serializeNote(note: Note): string {
  return JSON.stringify({
    nullifier: note.nullifier.toString(16),
    secret: note.secret.toString(16),
    amountLamports: note.amountLamports.toString(),
    commitment: note.commitment.toString(16),
    nullifierHash: note.nullifierHash?.toString(16),
    leafIndex: note.leafIndex?.toString(),
  });
}

export function deserializeNote(json: string): Note {
  const obj = JSON.parse(json);
  return {
    nullifier: BigInt(`0x${obj.nullifier}`),
    secret: BigInt(`0x${obj.secret}`),
    amountLamports: BigInt(obj.amountLamports),
    commitment: BigInt(`0x${obj.commitment}`),
    nullifierHash: obj.nullifierHash ? BigInt(`0x${obj.nullifierHash}`) : undefined,
    leafIndex: obj.leafIndex ? BigInt(obj.leafIndex) : undefined,
  };
}
