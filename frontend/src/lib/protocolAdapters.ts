export type ProtocolMode = "full" | "degraded" | "emergency";

export interface RailStatus {
  key: "programs_deployed" | "zk_artifacts" | "groth16" | "ika" | "per" | "vrf" | "private_payments" | "encrypt" | "umbra";
  name: string;
  role: string;
  healthy: boolean;
  requiredForFullPrivacy: boolean;
}

export const FULL_PRIVACY_RAILS: RailStatus[] = [
  {
    key: "programs_deployed",
    name: "Programs deployed",
    role: "ShieldedPool / LendingPool / NullifierRegistry on devnet",
    healthy: Boolean(process.env.NEXT_PUBLIC_PROGRAMS_DEPLOYED),
    requiredForFullPrivacy: true,
  },
  {
    key: "zk_artifacts",
    name: "ZK artifacts",
    role: "withdraw_ring / collateral_ring / repay_ring — .wasm + .zkey + _vkey.json",
    healthy: Boolean(process.env.NEXT_PUBLIC_ZK_ARTIFACTS_READY),
    requiredForFullPrivacy: true,
  },
  {
    key: "groth16",
    name: "groth16-solana verifier",
    role: "On-chain Groth16 proof verification (BN254 syscalls)",
    healthy: false,
    requiredForFullPrivacy: true,
  },
  {
    key: "ika",
    name: "IKA dWallet relay",
    role: "Relay authorization — prevents user wallet from being on-chain signer",
    healthy: process.env.NEXT_PUBLIC_IKA_ENABLED === "true",
    requiredForFullPrivacy: true,
  },
  {
    key: "per",
    name: "MagicBlock PER",
    role: "Private execution lane — deposit batching and exit batching inside TDX enclave",
    // TEE RPC is reachable (devnet-tee.magicblock.app HTTP 200 confirmed).
    // Attestation: challenge-encoding mismatch vs SDK 0.8.8 (minor TEE API delta).
    // Rust macros (#[ephemeral], #[delegate], #[commit]) blocked on Anchor 0.32.1.
    // Set NEXT_PUBLIC_PER_ENABLED=true only after Anchor upgrade + macro wiring.
    healthy: Boolean(process.env.NEXT_PUBLIC_PER_ENABLED),
    requiredForFullPrivacy: true,
  },
  {
    key: "vrf",
    name: "MagicBlock VRF",
    role: "Publicly verifiable dummy commitment entropy",
    healthy: false,
    requiredForFullPrivacy: true,
  },
  {
    key: "private_payments",
    name: "MagicBlock Private Payments",
    role: "Private repayment settlement receipts",
    healthy: Boolean(process.env.NEXT_PUBLIC_MAGICBLOCK_PRIVATE_PAYMENTS_URL),
    requiredForFullPrivacy: true,
  },
  {
    key: "encrypt",
    name: "Encrypt FHE",
    role: "Encrypted oracle health-factor computation and liquidation reveal",
    healthy: process.env.NEXT_PUBLIC_ENCRYPT_ENABLED === "true",
    requiredForFullPrivacy: true,
  },
  {
    key: "umbra",
    name: "Umbra SDK",
    role: "One-time stealth addresses for withdrawal and disbursement destinations",
    healthy: Boolean(process.env.NEXT_PUBLIC_UMBRA_ENABLED),
    requiredForFullPrivacy: false,
  },
];

export function modeFromRails(rails: RailStatus[]): ProtocolMode {
  if (rails.some((rail) => !rail.healthy && rail.requiredForFullPrivacy)) return "degraded";
  return "full";
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
    // Delegated to the typed adapter in privacyRails/magicblock.ts.
    // Full Private Payments surface (deposit, transfer, withdraw, balance) lives there.
    const baseUrl = process.env.NEXT_PUBLIC_MAGICBLOCK_PRIVATE_PAYMENTS_URL;
    if (!baseUrl) throw new AdapterNotConfiguredError("MagicBlock Private Payments");
    const payload = await postJson<unknown>(`${baseUrl.replace(/\/$/, "")}/repayments/settle`, params);
    const receiptHash = receiptHashFromPayload(payload);
    if (!receiptHash) {
      throw new Error("MagicBlock Private Payments response did not include a settlement receipt hash.");
    }
    return {
      provider: "private_payments",
      receiptHash,
      raw: payload,
    };
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
