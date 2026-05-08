/**
 * MagicBlock PER / Private Payments adapter.
 *
 * SDK: @magicblock-labs/ephemeral-rollups-sdk 0.8.x
 * Covers: TEE integrity verification, auth token acquisition, permission +
 * delegation instruction builders (TypeScript only), and the Private Payments
 * API surface.
 *
 * Rust-side PER macros (#[ephemeral], #[delegate], #[commit]) are BLOCKED.
 * Reason: those macros require Anchor 0.32.1; this workspace uses 0.30.1.
 * Upgrading Anchor risks breaking the C2H devnet round-trip and must be
 * isolated in a dedicated upgrade task before Rust delegation can land.
 */

import { PublicKey, type TransactionInstruction } from "@solana/web3.js";
import {
  verifyTeeRpcIntegrity,
  getAuthToken,
  createCreatePermissionInstruction,
  createDelegatePermissionInstruction,
  createCommitAndUndelegatePermissionInstruction,
  AUTHORITY_FLAG,
  TX_LOGS_FLAG,
  PERMISSION_PROGRAM_ID as SDK_PERMISSION_PROGRAM_ID,
  DELEGATION_PROGRAM_ID as SDK_DELEGATION_PROGRAM_ID,
  MAGIC_PROGRAM_ID as SDK_MAGIC_PROGRAM_ID,
  MAGIC_CONTEXT_ID as SDK_MAGIC_CONTEXT_ID,
  permissionPdaFromAccount,
  type Member,
  type MembersArgs,
} from "@magicblock-labs/ephemeral-rollups-sdk";

// ─── Constants ─────────────────────────────────────────────────────────────

export const PERMISSION_PROGRAM_ID: PublicKey = SDK_PERMISSION_PROGRAM_ID;
export const DELEGATION_PROGRAM_ID: PublicKey = SDK_DELEGATION_PROGRAM_ID;
export const MAGIC_PROGRAM_ID: PublicKey = SDK_MAGIC_PROGRAM_ID;
export const MAGIC_CONTEXT_ID: PublicKey = SDK_MAGIC_CONTEXT_ID;

export const TEE_ATTESTATION_URL =
  "https://pccs.phala.network/tdx/certification/v4";

/** Devnet validator public keys from MagicBlock docs (stable as of 2026-05). */
export const DEVNET_VALIDATORS = {
  tee: new PublicKey("MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo"),
  us: new PublicKey("MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd"),
  eu: new PublicKey("MEUGGrYPxKk17hCr7wpT6s8dtNokZj5U2L57vjYMS8e"),
  as: new PublicKey("MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57"),
} as const;

const DEFAULT_TEE_RPC_URL = "https://devnet-tee.magicblock.app";
const DEFAULT_ROUTER_RPC_URL = "https://devnet-router.magicblock.app";

function getTeeRpcUrl(): string {
  return (
    process.env.NEXT_PUBLIC_MAGICBLOCK_TEE_RPC_URL ?? DEFAULT_TEE_RPC_URL
  );
}

function getRouterRpcUrl(): string {
  return (
    process.env.NEXT_PUBLIC_MAGICBLOCK_ROUTER_RPC_URL ?? DEFAULT_ROUTER_RPC_URL
  );
}

function getPrivatePaymentsBaseUrl(): string {
  return process.env.NEXT_PUBLIC_MAGICBLOCK_PRIVATE_PAYMENTS_URL ?? "";
}

// ─── TEE connectivity ───────────────────────────────────────────────────────

export interface TeeStatus {
  rpcUrl: string;
  routerRpcUrl: string;
  reachable: boolean;
  integrityVerified: boolean;
  error?: string;
}

/**
 * Verifies the TDX attestation of the TEE RPC and returns connectivity status.
 * Does not require a wallet — safe to call during page load.
 */
