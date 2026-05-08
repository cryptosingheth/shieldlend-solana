/**
 * ShieldLend PER account types and PDA derivation.
 *
 * These accounts model the four ShieldLend intent types that benefit from
 * MagicBlock PER:
 *   1. DepositIntent   — batched before flush_epoch
 *   2. ProofIntent     — ZK proof submitted; only result committed to base layer
 *   3. WithdrawalIntent — ordered in PER before base-layer settlement
 *   4. BatchedDepositCounter — incremented many times in PER, one commit to base
 *
 * None of these create on-chain accounts here — they are TypeScript models used
 * to derive the correct PDAs and build the PER instruction sets.
 */

import { PublicKey } from "@solana/web3.js";
import {
  permissionPdaFromAccount,
  delegationRecordPdaFromDelegatedAccount,
  delegationMetadataPdaFromDelegatedAccount,
  delegateBufferPdaFromDelegatedAccountAndOwnerProgram,
  commitStatePdaFromDelegatedAccount,
  commitRecordPdaFromDelegatedAccount,
  undelegateBufferPdaFromDelegatedAccount,
} from "@magicblock-labs/ephemeral-rollups-sdk";

// ─── Program IDs ────────────────────────────────────────────────────────────

/** ShieldLend shielded_pool program (deployed on devnet). */
export const SHIELDED_POOL_PROGRAM = new PublicKey(
  "9Bvt3jMawHFRRxpaQTtV5VvFdpZkmAZtvwjTrAX9TAtE"
);

/** ShieldLend lending_pool program (deployed on devnet). */
export const LENDING_POOL_PROGRAM = new PublicKey(
  "HLtWrvLyc2SE3ERWHaEdY4RG84GxFfHv3Qf4NzJPxaF7"
);

// ─── Account seeds (mirrors the Rust program seeds) ─────────────────────────

const DEPOSIT_INTENT_SEED = Buffer.from("deposit-intent");
const PROOF_INTENT_SEED = Buffer.from("proof-intent");
const WITHDRAWAL_INTENT_SEED = Buffer.from("withdrawal-intent");
const BATCHED_COUNTER_SEED = Buffer.from("batched-counter");

// ─── PDA derivation helpers ──────────────────────────────────────────────────

export function deriveDepositIntentPda(owner: PublicKey, nonce: number): PublicKey {
  const nonceBuf = Buffer.alloc(4);
  nonceBuf.writeUInt32LE(nonce);
  const [pda] = PublicKey.findProgramAddressSync(
    [DEPOSIT_INTENT_SEED, owner.toBuffer(), nonceBuf],
    SHIELDED_POOL_PROGRAM
  );
  return pda;
}

export function deriveProofIntentPda(nullifierHash: Buffer): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [PROOF_INTENT_SEED, nullifierHash],
    SHIELDED_POOL_PROGRAM
  );
  return pda;
}

export function deriveWithdrawalIntentPda(owner: PublicKey, nonce: number): PublicKey {
  const nonceBuf = Buffer.alloc(4);
  nonceBuf.writeUInt32LE(nonce);
  const [pda] = PublicKey.findProgramAddressSync(
    [WITHDRAWAL_INTENT_SEED, owner.toBuffer(), nonceBuf],
    SHIELDED_POOL_PROGRAM
  );
  return pda;
}

export function deriveBatchedCounterPda(epoch: number): PublicKey {
  const epochBuf = Buffer.alloc(8);
  epochBuf.writeBigUInt64LE(BigInt(epoch));
  const [pda] = PublicKey.findProgramAddressSync(
    [BATCHED_COUNTER_SEED, epochBuf],
    SHIELDED_POOL_PROGRAM
  );
  return pda;
}

// ─── PER PDA bundle ─────────────────────────────────────────────────────────

/**
 * All PDAs that MagicBlock creates/manages for one delegated account.
 * Pre-computing these lets callers pass them as remaining accounts to
 * on-chain programs without any on-chain derivation cost.
 */
