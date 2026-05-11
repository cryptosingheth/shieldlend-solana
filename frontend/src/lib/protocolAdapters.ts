export type ProtocolMode = "full" | "core" | "degraded" | "emergency";
export type RailTier = "core" | "full";
export type { SignerMode } from "./privacyRails/ika";

export interface RailStatus {
  key: "programs_deployed" | "zk_artifacts" | "groth16" | "nullifier_registry" | "ika" | "per" | "vrf" | "private_payments" | "encrypt" | "umbra";
  name: string;
  role: string;
  healthy: boolean;
  tier: RailTier;
  requiredForFullPrivacy: boolean;
}

// Core Privacy = the four rails that are real on devnet today and produce a
// verifiable privacy property without any pre-alpha external integration:
//   1. Programs deployed (devnet IDs in Anchor.toml)
//   2. ZK artifacts (DEV/TEST wasm/zkey/vkey for 3 circuits)
//   3. On-chain Groth16 BN254 verifier (198,502 CU C2H round-trip confirmed)
//   4. NullifierRegistry (Active/Locked/Spent state machine + CPIs)
//
// Full Privacy = Core + the five pre-alpha external rails (IKA, PER, VRF,
// Private Payments, Encrypt) and the Umbra address-layer privacy rail.
export const FULL_PRIVACY_RAILS: RailStatus[] = [
  {
    key: "programs_deployed",
    name: "Programs deployed",
    role: "ShieldedPool / LendingPool / NullifierRegistry on Solana devnet",
    healthy: Boolean(process.env.NEXT_PUBLIC_PROGRAMS_DEPLOYED),
    tier: "core",
    requiredForFullPrivacy: true,
  },
  {
    key: "zk_artifacts",
    name: "ZK artifacts",
    role: "withdraw_ring / collateral_ring / repay_ring — .wasm + .zkey + _vkey.json",
    healthy: Boolean(process.env.NEXT_PUBLIC_ZK_ARTIFACTS_READY),
    tier: "core",
    requiredForFullPrivacy: true,
  },
  {
    key: "groth16",
    name: "groth16-solana verifier",
    role: "On-chain Groth16 BN254 verification confirmed on devnet (198,502 CU; DEV/TEST trusted setup)",
    healthy: true,
    tier: "core",
    requiredForFullPrivacy: true,
  },
  {
    key: "nullifier_registry",
    name: "Nullifier registry",
    role: "Active/Locked/Spent state machine + CPI from withdraw, borrow, repay",
    healthy: Boolean(process.env.NEXT_PUBLIC_PROGRAMS_DEPLOYED),
    tier: "core",
    requiredForFullPrivacy: true,
  },
  {
    key: "ika",
    name: "IKA dWallet relay",
    role: "approve_message CPI confirmed on devnet 2026-05-11; gRPC presign/sign still blocked by pre-alpha BCS schema mismatch (upstream)",
    healthy: false,
    tier: "full",
    requiredForFullPrivacy: true,
  },
  {
    key: "per",
    name: "MagicBlock PER",
    role: "Private execution lane — TEE RPC reachable, Rust macros not yet wired in shielded_pool",
    healthy: Boolean(process.env.NEXT_PUBLIC_PER_ENABLED),
    tier: "full",
    requiredForFullPrivacy: true,
  },
  {
    key: "vrf",
    name: "MagicBlock VRF",
    role: "Publicly verifiable dummy commitment entropy — interface accepts vrf_randomness_hash, SDK call not wired",
    healthy: false,
    tier: "full",
    requiredForFullPrivacy: true,
  },
  {
    key: "private_payments",
    name: "MagicBlock Private Payments",
    role: "Private repayment settlement — deposit/withdraw live on devnet; private-transfer blocked by upstream API",
    healthy: Boolean(process.env.NEXT_PUBLIC_MAGICBLOCK_PRIVATE_PAYMENTS_URL),
    tier: "full",
    requiredForFullPrivacy: true,
  },
  {
    key: "encrypt",
    name: "Encrypt FHE",
    role: "gRPC CreateInput live; on-chain decryption verify pending Encrypt threshold callback (upstream pre-alpha)",
    healthy: process.env.NEXT_PUBLIC_ENCRYPT_ENABLED === "true",
    tier: "full",
    requiredForFullPrivacy: true,
  },
  {
    key: "umbra",
    name: "Umbra SDK",
    role: "SPL/Token-2022 stealth-address output rail — funded wSOL devnet round-trip confirmed (7 tx)",
    healthy: process.env.NEXT_PUBLIC_UMBRA_ENABLED === "true" &&
      Boolean(process.env.NEXT_PUBLIC_UMBRA_PROGRAM_ID) &&
      Boolean(process.env.NEXT_PUBLIC_UMBRA_INDEXER_URL),
    tier: "full",
    requiredForFullPrivacy: true,
  },
];

