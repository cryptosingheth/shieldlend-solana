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
export const DEFAULT_PRIVATE_PAYMENTS_API_URL = "https://payments.magicblock.app";

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
  return (
    process.env.NEXT_PUBLIC_MAGICBLOCK_PRIVATE_PAYMENTS_URL ||
    DEFAULT_PRIVATE_PAYMENTS_API_URL
  );
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

export interface MagicBlockHttpErrorDetail {
  path: string;
  status: number;
  statusText: string;
  body: string;
}

export class MagicBlockHttpError extends Error {
  readonly detail: MagicBlockHttpErrorDetail;

  constructor(detail: MagicBlockHttpErrorDetail) {
    super(
      `MagicBlock Private Payments ${detail.path} failed ` +
        `(${detail.status}): ${detail.body || detail.statusText}`
    );
    this.name = "MagicBlockHttpError";
    this.detail = detail;
  }
}

export type MagicBlockCluster = "mainnet" | "devnet" | string;

export interface MagicBlockRequestOptions {
  bearerToken?: string;
}

export interface MagicBlockChallengeParams {
  pubkey: string;
  cluster?: MagicBlockCluster;
  mock?: boolean;
}

export interface MagicBlockChallengeResponse {
  challenge: string;
}

export interface MagicBlockLoginParams {
  pubkey: string;
  challenge: string;
  signature: string;
  cluster?: MagicBlockCluster;
  mock?: boolean;
}

export interface MagicBlockLoginResponse {
  token: string;
}

export interface MagicBlockTransactionBuild {
  kind: "deposit" | "transfer" | "withdraw" | string;
  version: "legacy" | "v0";
  transactionBase64: string;
  sendTo: "base" | "ephemeral";
  recentBlockhash: string;
  lastValidBlockHeight: number;
  instructionCount: number;
  requiredSigners: string[];
  validator?: string;
}

export interface MagicBlockMintStatus {
  initialized: boolean;
}

export interface MagicBlockBalance {
  address: string;
  mint: string;
  ata: string;
  location: "base" | "ephemeral";
  balance: string;
}

export interface MagicBlockInitializeMintParams {
  owner: string;
  mint: string;
  cluster?: MagicBlockCluster;
  validator?: string;
}

export interface MagicBlockDepositSplParams {
  owner: string;
  amount: number;
  cluster?: MagicBlockCluster;
  mint?: string;
  validator?: string;
  initIfMissing?: boolean;
  initVaultIfMissing?: boolean;
  initAtasIfMissing?: boolean;
  idempotent?: boolean;
}

export interface MagicBlockTransferSplParams {
  from: string;
  to: string;
  mint: string;
  amount: number;
  visibility: "public" | "private";
  fromBalance: "base" | "ephemeral";
  toBalance: "base" | "ephemeral";
  cluster?: MagicBlockCluster;
  validator?: string;
  initIfMissing?: boolean;
  initAtasIfMissing?: boolean;
  initVaultIfMissing?: boolean;
  memo?: string;
  minDelayMs?: string;
  maxDelayMs?: string;
  clientRefId?: string;
  split?: number;
  gasless?: boolean;
  legacy?: boolean;
}

export interface MagicBlockWithdrawSplParams {
  owner: string;
  mint: string;
  amount: number;
  cluster?: MagicBlockCluster;
  validator?: string;
  initIfMissing?: boolean;
  initAtasIfMissing?: boolean;
  escrowIndex?: number;
  idempotent?: boolean;
}

function appendQuery(path: string, query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

async function ppPost<T>(
  path: string,
  body: unknown,
  options: MagicBlockRequestOptions = {}
): Promise<T> {
  const base = getPrivatePaymentsBaseUrl();
  if (!base) throw new MagicBlockNotConfiguredError(path);
  const url = `${base.replace(/\/$/, "")}${path}`;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.bearerToken) headers.authorization = `Bearer ${options.bearerToken}`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new MagicBlockHttpError({
      path,
      status: res.status,
      statusText: res.statusText,
      body: text,
    });
  }
  return res.json() as Promise<T>;
}