export interface PerPdaBundle {
  /** The delegated account itself (e.g. a ShieldLend intent PDA). */
  account: PublicKey;
  /** Permission account PDA (access-control layer). */
  permissionPda: PublicKey;
  /** Delegation record PDA on the delegation program. */
  delegationRecord: PublicKey;
  /** Delegation metadata PDA. */
  delegationMetadata: PublicKey;
  /** Delegate buffer — holds in-progress state during a PER session. */
  delegateBuffer: PublicKey;
  /** Undelegate buffer — used when committing back to base layer. */
  undelegateBuffer: PublicKey;
  /** Commit state PDA. */
  commitState: PublicKey;
  /** Commit record PDA. */
  commitRecord: PublicKey;
}

export function buildPerPdaBundle(
  account: PublicKey,
  ownerProgram: PublicKey
): PerPdaBundle {
  return {
    account,
    permissionPda: permissionPdaFromAccount(account),
    delegationRecord: delegationRecordPdaFromDelegatedAccount(account),
    delegationMetadata: delegationMetadataPdaFromDelegatedAccount(account),
    delegateBuffer: delegateBufferPdaFromDelegatedAccountAndOwnerProgram(
      account,
      ownerProgram
    ),
    undelegateBuffer: undelegateBufferPdaFromDelegatedAccount(account),
    commitState: commitStatePdaFromDelegatedAccount(account),
    commitRecord: commitRecordPdaFromDelegatedAccount(account),
  };
}

// ─── Account model types ─────────────────────────────────────────────────────

export interface DepositIntentAccount {
  kind: "deposit-intent";
  owner: PublicKey;
  nonce: number;
  amountLamports: bigint;
  pda: PublicKey;
  per: PerPdaBundle;
}

export interface ProofIntentAccount {
  kind: "proof-intent";
  nullifierHash: Buffer;
  pda: PublicKey;
  per: PerPdaBundle;
}

export interface WithdrawalIntentAccount {
  kind: "withdrawal-intent";
  owner: PublicKey;
  nonce: number;
  destinationPubkey: PublicKey;
  pda: PublicKey;
  per: PerPdaBundle;
}

export interface BatchedDepositCounterAccount {
  kind: "batched-counter";
  epoch: number;
  pda: PublicKey;
  per: PerPdaBundle;
}

// ─── Factory helpers ─────────────────────────────────────────────────────────

export function makeDepositIntent(
  owner: PublicKey,
  nonce: number,
  amountLamports: bigint
): DepositIntentAccount {
  const pda = deriveDepositIntentPda(owner, nonce);
  return {
    kind: "deposit-intent",
    owner,
    nonce,
    amountLamports,
    pda,
    per: buildPerPdaBundle(pda, SHIELDED_POOL_PROGRAM),
  };
}

export function makeProofIntent(nullifierHash: Buffer): ProofIntentAccount {
  const pda = deriveProofIntentPda(nullifierHash);
  return {
    kind: "proof-intent",
    nullifierHash,
    pda,
    per: buildPerPdaBundle(pda, SHIELDED_POOL_PROGRAM),
  };
}

export function makeWithdrawalIntent(
  owner: PublicKey,
  nonce: number,
  destinationPubkey: PublicKey
): WithdrawalIntentAccount {
  const pda = deriveWithdrawalIntentPda(owner, nonce);
  return {
    kind: "withdrawal-intent",
    owner,
    nonce,
    destinationPubkey,
    pda,
    per: buildPerPdaBundle(pda, SHIELDED_POOL_PROGRAM),
  };
}

export function makeBatchedDepositCounter(epoch: number): BatchedDepositCounterAccount {
  const pda = deriveBatchedCounterPda(epoch);
  return {
    kind: "batched-counter",
    epoch,
    pda,
    per: buildPerPdaBundle(pda, SHIELDED_POOL_PROGRAM),
  };
}
