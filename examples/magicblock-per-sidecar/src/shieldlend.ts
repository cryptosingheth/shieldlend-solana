/**
 * ShieldLend PER use-case bundles.
 *
 * Each function models one ShieldLend privacy pattern using MagicBlock PER:
 *
 *   privateDepositIntent   — batch deposit intents off-chain, commit batch
 *   proofIntent            — verify ZK proofs in PER, commit result on-chain
 *   queuedWithdrawalIntent — order withdrawals in PER, settle base-layer once
 *   batchedDepositCounter  — increment counter N times in PER, one base commit
 *
 * All functions return a PerLifecycleBundle ready for signing and submission.
 * No wallet or connection is required here.
 */

import { Keypair, PublicKey } from "@solana/web3.js";
import {
  makeDepositIntent,
  makeProofIntent,
  makeWithdrawalIntent,
  makeBatchedDepositCounter,
  SHIELDED_POOL_PROGRAM,
  type DepositIntentAccount,
  type ProofIntentAccount,
  type WithdrawalIntentAccount,
  type BatchedDepositCounterAccount,
} from "./accounts";
import { buildFullLifecycle, type PerLifecycleBundle } from "./lifecycle";

// ─── Use-case bundles ────────────────────────────────────────────────────────

export interface DepositIntentBundle {
  account: DepositIntentAccount;
  lifecycle: PerLifecycleBundle;
}

export interface ProofIntentBundle {
  account: ProofIntentAccount;
  lifecycle: PerLifecycleBundle;
}

export interface WithdrawalIntentBundle {
  account: WithdrawalIntentAccount;
  lifecycle: PerLifecycleBundle;
}

export interface BatchedCounterBundle {
  account: BatchedDepositCounterAccount;
  lifecycle: PerLifecycleBundle;
}

// ─── 1. Private deposit intent ───────────────────────────────────────────────

/**
 * Models a shielded deposit intent delegated to PER.
 *
 * Scenario: a user wants to deposit SOL into the ShieldLend shielded pool.
 * Instead of submitting each deposit directly on-chain (expensive, observable),
 * the intent is live in the PER. Many users' intents can be accumulated and
 * committed as a single batch via flush_epoch, hiding individual amounts.
 *
 * @param owner  Depositor's public key.
 * @param nonce  Sequential nonce for deduplication (0-indexed per user).
 * @param amountLamports  Amount in lamports.
 * @param payer  Fee payer for the setup instructions.
 */
export function buildPrivateDepositIntentPer(
  owner: PublicKey,
  nonce: number,
  amountLamports: bigint,
  payer: PublicKey
): DepositIntentBundle {
  const account = makeDepositIntent(owner, nonce, amountLamports);
  const lifecycle = buildFullLifecycle({
    per: account.per,
    payer,
    authority: owner,
    ownerProgram: SHIELDED_POOL_PROGRAM,
    // 30-second commit frequency — short enough for deposit batching
    commitFrequencyMs: 30_000,
  });
  return { account, lifecycle };
}

// ─── 2. Proof intent ─────────────────────────────────────────────────────────

/**
 * Models a ZK proof submission delegated to PER.
 *
 * Scenario: a user submits a Groth16 BN254 proof for a shielded withdrawal.
 * The proof can be verified inside the PER (cheap, private). Only the verified
 * result — a nullifier mark and amount commitment — is committed back to the
 * base-layer shielded pool.
 *
 * @param nullifierHash  32-byte nullifier hash (identifies the UTXO being spent).
 * @param payer  Fee payer and authority for the PER session.
 */
export function buildProofIntentPer(
  nullifierHash: Buffer,
  payer: PublicKey
): ProofIntentBundle {
  if (nullifierHash.length !== 32) {
    throw new Error(
      `nullifierHash must be 32 bytes, got ${nullifierHash.length}`
    );
  }
  const account = makeProofIntent(nullifierHash);
  const lifecycle = buildFullLifecycle({
    per: account.per,
    payer,
    authority: payer,
    ownerProgram: SHIELDED_POOL_PROGRAM,
    // Proof verification is fast — 5s commit cycle is sufficient
    commitFrequencyMs: 5_000,
  });
  return { account, lifecycle };
}

// ─── 3. Queued withdrawal intent ─────────────────────────────────────────────

/**
 * Models a queued withdrawal intent delegated to PER.
 *
 * Scenario: multiple users queue withdrawal intents. The PER orders them
 * (preventing frontrunning) and batches the final base-layer settlements,
 * reducing the on-chain footprint and hiding the withdrawal order from MEV bots.
 *
 * @param owner  Withdrawer's public key.
 * @param nonce  Sequential nonce per user.
 * @param destination  Final destination for the withdrawn funds.
 * @param payer  Fee payer.
 */
export function buildQueuedWithdrawalIntentPer(
  owner: PublicKey,
  nonce: number,
  destination: PublicKey,
  payer: PublicKey
): WithdrawalIntentBundle {
  const account = makeWithdrawalIntent(owner, nonce, destination);
  const lifecycle = buildFullLifecycle({
    per: account.per,
    payer,
    authority: owner,
    ownerProgram: SHIELDED_POOL_PROGRAM,
    // 60s commit cycle — withdrawals are less time-sensitive than proofs
    commitFrequencyMs: 60_000,
  });
  return { account, lifecycle };
}

// ─── 4. Batched deposit counter ───────────────────────────────────────────────

/**
 * Models a batched deposit counter delegated to PER.
 *
 * Scenario: a counter tracks how many deposits have been received in the
 * current epoch. It can be incremented thousands of times per second in the
 * PER at near-zero cost. A single commit at epoch boundary writes the final
 * count to the base-layer shielded_pool, triggering flush_epoch.
 *
 * This is the cleanest PER demonstration: N writes in PER → 1 write on-chain.
 *
 * @param epoch  The ShieldLend epoch number.
 * @param payer  Fee payer and authority.
 */
export function buildBatchedDepositCounterPer(
  epoch: number,
  payer: PublicKey
): BatchedCounterBundle {
  const account = makeBatchedDepositCounter(epoch);
  const lifecycle = buildFullLifecycle({
    per: account.per,
    payer,
    authority: payer,
    ownerProgram: SHIELDED_POOL_PROGRAM,
    // Match ShieldLend epoch duration — commit at epoch boundary
    commitFrequencyMs: 300_000,
  });
  return { account, lifecycle };
}

// ─── Summary printer ─────────────────────────────────────────────────────────

export interface SidecarSummary {
  depositIntent: DepositIntentBundle;
  proofIntent: ProofIntentBundle;
  withdrawalIntent: WithdrawalIntentBundle;
  batchedCounter: BatchedCounterBundle;
}

/**
 * Builds all four ShieldLend PER use-case bundles for a given wallet.
 * Used by the demo entry point and the smoke script.
 */
export function buildAllUseCases(wallet: PublicKey): SidecarSummary {
  const nullifierHash = Buffer.alloc(32, 0xab);

  return {
    depositIntent: buildPrivateDepositIntentPer(
      wallet,
      0,
      BigInt(1_000_000_000),
      wallet
    ),
    proofIntent: buildProofIntentPer(nullifierHash, wallet),
    withdrawalIntent: buildQueuedWithdrawalIntentPer(
      wallet,
      0,
      wallet,
      wallet
    ),
    batchedCounter: buildBatchedDepositCounterPer(1, wallet),
  };
}
