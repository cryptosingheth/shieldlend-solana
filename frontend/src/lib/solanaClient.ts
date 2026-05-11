import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { Buffer } from "buffer";
import { PROGRAM_IDS } from "./contracts";

export const DEVNET_RPC = "https://api.devnet.solana.com";
export const MAGICBLOCK_ROUTER_DEVNET_RPC = "https://devnet-router.magicblock.app";

// BN254 Groth16 on nPublic=19/20 requires ~220k–260k CU. 1.4M provides headroom.
// Must be prepended to any transaction that calls withdraw, borrow, or repay.
export const PROOF_INSTRUCTION_COMPUTE_UNITS = 1_400_000;

export function buildComputeBudgetInstruction(): TransactionInstruction {
  return ComputeBudgetProgram.setComputeUnitLimit({
    units: PROOF_INSTRUCTION_COMPUTE_UNITS,
  });
}

// BN254 base field prime — used to negate pi_a.y for the Solana pairing check.
const BN254_PRIME = BigInt(
  "21888242871839275222246405745257275088696311157297823662689037894645226208583"
);

function bigintToBeBytes32(n: bigint): Uint8Array {
  const bytes = new Uint8Array(32);
  let v = n;
  for (let i = 31; i >= 0; i--) {
    bytes[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return bytes;
}

export interface SerializedProof {
  /** 64 bytes — negated pi_a (x || (prime - y)). */
  proof_a: Uint8Array;
  /** 128 bytes — pi_b (x_c0 || x_c1 || y_c0 || y_c1). */
  proof_b: Uint8Array;
  /** 64 bytes — pi_c (x || y). */
  proof_c: Uint8Array;
  /** n × 32-byte BE field elements matching public_signals order. */
  public_inputs: Uint8Array[];
}

/**
 * Converts a snarkjs groth16.fullProve() result into the byte encoding
 * required by groth16-solana 0.0.3 and the Solana alt_bn128 syscalls.
 *
 * Encoding rules:
 *   G1 affine   — x_BE (32) || y_BE (32)
 *   G2 affine   — x_c0 (32) || x_c1 (32) || y_c0 (32) || y_c1 (32)
 *   pi_a        — y is negated: y → (BN254_PRIME − y) % BN254_PRIME
 *   snarkjs G2  — stores [[c1,c0],[c1,c0]]; Solana expects [c0,c1,c0,c1]
 */
export function serializeProofBytes(result: {
  proof: Record<string, unknown>;
  publicSignals: string[];
}): SerializedProof {
  const proof = result.proof as {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
  };

  const piAx = BigInt(proof.pi_a[0]);
  const negPiAy = (BN254_PRIME - BigInt(proof.pi_a[1])) % BN254_PRIME;
  const proof_a = new Uint8Array(64);
  proof_a.set(bigintToBeBytes32(piAx), 0);
  proof_a.set(bigintToBeBytes32(negPiAy), 32);

  // snarkjs: [[x_c1, x_c0], [y_c1, y_c0], [z_c1, z_c0]] (affine: z=1, dropped)
  // Solana:  x_c0 || x_c1 || y_c0 || y_c1
  const proof_b = new Uint8Array(128);
  proof_b.set(bigintToBeBytes32(BigInt(proof.pi_b[0][1])), 0);   // x_c0
  proof_b.set(bigintToBeBytes32(BigInt(proof.pi_b[0][0])), 32);  // x_c1
  proof_b.set(bigintToBeBytes32(BigInt(proof.pi_b[1][1])), 64);  // y_c0
  proof_b.set(bigintToBeBytes32(BigInt(proof.pi_b[1][0])), 96);  // y_c1

  const proof_c = new Uint8Array(64);
  proof_c.set(bigintToBeBytes32(BigInt(proof.pi_c[0])), 0);
  proof_c.set(bigintToBeBytes32(BigInt(proof.pi_c[1])), 32);

  const public_inputs = result.publicSignals.map((s) => bigintToBeBytes32(BigInt(s)));

  return { proof_a, proof_b, proof_c, public_inputs };
}

// ── Proof account pattern (B6 MTU fix) ──────────────────────────────────────
// WithdrawArgs inline was ~976 bytes → tx ~1388 bytes, exceeding the 1232-byte
// Solana MTU. Fix: write proof bytes to a PDA first, then reference by address.
//
// Two-transaction flow:
//   Tx 1: store_*_proof  — creates proof PDA, writes proof_a/b/c + public_inputs
//   Tx 2: withdraw/borrow/repay — reads from PDA, marks consumed; args now ~124–144 bytes
//
// ProofData PDA on shielded_pool:
//   8 disc + 32 authority + 1 kind + 64+128+64 proof + 19×32 inputs + 2 flags = 908 bytes
export const WITHDRAW_PROOF_DATA_SPACE = 908;
// ProofData PDA on lending_pool:
//   8 disc + 32 authority + 1 kind + 64+128+64 proof + 1 count + 20×32 inputs + 2 flags = 940 bytes
export const LENDING_PROOF_DATA_SPACE = 940;

const PROOF_DATA_SEED = "proof-data";

/** Returns a fresh random 32-byte nonce for proof PDA seed derivation. */
export function generateProofNonce(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

export function getWithdrawProofDataPda(authority: PublicKey, proofNonce: Uint8Array): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PROOF_DATA_SEED), authority.toBytes(), proofNonce],
    new PublicKey(PROGRAM_IDS.shieldedPool)
  )[0];
}

