// IKA dWallet pre-alpha rail adapter.
// Source: https://solana-pre-alpha.ika.xyz/
//
// Pre-alpha status (verified 2026-05-09):
//   @ika.xyz/sdk exports IkaClient + coordinatorTransactions (DKG, sign, FutureSign) for 4 curves.
//   ika-dwallet-anchor source provides approve_message CPI ABI for Solana programs.
//   Endpoint: https://pre-alpha-dev-1.ika.ika-network.net:443
//
// Current ShieldLend status:
//   1. Single mock signer — pre-alpha does NOT use real distributed MPC.
//   2. lending_pool has compile-level approve_message CPI scaffolding.
//   3. Real devnet IKA DKG + on-chain dWallet creation + authority transfer to the
//      LendingPool CPI PDA are confirmed by scripts/ika-anchor-approval-smoke.mjs.
//   4. The live approval still fails before CPI because the deployed devnet
//      lending_pool binary predates approve_ika_borrow_message.

export type SignerMode = "direct_wallet" | "ika_dwallet_mock";

export interface IkaCapabilityReport {
  sdkPackage: "@ika.xyz/sdk";
  sdkAvailable: boolean;
  endpointConfigured: boolean;
  grpcUrl: string;
  programId: string;
  signerMode: "ika_dwallet_mock";
  solanaCpiWired: true;
  liveApprovalTxConfirmed: false;
  blockers: string[];
}

export interface IkaSignerContext {
  mode: SignerMode;
  grpcUrl: string;
  programId: string;
  disclosure: string;
}

const IKA_GRPC_URL =
  process.env.IKA_GRPC_URL ?? "https://pre-alpha-dev-1.ika.ika-network.net:443";

const IKA_PROGRAM_ID =
  process.env.IKA_PROGRAM_ID ?? "87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY";

export const MOCK_SIGNER_DISCLOSURE =
  "IKA Solana pre-alpha uses a single mock signer, not real distributed MPC. " +
  "The no-single-party-can-sign guarantee is not yet delivered. " +
  "Source: https://solana-pre-alpha.ika.xyz/";

export const IKA_CPI_DISCLOSURE =
  "ShieldLend lending_pool is compile-wired to IKA approve_message via the official CPI authority seed. " +
  "Real IKA devnet dWallet setup and CPI-authority transfer are confirmed, but the deployed devnet lending_pool binary does not yet include approve_ika_borrow_message.";

export const DIRECT_WALLET_DISCLOSURE =
  "Direct wallet mode: user Phantom wallet is the on-chain signer. " +
  "Depositor wallet is not hidden. Reduced privacy — IKA dWallet relay not active.";

async function probeSdkImport(): Promise<boolean> {
  try {
    await import(/* webpackIgnore: true */ "@ika.xyz/sdk");
    return true;
  } catch {
    return false;
  }
}

export async function probeIkaCapabilities(): Promise<IkaCapabilityReport> {
  const sdkAvailable = await probeSdkImport();
  const endpointConfigured = Boolean(IKA_GRPC_URL && IKA_PROGRAM_ID);

  const blockers: string[] = [
    "No real devnet IKA approve_message CPI transaction has landed from ShieldLend. " +
      "Real pre-alpha DKG, on-chain dWallet creation, and authority transfer to the lending_pool CPI authority PDA succeeded, " +
      "but the deployed devnet lending_pool program rejected approve_ika_borrow_message with Anchor InstructionFallbackNotFound. Redeploy is required.",
    MOCK_SIGNER_DISCLOSURE,
  ];
  if (!sdkAvailable) {
    blockers.unshift(
      "@ika.xyz/sdk not loadable — run `cd frontend && npm install` to install the pre-alpha SDK."
    );
  }

  return {
    sdkPackage: "@ika.xyz/sdk",
    sdkAvailable,
    endpointConfigured,
    grpcUrl: IKA_GRPC_URL,
    programId: IKA_PROGRAM_ID,
    signerMode: "ika_dwallet_mock",
    solanaCpiWired: true,
    liveApprovalTxConfirmed: false,
    blockers,
  };
}

export function buildSignerContext(mode: SignerMode): IkaSignerContext {
  return {
    mode,
    grpcUrl: IKA_GRPC_URL,
    programId: IKA_PROGRAM_ID,
    disclosure:
      mode === "direct_wallet" ? DIRECT_WALLET_DISCLOSURE : MOCK_SIGNER_DISCLOSURE,
  };
}
