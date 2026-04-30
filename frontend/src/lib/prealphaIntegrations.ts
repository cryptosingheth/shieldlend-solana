export const IKA_PRE_ALPHA = {
  grpcUrl: process.env.IKA_GRPC_URL ?? "https://pre-alpha-dev-1.ika.ika-network.net:443",
  programId: process.env.IKA_PROGRAM_ID ?? "87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY",
  docsUrl: "https://solana-pre-alpha.ika.xyz/",
} as const;

export const ENCRYPT_PRE_ALPHA = {
  grpcUrl: process.env.ENCRYPT_GRPC_URL ?? "https://pre-alpha-dev-1.encrypt.ika-network.net:443",
  programId: process.env.ENCRYPT_PROGRAM_ID ?? "4ebfzWdKnrnGseuQpezXdG8yCdHqwQ1SSBHD3bWArND8",
  docsUrl: "https://docs.encrypt.xyz/getting-started/installation",
} as const;

export interface SdkLoadStatus {
  configured: boolean;
  sdkAvailable: boolean;
  packageName: string;
  programId: string;
  grpcUrl: string;
  docsUrl: string;
  note: string;
}

async function canLoadPackage(packageName: string): Promise<boolean> {
  try {
    await import(/* webpackIgnore: true */ packageName);
    return true;
  } catch {
    return false;
  }
}

export async function getIkaPreAlphaStatus(): Promise<SdkLoadStatus> {
  return {
    configured: Boolean(IKA_PRE_ALPHA.grpcUrl && IKA_PRE_ALPHA.programId),
    sdkAvailable: await canLoadPackage("@ika.xyz/sdk"),
    packageName: "@ika.xyz/sdk",
    programId: IKA_PRE_ALPHA.programId,
    grpcUrl: IKA_PRE_ALPHA.grpcUrl,
    docsUrl: IKA_PRE_ALPHA.docsUrl,
    note: "IKA Solana pre-alpha is wired as a development dWallet/FutureSign rail. Treat current security as pre-alpha until IKA mainnet/alpha docs change the guarantee.",
  };
}

export async function getEncryptPreAlphaStatus(): Promise<SdkLoadStatus> {
  return {
    configured: Boolean(ENCRYPT_PRE_ALPHA.grpcUrl && ENCRYPT_PRE_ALPHA.programId),
    sdkAvailable: await canLoadPackage("@encrypt.xyz/pre-alpha-solana-client"),
    packageName: "@encrypt.xyz/pre-alpha-solana-client",
    programId: ENCRYPT_PRE_ALPHA.programId,
    grpcUrl: ENCRYPT_PRE_ALPHA.grpcUrl,
    docsUrl: ENCRYPT_PRE_ALPHA.docsUrl,
    note: "Encrypt pre-alpha is wired as a development confidential-compute rail. Do not submit sensitive data while the official docs describe pre-alpha plaintext behavior.",
  };
}

export interface IkaFutureSignApprovalContext {
  loanId: string;
  loanPda: string;
  messageHash: string;
  userPublicKey: string;
  signatureScheme: string;
}

export function buildIkaFutureSignApprovalContext(
  context: IkaFutureSignApprovalContext
): IkaFutureSignApprovalContext & { programId: string; grpcUrl: string; instruction: "approve_message" } {
  return {
    ...context,
    programId: IKA_PRE_ALPHA.programId,
    grpcUrl: IKA_PRE_ALPHA.grpcUrl,
    instruction: "approve_message",
  };
}

export interface EncryptLiquidationRevealContext {
  loanPda: string;
  ciphertextHandle: string;
  collateralValueHandle: string;
  outstandingDebtLamports: string;
  liquidationThresholdBps: string;
}

export function buildEncryptLiquidationRevealContext(
  context: EncryptLiquidationRevealContext
): EncryptLiquidationRevealContext & { programId: string; grpcUrl: string; graph: "shieldlend_liquidation_health_v1" } {
  return {
    ...context,
    programId: ENCRYPT_PRE_ALPHA.programId,
    grpcUrl: ENCRYPT_PRE_ALPHA.grpcUrl,
    graph: "shieldlend_liquidation_health_v1",
  };
}
