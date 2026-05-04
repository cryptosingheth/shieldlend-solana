/**
 * ShieldLend Solana circuit interface.
 *
 * Proofs are generated client-side. Secrets and nullifiers never leave the
 * browser vault. All nullifiers use the approved position-dependent formula:
 *
 *   nullifierHash = Poseidon(nullifier, leaf_index, SHIELDED_POOL_PROGRAM_ID)
 */

import { buildPoseidon } from "circomlibjs";
import artifactManifestJson from "../../../circuits/artifact_manifest.json";
import circuitConstantsJson from "../../../circuits/constants.json";

export const FIELD_SIZE = BigInt(
  "21888242871839275222246405745257275088548364400416034343698204186575808495617"
);

export const MERKLE_LEVELS = 24;
export const RING_SIZE = 16;

type CircuitName = "withdraw" | "collateral" | "repay";

interface ArtifactEntry {
  path: string;
  sha256: string | null;
}

interface CircuitArtifactEntry {
  wasm: ArtifactEntry;
  zkey: ArtifactEntry;
  vkey: ArtifactEntry;
}

interface CircuitConstantsFile {
  programs: {
    shielded_pool: {
      programId: string;
      fieldElement: string;
      source: string;
      status: string;
    };
  };
}

export const CIRCUIT_ARTIFACTS = artifactManifestJson as Record<
  CircuitName,
  CircuitArtifactEntry
>;

const circuitConstants = circuitConstantsJson as CircuitConstantsFile;

// Must match circuits/constants.circom, generated from circuits/constants.json.
// Regenerate when the deployed shielded_pool program id is finalized.
export const SHIELDED_POOL_PROGRAM_ID = circuitConstants.programs.shielded_pool.programId;
export const SHIELDED_POOL_PROGRAM_ID_FIELD = BigInt(
  circuitConstants.programs.shielded_pool.fieldElement
);

export const CIRCUIT_PATHS = {
  withdraw: {
    wasm: CIRCUIT_ARTIFACTS.withdraw.wasm.path,
    zkey: CIRCUIT_ARTIFACTS.withdraw.zkey.path,
    vkey: CIRCUIT_ARTIFACTS.withdraw.vkey.path,
  },
  collateral: {
    wasm: CIRCUIT_ARTIFACTS.collateral.wasm.path,
    zkey: CIRCUIT_ARTIFACTS.collateral.zkey.path,
    vkey: CIRCUIT_ARTIFACTS.collateral.vkey.path,
  },
  repay: {
    wasm: CIRCUIT_ARTIFACTS.repay.wasm.path,
    zkey: CIRCUIT_ARTIFACTS.repay.zkey.path,
    vkey: CIRCUIT_ARTIFACTS.repay.vkey.path,
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

export interface CommitmentRingRequest {
  commitment: bigint;
  root: bigint;
  leafIndex: bigint;
  ringSize: number;
}

export interface CommitmentRingProvider {
  getRing(request: CommitmentRingRequest): Promise<readonly bigint[]>;
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
  secret: bigint,
  nullifier: bigint,
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
  const commitment = await computeCommitment(secret, nullifier, amountLamports);
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

export class CommitmentRingUnavailableError extends Error {
  constructor() {
    super(
      "Real commitment ring data is required before proof generation. Wire a CommitmentRingProvider that fetches confirmed on-chain commitments for the requested Merkle root; synthetic decoy rings are not allowed."
    );
    this.name = "CommitmentRingUnavailableError";
  }
}

function assertUniqueRing(ring: readonly bigint[]): void {
  const seen = new Set<string>();
  for (const commitment of ring) {
    const key = commitment.toString();
    if (seen.has(key)) {
      throw new Error("ring commitments must be unique");
    }
    seen.add(key);
  }
}

export function buildRing(
  commitments: readonly bigint[],
  selectedCommitment: bigint
): { ring: bigint[]; ringIndex: number } {
  if (commitments.length !== RING_SIZE) {
    throw new Error(`ring must contain exactly ${RING_SIZE} real commitments`);
  }
  assertUniqueRing(commitments);

  const ringIndex = commitments.findIndex((commitment) => commitment === selectedCommitment);
  if (ringIndex === -1) {
    throw new Error("selected commitment is missing from the provided ring");
  }

  return { ring: [...commitments], ringIndex };
}

async function loadRing(
  note: Note,
  merklePath: MerklePath,
  ringProvider?: CommitmentRingProvider
): Promise<{ ring: bigint[]; ringIndex: number }> {
  if (!ringProvider) {
    throw new CommitmentRingUnavailableError();
  }

  const commitments = await ringProvider.getRing({
    commitment: note.commitment,
    root: merklePath.root,
    leafIndex: merklePath.leafIndex,
    ringSize: RING_SIZE,
  });

  return buildRing(commitments, note.commitment);
}

export async function generateWithdrawProof(
  note: Note,
  merklePath: MerklePath,
  ringProvider?: CommitmentRingProvider
): Promise<ZkProofResult> {
  validateMerklePath(merklePath);
  const snarkjs = await import("snarkjs");
  const { ring, ringIndex } = await loadRing(note, merklePath, ringProvider);
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
  minRatioBps: bigint,
  ringProvider?: CommitmentRingProvider
): Promise<ZkProofResult> {
  validateMerklePath(merklePath);
  const snarkjs = await import("snarkjs");
  const { ring, ringIndex } = await loadRing(note, merklePath, ringProvider);
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
