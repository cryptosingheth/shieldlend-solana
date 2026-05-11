#!/usr/bin/env node

const DEFAULTS = {
  devnet: {
    programId: "DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ",
    indexer: "https://utxo-indexer.api-devnet.umbraprivacy.com",
    relayer: "https://relayer.api-devnet.umbraprivacy.com",
  },
  mainnet: {
    programId: "UMBRAD2ishebJTcgCLkTkNUx1v3GyoAgpTRPeWoLykh",
    indexer: "https://utxo-indexer.api.umbraprivacy.com",
    relayer: "https://relayer.api.umbraprivacy.com",
  },
};

async function fetchWithTimeout(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return { ok: response.ok, status: response.status, text: await response.text().catch(() => "") };
  } catch (error) {
    return { ok: false, status: 0, text: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

function env(name, fallback = "") {
  return process.env[name] || fallback;
}

async function main() {
  const sdk = await import("@umbra-privacy/sdk");
  const constants = await import("@umbra-privacy/sdk/constants");
  const pkg = await import("@umbra-privacy/sdk/package.json", { with: { type: "json" } });

  const network = env("UMBRA_NETWORK", env("NEXT_PUBLIC_UMBRA_NETWORK", "devnet"));
  const defaults = DEFAULTS[network] ?? DEFAULTS.devnet;
  const sdkConfig = constants.getNetworkConfig(network);
  const configuredProgram = env("UMBRA_PROGRAM_ID", env("NEXT_PUBLIC_UMBRA_PROGRAM_ID", defaults.programId));
  const indexer = env("UMBRA_INDEXER_URL", env("NEXT_PUBLIC_UMBRA_INDEXER_URL", defaults.indexer));
  const relayer = env("UMBRA_RELAYER_URL", env("NEXT_PUBLIC_UMBRA_RELAYER_URL", defaults.relayer));

  const report = {
    sdkPackage: "@umbra-privacy/sdk",
    sdkVersion: pkg.default.version,
    network,
    sdkProgramId: sdkConfig.programId,
    configuredProgram,
    programMatchesSdk: configuredProgram === sdkConfig.programId,
    hasClientFactory: typeof sdk.getUmbraClient === "function",
    hasWalletStandardHelper: typeof sdk.createSignerFromWalletAccount === "function",
    hasDirectDeposit: typeof sdk.getPublicBalanceToEncryptedBalanceDirectDepositorFunction === "function",
    hasDirectWithdraw: typeof sdk.getEncryptedBalanceToPublicBalanceDirectWithdrawerFunction === "function",
    hasReceiverUtxoCreator: typeof sdk.getPublicBalanceToReceiverClaimableUtxoCreatorFunction === "function",
    indexer,
    relayer,
  };

  console.log(JSON.stringify(report, null, 2));

  const indexerHealth = await fetchWithTimeout(`${indexer.replace(/\/$/, "")}/health`);
  console.log("\nindexerHealth", JSON.stringify(indexerHealth, null, 2));

  const relayerHealth = await fetchWithTimeout(`${relayer.replace(/\/$/, "")}/v1/health`);
  console.log("\nrelayerHealth", JSON.stringify(relayerHealth, null, 2));

  if (!report.programMatchesSdk) {
    process.exitCode = 1;
    console.error("\nUmbra program ID mismatch. Refusing to mark Umbra configured.");
  }
}

main().catch((error) => {
  process.exitCode = 1;
  console.error(error instanceof Error ? error.stack || error.message : error);
});
