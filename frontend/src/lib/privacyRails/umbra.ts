import {
  getEncryptedBalanceToPublicBalanceDirectWithdrawerFunction,
  getPublicBalanceToEncryptedBalanceDirectDepositorFunction,
  getPublicBalanceToReceiverClaimableUtxoCreatorFunction,
  getUmbraClient,
  getUserRegistrationFunction,
  type DepositResult,
  type WithdrawResult,
} from "@umbra-privacy/sdk";
import type { IUmbraClient, IUmbraSigner } from "@umbra-privacy/sdk/interfaces";
import { getNetworkConfig, type Network } from "@umbra-privacy/sdk/constants";
import { address, type Address } from "@solana/kit";
import type { U64 } from "@umbra-privacy/sdk/types";

export const UMBRA_SDK_PACKAGE = "@umbra-privacy/sdk";
export const UMBRA_SDK_VERSION = "4.0.0";
export const UMBRA_DEVNET_PROGRAM_ID = "DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ";
export const UMBRA_MAINNET_PROGRAM_ID = "UMBRAD2ishebJTcgCLkTkNUx1v3GyoAgpTRPeWoLykh";
export const UMBRA_DEVNET_INDEXER = "https://utxo-indexer.api-devnet.umbraprivacy.com";
export const UMBRA_MAINNET_INDEXER = "https://utxo-indexer.api.umbraprivacy.com";
export const UMBRA_DEVNET_RELAYER = "https://relayer.api-devnet.umbraprivacy.com";
export const UMBRA_MAINNET_RELAYER = "https://relayer.api.umbraprivacy.com";
export const UMBRA_WS_DEVNET = "wss://api.devnet.solana.com";

export type UmbraRailState = "live" | "configured" | "blocked" | "unavailable";
export type UmbraDestinationMode = "direct_stealth_address" | "umbra";
export type UmbraAssetKind = "native-sol" | "spl" | "token-2022" | "wsol";

export interface UmbraRailConfig {
  enabled: boolean;
  network: Network;
  programId: string;
  rpcUrl: string;
  rpcSubscriptionsUrl: string;
  indexerApiEndpoint: string;
  relayerApiEndpoint: string;
  mintAddress: string;
}

export interface UmbraStatus {
  state: UmbraRailState;
  label: string;
  details: string;
  config: UmbraRailConfig;
  blockers: string[];
}

export interface UmbraRoutePlan {
  mode: UmbraDestinationMode;
  status: UmbraRailState;
  canRoute: boolean;
  title: string;
  summary: string;
  blockers: string[];
  nextStep: string;
}

export interface UmbraClientParams {
  signer: IUmbraSigner;
  config?: UmbraRailConfig;
}

export interface UmbraTransferParams {
  client: IUmbraClient;
  destinationAddress: string;
  mintAddress: string;
  amountBaseUnits: bigint;
}

export interface UmbraReceiverUtxoParams extends UmbraTransferParams {
  zkProver: unknown;
}