export function getLendingProofDataPda(authority: PublicKey, proofNonce: Uint8Array): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PROOF_DATA_SEED), authority.toBytes(), proofNonce],
    new PublicKey(PROGRAM_IDS.lendingPool)
  )[0];
}

/**
 * Builds the store_withdraw_proof instruction for shielded_pool.
 * Send this in Tx 1 before the withdraw instruction (Tx 2).
 * Use generateProofNonce() once; pass the same nonce to both transactions.
 */
export async function buildStoreWithdrawProofInstruction(params: {
  authority: PublicKey;
  proofNonce: Uint8Array;
  proof: SerializedProof;
  publicInputs: Uint8Array[]; // exactly 19 elements
}): Promise<TransactionInstruction> {
  if (params.publicInputs.length !== 19) {
    throw new Error(
      `store_withdraw_proof expects 19 public inputs, got ${params.publicInputs.length}`
    );
  }
  const proofDataPda = getWithdrawProofDataPda(params.authority, params.proofNonce);
  // disc(8) + proof_nonce(32) + proof_a(64) + proof_b(128) + proof_c(64) + inputs(19×32) = 904
  const data = new Uint8Array(8 + 32 + 64 + 128 + 64 + 19 * 32);
  let offset = 0;
  data.set(await anchorDiscriminator("store_withdraw_proof"), offset); offset += 8;
  data.set(params.proofNonce, offset); offset += 32;
  data.set(params.proof.proof_a, offset); offset += 64;
  data.set(params.proof.proof_b, offset); offset += 128;
  data.set(params.proof.proof_c, offset); offset += 64;
  for (const input of params.publicInputs) { data.set(input, offset); offset += 32; }
  return new TransactionInstruction({
    programId: new PublicKey(PROGRAM_IDS.shieldedPool),
    keys: [
      { pubkey: params.authority, isSigner: true, isWritable: true },
      { pubkey: proofDataPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

/**
 * Builds the store_collateral_proof instruction for lending_pool.
 * Send this in Tx 1 before the borrow instruction (Tx 2).
 * Use generateProofNonce() once; pass the same nonce as BorrowArgs.proof_nonce.
 */
export async function buildStoreCollateralProofInstruction(params: {
  authority: PublicKey;
  proofNonce: Uint8Array;
  proof: SerializedProof;
  publicInputs: Uint8Array[]; // exactly 20 elements
}): Promise<TransactionInstruction> {
  if (params.publicInputs.length !== 20) {
    throw new Error(
      `store_collateral_proof expects 20 public inputs, got ${params.publicInputs.length}`
    );
  }
  const proofDataPda = getLendingProofDataPda(params.authority, params.proofNonce);
  // disc(8) + proof_nonce(32) + proof_a(64) + proof_b(128) + proof_c(64) + inputs(20×32) = 936
  const data = new Uint8Array(8 + 32 + 64 + 128 + 64 + 20 * 32);
  let offset = 0;
  data.set(await anchorDiscriminator("store_collateral_proof"), offset); offset += 8;
  data.set(params.proofNonce, offset); offset += 32;
  data.set(params.proof.proof_a, offset); offset += 64;
  data.set(params.proof.proof_b, offset); offset += 128;
  data.set(params.proof.proof_c, offset); offset += 64;
  for (const input of params.publicInputs) { data.set(input, offset); offset += 32; }
  return new TransactionInstruction({
    programId: new PublicKey(PROGRAM_IDS.lendingPool),
    keys: [
      { pubkey: params.authority, isSigner: true, isWritable: true },
      { pubkey: proofDataPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

/**
 * Builds the store_repay_proof instruction for lending_pool.
 * Send this in Tx 1 before the repay instruction (Tx 2).
 * Use generateProofNonce() once; pass the same nonce as RepayArgs.proof_nonce.
 */
export async function buildStoreRepayProofInstruction(params: {
  authority: PublicKey;
  proofNonce: Uint8Array;
  proof: SerializedProof;
  publicInputs: Uint8Array[]; // exactly 6 elements
}): Promise<TransactionInstruction> {
  if (params.publicInputs.length !== 6) {
    throw new Error(
      `store_repay_proof expects 6 public inputs, got ${params.publicInputs.length}`
    );
  }
  const proofDataPda = getLendingProofDataPda(params.authority, params.proofNonce);
  // disc(8) + proof_nonce(32) + proof_a(64) + proof_b(128) + proof_c(64) + inputs(6×32) = 488
  const data = new Uint8Array(8 + 32 + 64 + 128 + 64 + 6 * 32);
  let offset = 0;
  data.set(await anchorDiscriminator("store_repay_proof"), offset); offset += 8;
  data.set(params.proofNonce, offset); offset += 32;
  data.set(params.proof.proof_a, offset); offset += 64;
  data.set(params.proof.proof_b, offset); offset += 128;
  data.set(params.proof.proof_c, offset); offset += 64;
  for (const input of params.publicInputs) { data.set(input, offset); offset += 32; }
  return new TransactionInstruction({
    programId: new PublicKey(PROGRAM_IDS.lendingPool),
    keys: [
      { pubkey: params.authority, isSigner: true, isWritable: true },
      { pubkey: proofDataPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

export interface SolanaWalletProvider {
  isPhantom?: boolean;
  publicKey?: PublicKey;
  // onlyIfTrusted: true → Phantom silently auto-connects without popup if the
  // site was previously authorized; rejects without popup otherwise. Used to
  // restore the session on page refresh.
  connect(options?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: PublicKey }>;
  disconnect(): Promise<void>;
  signMessage?(message: Uint8Array, encoding?: "utf8" | "hex"): Promise<{ signature: Uint8Array }>;
  signAndSendTransaction(transaction: Transaction): Promise<{ signature: string }>;
}

export function getPhantomProvider(): SolanaWalletProvider | null {
  if (typeof window === "undefined") return null;
  // Phantom canonical namespace (current docs). Brave's built-in wallet hijacks
  // window.solana without isPhantom, so check window.phantom.solana first.
  const fromPhantom = window.phantom?.solana;
  if (fromPhantom?.isPhantom) return fromPhantom;
  const fromLegacy = window.solana;
  if (fromLegacy?.isPhantom) return fromLegacy;
  return null;
}

export function getConnection(): Connection {
  return new Connection(
    process.env.NEXT_PUBLIC_MAGICBLOCK_ROUTER_RPC_URL ??
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
      MAGICBLOCK_ROUTER_DEVNET_RPC,
    "confirmed"
  );
}

export async function assertProgramDeployed(connection: Connection, programId: string): Promise<void> {
  const info = await connection.getAccountInfo(new PublicKey(programId));
  if (!info?.executable) {
    throw new Error(`Program ${programId} is not deployed/executable on this RPC cluster.`);
  }
}

export function getShieldedPoolStatePda(): PublicKey {
  const programId = new PublicKey(PROGRAM_IDS.shieldedPool);
  return PublicKey.findProgramAddressSync([new TextEncoder().encode("shielded-pool-state")], programId)[0];
}

async function anchorDiscriminator(name: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(`global:${name}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(hash).slice(0, 8);
}

function u64Le(value: bigint): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, value, true);
  return out;
}

function bytes32FromField(value: bigint): Uint8Array {
  const hex = value.toString(16).padStart(64, "0");
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

async function buildDepositInstruction(params: {
  relay: PublicKey;
  commitment: bigint;
  denominationLamports: bigint;
  relayNonce: bigint;
}): Promise<TransactionInstruction> {
  const programId = new PublicKey(PROGRAM_IDS.shieldedPool);
  const data = new Uint8Array(8 + 32 + 8 + 8);
  data.set(await anchorDiscriminator("deposit"), 0);
  data.set(bytes32FromField(params.commitment), 8);
  data.set(u64Le(params.denominationLamports), 40);
  data.set(u64Le(params.relayNonce), 48);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: params.relay, isSigner: true, isWritable: true },
      { pubkey: getShieldedPoolStatePda(), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

export async function submitDeposit(params: {
  wallet: SolanaWalletProvider;
  amountLamports: bigint;
  commitment: bigint;
}): Promise<{ signature: string }> {
  if (!params.wallet.publicKey) throw new Error("Wallet is not connected.");
  const connection = getConnection();
  await assertProgramDeployed(connection, PROGRAM_IDS.shieldedPool);

  const latest = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: params.wallet.publicKey,
    blockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight,
  });
  transaction.add(
    await buildDepositInstruction({
      relay: params.wallet.publicKey,
      commitment: params.commitment,
      denominationLamports: params.amountLamports,
      relayNonce: BigInt(Date.now()),
    })
  );

  const { signature } = await params.wallet.signAndSendTransaction(transaction);
  await connection.confirmTransaction({ signature, ...latest }, "confirmed");
  return { signature };
}
