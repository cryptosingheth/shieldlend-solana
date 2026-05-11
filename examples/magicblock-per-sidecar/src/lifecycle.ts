/**
 * MagicBlock PER lifecycle builders.
 *
 * Phases:
 *   1. Setup (base layer)  — createPermission + delegate → submits on Solana
 *   2. PER execution       — any instructions routed via ConnectionMagicRouter
 *   3. Commit (PER)        — createCommitAndUndelegate → submitted ON the PER,
 *                            auto-propagated back to base layer by the validator
 *
 * All builders return unsigned TransactionInstruction arrays. Callers assemble
 * and sign them. No wallet is required here.
 */

import {
  PublicKey,
  TransactionInstruction,
  SystemProgram,
} from "@solana/web3.js";
import {
  createCreatePermissionInstruction,
  createDelegatePermissionInstruction,
  createDelegateInstruction,
  createCommitInstruction,
  createCommitAndUndelegateInstruction,
  AUTHORITY_FLAG,
  TX_LOGS_FLAG,
  PERMISSION_PROGRAM_ID,
  type Member,
  type MembersArgs,
} from "@magicblock-labs/ephemeral-rollups-sdk";
import type { PerPdaBundle } from "./accounts";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SetupInstructions {
  /**
   * createPermission — must be sent to the base-layer Solana RPC.
   * Creates the access-control permission account for this PDA.
   */
  createPermission: TransactionInstruction;
  /**
   * delegatePermission — must be sent to the base-layer Solana RPC.
   * Registers the permission account with the MagicBlock delegation program.
   */
  delegatePermission: TransactionInstruction;
  /**
   * delegate — must be sent to the base-layer Solana RPC.
   * Transfers ownership of the underlying account to the MagicBlock PER.
   * After this instruction is confirmed, the account is live in the PER.
   */
  delegate: TransactionInstruction;
}

export interface CommitInstructions {
  /**
   * commitAndUndelegate — must be sent to the PER via ConnectionMagicRouter.
   * Snapshots PER state → propagates to base layer → releases delegation.
   */
  commitAndUndelegate: TransactionInstruction;
}

export interface CommitOnlyInstructions {
  /**
   * commit — schedules a state snapshot without undelegating.
   * Useful for periodic checkpoints mid-session.
   */
  commit: TransactionInstruction;
}

// ─── Setup lifecycle ─────────────────────────────────────────────────────────

/**
 * Builds the full base-layer setup instruction set for one account:
 * createPermission → delegatePermission → delegate.
 *
 * Optionally specifies a preferred validator for the PER session.
 * Optionally adds members to the permission account (access-control list).
 */
export function buildSetupInstructions(params: {
  per: PerPdaBundle;
  payer: PublicKey;
  authority: PublicKey;
  ownerProgram: PublicKey;
  validator?: PublicKey;
  members?: Member[];
  commitFrequencyMs?: number;
}): SetupInstructions {
  const {
    per,
    payer,
    authority,
    ownerProgram,
    validator = null,
    members = [],
    commitFrequencyMs,
  } = params;

  const membersArgs: MembersArgs = {
    members: members.length > 0 ? members : null,
  };

  const createPermission = createCreatePermissionInstruction(
    { permissionedAccount: per.account, payer },
    membersArgs
  );

  const delegatePermission = createDelegatePermissionInstruction({
    payer,
    authority: [authority, false],
    permissionedAccount: [per.account, false],
    ownerProgram: PERMISSION_PROGRAM_ID,
    validator,
  });

  const delegate = createDelegateInstruction(
    {
      payer,
      delegatedAccount: per.account,
      ownerProgram,
      ...(validator ? { validator } : {}),
    },
    commitFrequencyMs !== undefined ? { commitFrequencyMs, validator } : undefined
  );

  return { createPermission, delegatePermission, delegate };
}

// ─── Commit lifecycle (sent to PER via ConnectionMagicRouter) ────────────────

/**
 * Builds the commit + undelegate instruction.
 * Submit via ConnectionMagicRouter — the PER propagates the state change back.
 */
export function buildCommitAndUndelegateInstructions(
  payer: PublicKey,
  accounts: PublicKey[]
): CommitInstructions {
  return {
    commitAndUndelegate: createCommitAndUndelegateInstruction(payer, accounts),
  };
}

/**
 * Builds a checkpoint-only commit (no undelegate).
 * Useful for periodic state snapshots during a long PER session.
 * Submit via ConnectionMagicRouter.
 */
export function buildCommitOnlyInstructions(
  payer: PublicKey,
  accounts: PublicKey[]
): CommitOnlyInstructions {
  return {
    commit: createCommitInstruction(payer, accounts),
  };
}

// ─── Authority member helper ─────────────────────────────────────────────────

/**
 * Creates a Member record granting full authority and tx-log visibility.
 * Typically used for the ShieldLend program authority.
 */
export function authorityMember(pubkey: PublicKey): Member {
  return { flags: AUTHORITY_FLAG | TX_LOGS_FLAG, pubkey };
}

// ─── Full lifecycle bundle ───────────────────────────────────────────────────

export interface PerLifecycleBundle {
  /** Instructions to submit to the base-layer Solana RPC in order. */
  setup: SetupInstructions;
  /**
   * Instruction to submit to the PER via ConnectionMagicRouter
   * when the PER session is complete.
   */
  commit: CommitInstructions;
  /** Optional periodic checkpoint instruction (send to PER mid-session). */
  checkpoint: CommitOnlyInstructions;
  /** All PDAs involved — useful for remaining_accounts in on-chain CPIs. */
  per: PerPdaBundle;
}

export function buildFullLifecycle(params: {
  per: PerPdaBundle;
  payer: PublicKey;
  authority: PublicKey;
  ownerProgram: PublicKey;
  validator?: PublicKey;
  commitFrequencyMs?: number;
}): PerLifecycleBundle {
  const { per, payer, authority, ownerProgram, validator, commitFrequencyMs } =
    params;

  const setup = buildSetupInstructions({
    per,
    payer,
    authority,
    ownerProgram,
    validator,
    members: [authorityMember(authority)],
    commitFrequencyMs,
  });

  const commit = buildCommitAndUndelegateInstructions(payer, [per.account]);
  const checkpoint = buildCommitOnlyInstructions(payer, [per.account]);

  return { setup, commit, checkpoint, per };
}
