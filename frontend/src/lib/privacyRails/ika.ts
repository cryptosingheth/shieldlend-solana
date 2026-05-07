// IKA dWallet pre-alpha rail adapter.
// Source: https://solana-pre-alpha.ika.xyz/
//
// Pre-alpha status (verified 2026-05-08):
//   @ika.xyz/sdk exports IkaClient + coordinatorTransactions (DKG, sign, FutureSign) for 4 curves.
//   Endpoint: https://pre-alpha-dev-1.ika.ika-network.net:443
//
// Blockers for ShieldLend Solana relay signing:
//   1. Single mock signer — pre-alpha does NOT use real distributed MPC.
//   2. ika-dwallet-anchor Rust CPI crate absent from shielded_pool and lending_pool Cargo.toml.
//      Solana programs cannot accept IKA-authorized instructions until CPI is wired.
//   3. TypeScript SDK manages Sui-side dWallet lifecycle; Solana tx relay is a Rust-side concern.

export type SignerMode = "direct_wallet" | "ika_dwallet_mock";

export interface IkaCapabilityReport {
  sdkPackage: "@ika.xyz/sdk";
  sdkAvailable: boolean;
  endpointConfigured: boolean;
  grpcUrl: string;
  programId: string;
  signerMode: "ika_dwallet_mock";
  solanaCpiWired: false;
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
    "ika-dwallet-anchor Rust crate not present in shielded_pool or lending_pool Cargo.toml — " +
      "Solana tx relay requires on-chain CPI integration that is not yet wired.",
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
    solanaCpiWired: false,
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
