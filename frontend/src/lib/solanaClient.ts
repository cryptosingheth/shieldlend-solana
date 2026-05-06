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

export interface SolanaWalletProvider {
  isPhantom?: boolean;
  publicKey?: PublicKey;
  connect(): Promise<{ publicKey: PublicKey }>;
  disconnect(): Promise<void>;
  signMessage?(message: Uint8Array, encoding?: "utf8" | "hex"): Promise<{ signature: Uint8Array }>;
  signAndSendTransaction(transaction: Transaction): Promise<{ signature: string }>;
}

export function getPhantomProvider(): SolanaWalletProvider | null {
  if (typeof window === "undefined") return null;
  return window.solana?.isPhantom ? window.solana : null;
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