async function ppGet<T>(
  path: string,
  options: MagicBlockRequestOptions = {}
): Promise<T> {
  const base = getPrivatePaymentsBaseUrl();
  if (!base) throw new MagicBlockNotConfiguredError(path);
  const url = `${base.replace(/\/$/, "")}${path}`;
  const headers: Record<string, string> = {};
  if (options.bearerToken) headers.authorization = `Bearer ${options.bearerToken}`;
  const res = await fetch(url, { method: "GET", headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new MagicBlockHttpError({
      path,
      status: res.status,
      statusText: res.statusText,
      body: text,
    });
  }
  return res.json() as Promise<T>;
}

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(bytes: Uint8Array): string {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) + BigInt(byte);

  let encoded = "";
  while (value > 0n) {
    const mod = Number(value % 58n);
    encoded = BASE58_ALPHABET[mod] + encoded;
    value /= 58n;
  }

  for (const byte of bytes) {
    if (byte === 0) encoded = "1" + encoded;
    else break;
  }

  return encoded || "1";
}

export async function getPrivatePaymentsHealth(): Promise<{ status: "ok" | string }> {
  return ppGet<{ status: "ok" | string }>("/health");
}

export async function getSplChallenge(
  params: MagicBlockChallengeParams
): Promise<MagicBlockChallengeResponse> {
  return ppGet<MagicBlockChallengeResponse>(
    appendQuery("/v1/spl/challenge", params)
  );
}

export async function loginSpl(
  params: MagicBlockLoginParams
): Promise<MagicBlockLoginResponse> {
  return ppPost<MagicBlockLoginResponse>("/v1/spl/login", params);
}

export async function loginSplWithSigner(params: {
  pubkey: PublicKey;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  cluster?: MagicBlockCluster;
  mock?: boolean;
}): Promise<MagicBlockLoginResponse & { challenge: string }> {
  const pubkey = params.pubkey.toBase58();
  const challenge = await getSplChallenge({
    pubkey,
    cluster: params.cluster,
    mock: params.mock,
  });
  const message = new TextEncoder().encode(challenge.challenge);
  const signature = base58Encode(await params.signMessage(message));
  const login = await loginSpl({
    pubkey,
    challenge: challenge.challenge,
    signature,
    cluster: params.cluster,
    mock: params.mock,
  });
  return { ...login, challenge: challenge.challenge };
}

export async function isSplMintInitialized(params: {
  mint: string;
  cluster?: MagicBlockCluster;
  validator?: string;
}): Promise<MagicBlockMintStatus> {
  return ppGet<MagicBlockMintStatus>(
    appendQuery("/v1/spl/is-mint-initialized", params)
  );
}

export async function initializeSplMint(
  params: MagicBlockInitializeMintParams
): Promise<MagicBlockTransactionBuild> {
  return ppPost<MagicBlockTransactionBuild>("/v1/spl/initialize-mint", params);
}

export async function depositSpl(
  params: MagicBlockDepositSplParams
): Promise<MagicBlockTransactionBuild> {
  return ppPost<MagicBlockTransactionBuild>("/v1/spl/deposit", params);
}

export async function transferSpl(
  params: MagicBlockTransferSplParams,
  options: MagicBlockRequestOptions = {}
): Promise<MagicBlockTransactionBuild> {
  return ppPost<MagicBlockTransactionBuild>("/v1/spl/transfer", params, options);
}

export async function withdrawSpl(
  params: MagicBlockWithdrawSplParams
): Promise<MagicBlockTransactionBuild> {
  return ppPost<MagicBlockTransactionBuild>("/v1/spl/withdraw", params);
}

export async function getSplBalance(params: {
  address: string;
  mint: string;
  cluster?: MagicBlockCluster;
}): Promise<MagicBlockBalance> {
  return ppGet<MagicBlockBalance>(appendQuery("/v1/spl/balance", params));
}

export async function getSplPrivateBalance(
  params: {
    address: string;
    mint: string;
    cluster?: MagicBlockCluster;
  },
  options: MagicBlockRequestOptions
): Promise<MagicBlockBalance> {
  return ppGet<MagicBlockBalance>(
    appendQuery("/v1/spl/private-balance", params),
    options
  );
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
  senderPublicKey?: string;
  recipientPublicKey?: string;
  owner?: string;
  mint?: string;
  amountLamports?: string;
  amount?: number;
  cluster?: MagicBlockCluster;
  memo?: string;
}

export interface PrivateDepositResult {
  receiptHash: string;
  raw: unknown;
}

export async function privateDeposit(
  params: PrivateDepositParams
): Promise<PrivateDepositResult> {
  const owner = params.owner ?? params.senderPublicKey;
  const amount = params.amount ?? Number(params.amountLamports);
  if (!owner || !Number.isFinite(amount) || amount < 1) {
    throw new Error("MagicBlock deposit requires owner and amount base units.");
  }
  const payload = await depositSpl({
    owner,
    amount,
    cluster: params.cluster,
    mint: params.mint,
    initIfMissing: true,
    initVaultIfMissing: true,
    initAtasIfMissing: true,
    idempotent: true,
  });
  const receiptHash = extractReceiptHash(payload);
  if (!receiptHash) {
    throw new Error(
      "MagicBlock Private Payments deposit only returned an unsigned transaction. Sign and submit it before treating the payment as settled."
    );
  }
  return { receiptHash, raw: payload };
}