function requiredPublicEnv(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

function defaultProgramId(network: Network): string {
  return network === "mainnet" ? UMBRA_MAINNET_PROGRAM_ID : UMBRA_DEVNET_PROGRAM_ID;
}

function defaultIndexer(network: Network): string {
  return network === "mainnet" ? UMBRA_MAINNET_INDEXER : UMBRA_DEVNET_INDEXER;
}

function defaultRelayer(network: Network): string {
  return network === "mainnet" ? UMBRA_MAINNET_RELAYER : UMBRA_DEVNET_RELAYER;
}

function defaultRpc(network: Network): string {
  if (network === "mainnet") return "https://api.mainnet-beta.solana.com";
  if (network === "localnet") return "http://127.0.0.1:8899";
  return "https://api.devnet.solana.com";
}

function defaultWs(network: Network): string {
  if (network === "mainnet") return "wss://api.mainnet-beta.solana.com";
  if (network === "localnet") return "ws://127.0.0.1:8900";
  return UMBRA_WS_DEVNET;
}

export function getUmbraRailConfig(): UmbraRailConfig {
  const network = (requiredPublicEnv("NEXT_PUBLIC_UMBRA_NETWORK", "devnet") || "devnet") as Network;
  return {
    enabled: process.env.NEXT_PUBLIC_UMBRA_ENABLED === "true",
    network,
    programId: requiredPublicEnv("NEXT_PUBLIC_UMBRA_PROGRAM_ID", defaultProgramId(network)),
    rpcUrl: requiredPublicEnv(
      "NEXT_PUBLIC_UMBRA_RPC_URL",
      requiredPublicEnv("NEXT_PUBLIC_SOLANA_RPC_URL", defaultRpc(network))
    ),
    rpcSubscriptionsUrl: requiredPublicEnv("NEXT_PUBLIC_UMBRA_RPC_WS_URL", defaultWs(network)),
    indexerApiEndpoint: requiredPublicEnv("NEXT_PUBLIC_UMBRA_INDEXER_URL", defaultIndexer(network)),
    relayerApiEndpoint: requiredPublicEnv("NEXT_PUBLIC_UMBRA_RELAYER_URL", defaultRelayer(network)),
    mintAddress: requiredPublicEnv("NEXT_PUBLIC_UMBRA_MINT_ADDRESS"),
  };
}

export function getUmbraStatus(config = getUmbraRailConfig()): UmbraStatus {
  const blockers: string[] = [];
  let sdkProgramId = "";

  try {
    sdkProgramId = getNetworkConfig(config.network).programId;
  } catch (error) {
    blockers.push(error instanceof Error ? error.message : "Umbra network config could not be loaded.");
  }

  if (!config.enabled) blockers.push("NEXT_PUBLIC_UMBRA_ENABLED is not true.");
  if (!config.rpcUrl) blockers.push("NEXT_PUBLIC_UMBRA_RPC_URL or NEXT_PUBLIC_SOLANA_RPC_URL is required.");
  if (!config.rpcSubscriptionsUrl) blockers.push("NEXT_PUBLIC_UMBRA_RPC_WS_URL is required.");
  if (!config.indexerApiEndpoint) blockers.push("NEXT_PUBLIC_UMBRA_INDEXER_URL is required for mixer/UTXO scanning.");
  if (sdkProgramId && config.programId !== sdkProgramId) {
    blockers.push(`Configured Umbra program ${config.programId} does not match SDK ${config.network} program ${sdkProgramId}.`);
  }

  if (blockers.length > 0) {
    return {
      state: config.enabled ? "blocked" : "unavailable",
      label: config.enabled ? "Blocked" : "Unavailable",
      details: blockers[0],
      config,
      blockers,
    };
  }

  return {
    state: "configured",
    label: "Configured",
    details: `SDK ${UMBRA_SDK_VERSION} resolves ${config.network} program ${config.programId}. Live action still requires a wallet, funded token account, and supported mint.`,
    config,
    blockers: [],
  };
}

export function planUmbraDestinationRoute(params: {
  mode: UmbraDestinationMode;
  assetKind: UmbraAssetKind;
  config?: UmbraRailConfig;
}): UmbraRoutePlan {
  if (params.mode === "direct_stealth_address") {
    return {
      mode: params.mode,
      status: "configured",
      canRoute: true,
      title: "Direct stealth_address field",
      summary: "Preserves the C2H withdraw shape by writing a recipient Pubkey into WithdrawArgs.stealth_address.",
      blockers: [],
      nextStep: "Use only as a lower-privacy fallback; it does not use the Umbra mixer or encrypted balance account.",
    };
  }

  const status = getUmbraStatus(params.config);
  const blockers = [...status.blockers];
  if (params.assetKind === "native-sol") {
    blockers.push("Umbra SDK documentation supports SPL and Token-2022 balances; native SOL must be wrapped or represented as an SPL rail before routing.");
  }
  if (!params.config?.mintAddress && !getUmbraRailConfig().mintAddress) {
    blockers.push("NEXT_PUBLIC_UMBRA_MINT_ADDRESS must be set to the supported SPL/Token-2022 mint used for Umbra routing.");
  }

  return {
    mode: params.mode,
    status: blockers.length > 0 ? "blocked" : status.state,
    canRoute: blockers.length === 0 && status.state !== "unavailable",
    title: "Umbra SDK rail",
    summary: "Uses the official Umbra SDK for SPL/Token-2022 encrypted balances or receiver-claimable UTXOs.",
    blockers,
    nextStep: blockers.length
      ? blockers[0]
      : "Register the receiver, then use SDK deposit/UTXO functions for the selected supported mint.",
  };
}

export async function createUmbraClient(params: UmbraClientParams): Promise<IUmbraClient> {
  const config = params.config ?? getUmbraRailConfig();
  const status = getUmbraStatus(config);
  if (status.blockers.length > 0) {
    throw new Error(`Umbra is not configured: ${status.blockers.join(" ")}`);
  }

  return getUmbraClient({
    signer: params.signer,
    network: config.network,
    rpcUrl: config.rpcUrl,
    rpcSubscriptionsUrl: config.rpcSubscriptionsUrl,
    indexerApiEndpoint: config.indexerApiEndpoint,
  });
}

export async function registerUmbraUser(client: IUmbraClient): Promise<string[]> {
  const register = getUserRegistrationFunction({ client });
  return register({ confidential: true, anonymous: true });
}

export async function shieldPublicBalanceToUmbraEncryptedAccount(
  params: UmbraTransferParams
): Promise<DepositResult> {
  const deposit = getPublicBalanceToEncryptedBalanceDirectDepositorFunction({ client: params.client });
  return deposit(
    address(params.destinationAddress),
    address(params.mintAddress),
    params.amountBaseUnits as U64
  );
}

export async function withdrawUmbraEncryptedBalanceToPublicAccount(
  params: UmbraTransferParams
): Promise<WithdrawResult> {
  const withdraw = getEncryptedBalanceToPublicBalanceDirectWithdrawerFunction({ client: params.client });
  return withdraw(
    address(params.destinationAddress),
    address(params.mintAddress),
    params.amountBaseUnits as U64
  );
}

export async function createUmbraReceiverClaimableUtxo(params: UmbraReceiverUtxoParams): Promise<unknown> {
  const createUtxo = getPublicBalanceToReceiverClaimableUtxoCreatorFunction(
    { client: params.client },
    { zkProver: params.zkProver as never }
  );
  return createUtxo({
    destinationAddress: address(params.destinationAddress) as Address,
    mint: address(params.mintAddress) as Address,
    amount: params.amountBaseUnits as U64,
  });
}