export function coreRails(rails: RailStatus[] = FULL_PRIVACY_RAILS): RailStatus[] {
  return rails.filter((r) => r.tier === "core");
}

export function fullPrivacyOnlyRails(rails: RailStatus[] = FULL_PRIVACY_RAILS): RailStatus[] {
  return rails.filter((r) => r.tier === "full");
}

export function coreReady(rails: RailStatus[] = FULL_PRIVACY_RAILS): boolean {
  return coreRails(rails).every((r) => r.healthy);
}

export function modeFromRails(rails: RailStatus[]): ProtocolMode {
  const allHealthy = rails.every((r) => r.healthy || !r.requiredForFullPrivacy);
  if (allHealthy) return "full";
  if (coreReady(rails)) return "core";
  return "degraded";
}

export interface ExternalReceipt {
  provider: RailStatus["key"];
  receiptHash: string;
  verifiedAtSlot?: number;
  raw?: unknown;
}

export interface PrivatePaymentAdapter {
  settleRepayment(params: {
    loanId: string;
    nullifierHash: string;
    outstandingLamports: string;
    repaymentVault: string;
  }): Promise<ExternalReceipt>;
}

export interface IkaDWalletAdapter {
  prepareFutureSignApproval(params: {
    loanId: string;
    loanPda: string;
    messageHash: string;
    userPublicKey: string;
    signatureScheme: string;
  }): Promise<ExternalReceipt>;
}

export interface EncryptHealthAdapter {
  prepareLiquidationReveal(params: {
    loanPda: string;
    ciphertextHandle: string;
    collateralValueHandle: string;
    outstandingDebtLamports: string;
    liquidationThresholdBps: string;
  }): Promise<ExternalReceipt>;
}

export class AdapterNotConfiguredError extends Error {
  constructor(adapterName: string) {
    super(`${adapterName} adapter is not configured. Wire the official SDK before enabling this rail.`);
    this.name = "AdapterNotConfiguredError";
  }
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Adapter request failed (${response.status}): ${text || response.statusText}`);
  }
  return response.json() as Promise<T>;
}

function receiptHashFromPayload(payload: unknown): string {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["receiptHash", "settlementReceiptHash", "transactionSignature", "signature"]) {
      if (typeof record[key] === "string") return record[key] as string;
    }
  }
  return "";
}

export const magicBlockPrivatePayments: PrivatePaymentAdapter = {
  async settleRepayment(params) {
    void params;
    throw new AdapterNotConfiguredError(
      "MagicBlock Private Payments repayment settlement. The public API now returns unsigned /v1/spl transactions; the frontend must sign, submit, and bind the confirmed tx signature before this adapter can return a receipt."
    );
  },
};

export const ikaDWalletPreAlpha: IkaDWalletAdapter = {
  async prepareFutureSignApproval(params) {
    const payload = await postJson<unknown>("/api/integrations/ika/future-sign", params);
    return {
      provider: "ika",
      receiptHash: receiptHashFromPayload(payload) || params.messageHash,
      raw: payload,
    };
  },
};

export const encryptPreAlpha: EncryptHealthAdapter = {
  async prepareLiquidationReveal(params) {
    const payload = await postJson<unknown>("/api/integrations/encrypt/liquidation-reveal", params);
    return {
      provider: "encrypt",
      receiptHash: receiptHashFromPayload(payload) || params.ciphertextHandle,
      raw: payload,
    };
  },
};
