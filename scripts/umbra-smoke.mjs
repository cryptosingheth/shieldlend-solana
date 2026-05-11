#!/usr/bin/env node

import {
  createInMemorySigner,
  getUmbraClient,
  getUserAccountQuerierFunction,
} from "@umbra-privacy/sdk";
import { getNetworkConfig } from "@umbra-privacy/sdk/constants";
import pkg from "@umbra-privacy/sdk/package.json" with { type: "json" };

const DEFAULT_DEVNET_PROGRAM_ID = "DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ";
const DEFAULT_DEVNET_INDEXER = "https://utxo-indexer.api-devnet.umbraprivacy.com";

function env(name, fallback = "") {
  return process.env[name] || fallback;
}

async function main() {
  const network = env("UMBRA_NETWORK", env("NEXT_PUBLIC_UMBRA_NETWORK", "devnet"));
  const rpcUrl = env("UMBRA_RPC_URL", env("NEXT_PUBLIC_UMBRA_RPC_URL", env("NEXT_PUBLIC_SOLANA_RPC_URL", "https://api.devnet.solana.com")));
  const rpcSubscriptionsUrl = env("UMBRA_RPC_WS_URL", env("NEXT_PUBLIC_UMBRA_RPC_WS_URL", "wss://api.devnet.solana.com"));
  const indexerApiEndpoint = env("UMBRA_INDEXER_URL", env("NEXT_PUBLIC_UMBRA_INDEXER_URL", DEFAULT_DEVNET_INDEXER));
  const configuredProgram = env("UMBRA_PROGRAM_ID", env("NEXT_PUBLIC_UMBRA_PROGRAM_ID", DEFAULT_DEVNET_PROGRAM_ID));
  const sdkProgram = getNetworkConfig(network).programId;

  if (configuredProgram !== sdkProgram) {
    throw new Error(`Umbra program ID mismatch: configured ${configuredProgram}, SDK ${network} ${sdkProgram}`);
  }

  const signer = await createInMemorySigner();
  const client = await getUmbraClient({
    signer,
    network,
    rpcUrl,
    rpcSubscriptionsUrl,
    indexerApiEndpoint,
  });

  const queryUser = getUserAccountQuerierFunction({ client });
  const userState = await queryUser(signer.address);

  const result = {
    smoke: "client-init-and-query",
    sdkPackage: "@umbra-privacy/sdk",
    sdkVersion: pkg.version,
    network,
    programId: sdkProgram,
    signer: signer.address,
    userAccountState: userState.state,
    devnetActionSubmitted: false,
    reason: "No token transfer was submitted. Real Umbra register/deposit/UTXO smoke requires a funded signer, supported SPL/Token-2022 mint, and explicit opt-in.",
  };

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  process.exitCode = 1;
  console.error(error instanceof Error ? error.stack || error.message : error);
});
