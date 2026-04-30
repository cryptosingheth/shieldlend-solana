import {
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