// ─── Transfer ───────────────────────────────────────────────────────────────

export interface PrivateTransferParams {
  senderPublicKey?: string;
  recipientPublicKey?: string;
  from?: string;
  to?: string;
  mint: string;
  amountLamports?: string;
  amount?: number;
  visibility?: "public" | "private";
  fromBalance?: "base" | "ephemeral";
  toBalance?: "base" | "ephemeral";
  cluster?: MagicBlockCluster;
  bearerToken?: string;
  memo?: string;
}

export interface PrivateTransferResult {
  receiptHash: string;
  raw: unknown;
}

export async function privateTransfer(
  params: PrivateTransferParams
): Promise<PrivateTransferResult> {
  const from = params.from ?? params.senderPublicKey;
  const to = params.to ?? params.recipientPublicKey;
  const amount = params.amount ?? Number(params.amountLamports);
  if (!from || !to || !Number.isFinite(amount) || amount < 1) {
    throw new Error("MagicBlock transfer requires from, to, mint, and amount base units.");
  }
  const payload = await transferSpl(
    {
      from,
      to,
      mint: params.mint,
      amount,
      visibility: params.visibility ?? "private",
      fromBalance: params.fromBalance ?? "ephemeral",
      toBalance: params.toBalance ?? "ephemeral",
      cluster: params.cluster,
      initIfMissing: true,
      initAtasIfMissing: true,
      initVaultIfMissing: false,
      memo: params.memo,
      minDelayMs: "0",
      maxDelayMs: "0",
      split: 1,
    },
    params.bearerToken ? { bearerToken: params.bearerToken } : {}
  );
  const receiptHash = extractReceiptHash(payload);
  if (!receiptHash) {
    throw new Error(
      "MagicBlock Private Payments transfer only returned an unsigned transaction. Sign and submit it before treating the payment as settled."
    );
  }
  return { receiptHash, raw: payload };
}

// ─── Withdraw ───────────────────────────────────────────────────────────────

export interface PrivateWithdrawParams {
  ownerPublicKey?: string;
  owner?: string;
  destinationPublicKey?: string;
  mint: string;
  amountLamports?: string;
  amount?: number;
  cluster?: MagicBlockCluster;
}

export interface PrivateWithdrawResult {
  receiptHash: string;
  raw: unknown;
}

export async function privateWithdraw(
  params: PrivateWithdrawParams
): Promise<PrivateWithdrawResult> {
  const owner = params.owner ?? params.ownerPublicKey;
  const amount = params.amount ?? Number(params.amountLamports);
  if (!owner || !Number.isFinite(amount) || amount < 1) {
    throw new Error("MagicBlock withdraw requires owner, mint, and amount base units.");
  }
  const payload = await withdrawSpl({
    owner,
    mint: params.mint,
    amount,
    cluster: params.cluster,
    initIfMissing: true,
    initAtasIfMissing: true,
    idempotent: true,
  });
  const receiptHash = extractReceiptHash(payload);
  if (!receiptHash) {
    throw new Error(
      "MagicBlock Private Payments withdraw only returned an unsigned transaction. Sign and submit it before treating the payment as settled."
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
  publicKey: string,
  mint = "So11111111111111111111111111111111111111112",
  bearerToken?: string
): Promise<PrivateBalanceResult> {
  const payload = bearerToken
    ? await getSplPrivateBalance(
        { address: publicKey, mint, cluster: "devnet" },
        { bearerToken }
      )
    : await getSplBalance({ address: publicKey, mint, cluster: "devnet" });
  const r = payload as unknown as Record<string, unknown>;
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
  throw new Error(
    "MagicBlock Private Payments settlement now uses /v1/spl unsigned transaction builders. " +
      "Call transferSpl(...), sign the returned transaction locally, submit it, then bind the confirmed transaction signature as the settlement receipt. " +
      `Repayment params were not submitted: loanId=${params.loanId}, nullifierHash=${params.nullifierHash}, outstandingLamports=${params.outstandingLamports}, repaymentVault=${params.repaymentVault}`
  );
}

// ─── Re-export SDK flags for callers ────────────────────────────────────────

export { AUTHORITY_FLAG, TX_LOGS_FLAG };
export type { Member, MembersArgs };