export async function verifyTeeRpc(): Promise<TeeStatus> {
  const rpcUrl = getTeeRpcUrl();
  const routerRpcUrl = getRouterRpcUrl();
  try {
    const integrityVerified = await verifyTeeRpcIntegrity(rpcUrl);
    return { rpcUrl, routerRpcUrl, reachable: true, integrityVerified };
  } catch (err) {
    return {
      rpcUrl,
      routerRpcUrl,
      reachable: false,
      integrityVerified: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Auth token ─────────────────────────────────────────────────────────────

export interface AuthTokenResult {
  token: string;
  expiresAt: number;
  authenticatedUrl: string;
}

/**
 * Obtains a TEE auth token for a given wallet public key.
 * The returned `authenticatedUrl` is ready for use as an RPC endpoint.
 *
 * @param publicKey  Solana PublicKey of the authenticating wallet.
 * @param signMessage  Function that signs a Uint8Array and returns the signature.
 */
export async function acquireAuthToken(
  publicKey: PublicKey,
  signMessage: (message: Uint8Array) => Promise<Uint8Array>
): Promise<AuthTokenResult> {
  const rpcUrl = getTeeRpcUrl();
  const result = await getAuthToken(rpcUrl, publicKey, signMessage);
  return {
    token: result.token,
    expiresAt: result.expiresAt,
    authenticatedUrl: `${rpcUrl}?token=${result.token}`,
  };
}

// ─── Permission instruction builders ────────────────────────────────────────

export interface CreatePermissionParams {
  /** The account to protect with access control. */
  permissionedAccount: PublicKey;
  /** Payer for account creation rent. */
  payer: PublicKey;
  /** Members who can view/modify the protected account in the PER. */
  members?: Member[];
}

/**
 * Returns an unsigned instruction that creates a permission account for
 * `permissionedAccount`. Submit to the base-layer Solana RPC (not the TEE).
 */
export function buildCreatePermissionInstruction(
  params: CreatePermissionParams
): TransactionInstruction {
  const { permissionedAccount, payer, members = [] } = params;
  const membersArgs: MembersArgs = { members: members.length > 0 ? members : null };
  return createCreatePermissionInstruction(
    { permissionedAccount, payer },
    membersArgs
  );
}

export interface DelegatePermissionParams {
  /** The account whose permission PDA will be delegated. */
  permissionedAccount: PublicKey;
  /** Payer for delegation fees. */
  payer: PublicKey;
  /** Authority pubkey (typically the program's PDA that owns the account). */
  authority: PublicKey;
  /** Whether the authority needs to be a mutable signer. Defaults to false. */
  authorityIsMutableSigner?: boolean;
  /** Optional preferred validator pubkey. */
  validator?: PublicKey | null;
}

/**
 * Returns an unsigned instruction that delegates the permission PDA for
 * `permissionedAccount` to the MagicBlock PER. Submit to the base-layer RPC.
 */
export function buildDelegatePermissionInstruction(
  params: DelegatePermissionParams
): TransactionInstruction {
  const {
    permissionedAccount,
    payer,
    authority,
    authorityIsMutableSigner = false,
    validator = null,
  } = params;
  return createDelegatePermissionInstruction({
    payer,
    authority: [authority, authorityIsMutableSigner],
    permissionedAccount: [permissionedAccount, false],
    ownerProgram: PERMISSION_PROGRAM_ID,
    validator,
  });
}

export interface CommitAndUndelegatePermissionParams {
  /** The account to commit and remove from PER delegation. */
  permissionedAccount: PublicKey;
  /** Authority (payer) who initiates the commit. */
  authority: PublicKey;
}

/**
 * Returns an unsigned instruction that commits state from the PER back to the
 * base layer and removes the permission account delegation.
 */
export function buildCommitAndUndelegatePermissionInstruction(
  params: CommitAndUndelegatePermissionParams
): TransactionInstruction {
  const { permissionedAccount, authority } = params;
  return createCommitAndUndelegatePermissionInstruction({
    authority: [authority, true],
    permissionedAccount: [permissionedAccount, false],
  });
}

/**
 * Derives the permission PDA for a given account. Useful for pre-computing
 * the address before submitting the create-permission instruction.
 */
export function derivePermissionPda(account: PublicKey): PublicKey {
  return permissionPdaFromAccount(account);
}

/** Constructs a Member record granting authority + tx-log visibility. */
export function authorityMember(pubkey: PublicKey): Member {
  return { flags: AUTHORITY_FLAG | TX_LOGS_FLAG, pubkey };
}

// ─── Live status ────────────────────────────────────────────────────────────

export type MagicBlockRailKey =
  | "per_tee_connectivity"
  | "private_payments_configured"
  | "rust_macros_anchor_version";

export interface MagicBlockRailStatus {
  key: MagicBlockRailKey;
  label: string;
  status: "live" | "configured" | "blocked" | "unavailable";
  detail: string;
}

export interface MagicBlockLiveStatus {
  rails: MagicBlockRailStatus[];
  tee: TeeStatus;
  sdkVersion: string;
}

/**
 * Returns a live status snapshot for all MagicBlock rails.
 * Hits the real TEE RPC — call at most once per session load.
 */
export async function getMagicBlockLiveStatus(): Promise<MagicBlockLiveStatus> {
  const tee = await verifyTeeRpc();

  const privatePaymentsUrl = getPrivatePaymentsBaseUrl();

  const rails: MagicBlockRailStatus[] = [
    {
      key: "per_tee_connectivity",
      label: "PER TEE RPC",
      status: tee.integrityVerified
        ? "live"
        : tee.reachable
          ? "configured"
          : "unavailable",
      detail: tee.integrityVerified
        ? `TEE integrity verified. RPC: ${tee.rpcUrl}`
        : tee.error
          ? `TEE unreachable: ${tee.error}`
          : `TEE reachable but integrity unverified. RPC: ${tee.rpcUrl}`,
    },
    {
      key: "private_payments_configured",
      label: "Private Payments API",
      status: privatePaymentsUrl ? "configured" : "unavailable",
      detail: privatePaymentsUrl
        ? `Endpoint configured: ${privatePaymentsUrl}`
        : "NEXT_PUBLIC_MAGICBLOCK_PRIVATE_PAYMENTS_URL not set. Set this to the Private Payments API base URL (request access via MagicBlock Discord).",
    },
    {
      key: "rust_macros_anchor_version",
      label: "PER Rust Macros (#[ephemeral] / #[delegate])",
      status: "blocked",
      detail:
        "Blocked: Anchor 0.32.1 required, workspace uses 0.30.1. " +
        "Upgrading Anchor must be isolated before adding #[ephemeral], " +
        "#[delegate], #[commit] to shielded_pool or lending_pool programs.",
    },
  ];

  return { rails, tee, sdkVersion: "0.8.x" };
}

// ─── Private Payments API ───────────────────────────────────────────────────

export class MagicBlockNotConfiguredError extends Error {
  constructor(surface: string) {
    super(
      `MagicBlock Private Payments is not configured for ${surface}. ` +
        "Set NEXT_PUBLIC_MAGICBLOCK_PRIVATE_PAYMENTS_URL to the API base URL."
    );
    this.name = "MagicBlockNotConfiguredError";
  }
}

async function ppPost<T>(path: string, body: unknown): Promise<T> {
  const base = getPrivatePaymentsBaseUrl();
  if (!base) throw new MagicBlockNotConfiguredError(path);
  const url = `${base.replace(/\/$/, "")}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `MagicBlock Private Payments ${path} failed (${res.status}): ${text || res.statusText}`
    );
  }
  return res.json() as Promise<T>;
}

async function ppGet<T>(path: string): Promise<T> {
  const base = getPrivatePaymentsBaseUrl();
  if (!base) throw new MagicBlockNotConfiguredError(path);
  const url = `${base.replace(/\/$/, "")}${path}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `MagicBlock Private Payments ${path} failed (${res.status}): ${text || res.statusText}`
    );
  }
  return res.json() as Promise<T>;
}

function extractReceiptHash(payload: unknown): string {
  if (payload && typeof payload === "object") {
    const r = payload as Record<string, unknown>;
    for (const key of [
      "receiptHash",
      "settlementReceiptHash",
      "transactionSignature",
      "signature",
      "txId",
    ]) {
      if (typeof r[key] === "string") return r[key] as string;
    }
  }
  return "";
}

// ─── Deposit ────────────────────────────────────────────────────────────────

export interface PrivateDepositParams {
  senderPublicKey: string;
  recipientPublicKey: string;
  amountLamports: string;
  memo?: string;
}

export interface PrivateDepositResult {
  receiptHash: string;
  raw: unknown;
}

export async function privateDeposit(
  params: PrivateDepositParams
): Promise<PrivateDepositResult> {
  const payload = await ppPost<unknown>("/payments/deposit", params);
  const receiptHash = extractReceiptHash(payload);
  if (!receiptHash) {
    throw new Error(
      "MagicBlock Private Payments deposit response did not include a receipt hash."
    );
  }
  return { receiptHash, raw: payload };
}

// ─── Transfer ───────────────────────────────────────────────────────────────

export interface PrivateTransferParams {
  senderPublicKey: string;
  recipientPublicKey: string;
  amountLamports: string;
  memo?: string;
}

export interface PrivateTransferResult {
  receiptHash: string;
  raw: unknown;
}

export async function privateTransfer(
  params: PrivateTransferParams
): Promise<PrivateTransferResult> {
  const payload = await ppPost<unknown>("/payments/transfer", params);
  const receiptHash = extractReceiptHash(payload);
  if (!receiptHash) {
    throw new Error(
      "MagicBlock Private Payments transfer response did not include a receipt hash."
    );
  }
  return { receiptHash, raw: payload };
}

// ─── Withdraw ───────────────────────────────────────────────────────────────

export interface PrivateWithdrawParams {
  ownerPublicKey: string;
  destinationPublicKey: string;
  amountLamports: string;
}

export interface PrivateWithdrawResult {
  receiptHash: string;
  raw: unknown;
}

export async function privateWithdraw(
  params: PrivateWithdrawParams
): Promise<PrivateWithdrawResult> {
  const payload = await ppPost<unknown>("/payments/withdraw", params);
  const receiptHash = extractReceiptHash(payload);
  if (!receiptHash) {
    throw new Error(
      "MagicBlock Private Payments withdraw response did not include a receipt hash."
    );
  }
  return { receiptHash, raw: payload };
}

// ─── Balance / status ────────────────────────────────────────────────────────

export interface PrivateBalanceResult {
  publicKey: string;
  balanceLamports: string;
  raw: unknown;
}

export async function privateBalance(
  publicKey: string
): Promise<PrivateBalanceResult> {
  const payload = await ppGet<unknown>(`/payments/balance/${publicKey}`);
  const r = payload as Record<string, unknown>;
  const balanceLamports =
    typeof r["balanceLamports"] === "string"
      ? r["balanceLamports"]
      : typeof r["balance"] === "string"
        ? r["balance"]
        : "0";
  return { publicKey, balanceLamports, raw: payload };
}

// ─── Repayment settlement (used by protocolAdapters.ts) ─────────────────────

export interface SettleRepaymentParams {
  loanId: string;
  nullifierHash: string;
  outstandingLamports: string;
  repaymentVault: string;
}

export interface SettleRepaymentResult {
  receiptHash: string;
  raw: unknown;
}

export async function settleRepayment(
  params: SettleRepaymentParams
): Promise<SettleRepaymentResult> {
  const payload = await ppPost<unknown>("/repayments/settle", params);
  const receiptHash = extractReceiptHash(payload);
  if (!receiptHash) {
    throw new Error(
      "MagicBlock Private Payments settle response did not include a receipt hash."
    );
  }
  return { receiptHash, raw: payload };
}

// ─── Re-export SDK flags for callers ────────────────────────────────────────

export { AUTHORITY_FLAG, TX_LOGS_FLAG };
export type { Member, MembersArgs };
