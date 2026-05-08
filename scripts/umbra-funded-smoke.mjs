#!/usr/bin/env node

import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { promisify } from "node:util";
import {
  createSignerFromPrivateKeyBytes,
  getEncryptedBalanceQuerierFunction,
  getEncryptedBalanceToPublicBalanceDirectWithdrawerFunction,
  getPublicBalanceToEncryptedBalanceDirectDepositorFunction,
  getUmbraClient,
  getUserAccountQuerierFunction,
  getUserRegistrationFunction,
} from "@umbra-privacy/sdk";
import { getNetworkConfig } from "@umbra-privacy/sdk/constants";
import pkg from "@umbra-privacy/sdk/package.json" with { type: "json" };
import { address } from "@solana/kit";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

const execFileAsync = promisify(execFile);

const WSOL_MINT = "So11111111111111111111111111111111111111112";
const DEFAULT_DEVNET_INDEXER = "https://utxo-indexer.api-devnet.umbraprivacy.com";
const DEFAULT_DEVNET_RELAYER = "https://relayer.api-devnet.umbraprivacy.com";
const DEFAULT_DEVNET_RPC = "https://api.devnet.solana.com";
const DEFAULT_DEVNET_WS = "wss://api.devnet.solana.com";
const DEFAULT_AMOUNT_BASE_UNITS = 1_000_000n;
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

function env(name, fallback = "") {
  return process.env[name] || fallback;
}

function explorer(signature) {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

function asUiSol(baseUnits) {
  const whole = baseUnits / 1_000_000_000n;
  const fraction = (baseUnits % 1_000_000_000n).toString().padStart(9, "0").replace(/0+$/, "");
  return fraction ? `${whole.toString()}.${fraction}` : whole.toString();
}

function readKeypairBytes(path) {
  if (!existsSync(path)) throw new Error(`Keypair file not found: ${path}`);
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(parsed) || parsed.length !== 64) {
    throw new Error(`Expected Solana CLI 64-byte keypair array at ${path}`);
  }
  return new Uint8Array(parsed);
}

function collectSignatures(result) {
  return [
    result?.queueSignature,
    result?.callbackSignature,
    result?.rentClaimSignature,
  ].filter((value) => typeof value === "string" && value.length > 0);
}

async function runCli(command, args) {
  const { stdout, stderr } = await execFileAsync(command, args, { maxBuffer: 1024 * 1024 });
  return { stdout: stdout.trim(), stderr: stderr.trim() };
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function stringifyReport(value) {
  return JSON.stringify(
    value,
    (_key, item) => (typeof item === "bigint" ? item.toString() : item),
    2
  );
}

function extractCliSignatures(stdout) {
  const parsed = safeJson(stdout);
  if (!parsed || typeof parsed !== "object") return [];
  return [
    parsed.signature,
    parsed.transactionSignature,
    parsed.txSignature,
    parsed.commandOutput?.signature,
  ].filter((value) => typeof value === "string" && value.length > 0);
}

async function getParsedTokenBalance(connection, owner, mint) {
  const response = await connection.getParsedTokenAccountsByOwner(owner, { mint }, "confirmed");
  let total = 0n;
  const accounts = [];
  for (const item of response.value) {
    const info = item.account.data.parsed.info;
    const amount = BigInt(info.tokenAmount.amount);
    total += amount;
    accounts.push({
      pubkey: item.pubkey.toBase58(),
      amount: amount.toString(),
      decimals: info.tokenAmount.decimals,
      uiAmountString: info.tokenAmount.uiAmountString,
    });
  }
  return { total, accounts };
}

function getAssociatedTokenAddressSync(mint, owner) {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )[0];
}

function createAssociatedTokenAccountInstruction(payer, ata, owner, mint) {
  return {
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    data: Buffer.alloc(0),
  };
}

function createSyncNativeInstruction(account) {
  return {
    keys: [{ pubkey: account, isSigner: false, isWritable: true }],
    programId: TOKEN_PROGRAM_ID,
    data: Buffer.from([17]),
  };
}

async function ensureWsol(connection, web3Keypair, owner, mint, amountBaseUnits) {
  const before = await getParsedTokenBalance(connection, owner, mint);
  if (before.total >= amountBaseUnits) {
    return { action: "existing-wsol-balance", before, after: before, signatures: [] };
  }

  const amountToWrap = amountBaseUnits - before.total;
  const ata = getAssociatedTokenAddressSync(mint, owner);
  const transaction = new Transaction();
  const ataInfo = await connection.getAccountInfo(ata, "confirmed");
  if (!ataInfo) {
    transaction.add(createAssociatedTokenAccountInstruction(owner, ata, owner, mint));
  }
  transaction.add(
    SystemProgram.transfer({
      fromPubkey: owner,
      toPubkey: ata,
      lamports: Number(amountToWrap),
    }),
    createSyncNativeInstruction(ata)
  );
  const signature = await sendAndConfirmTransaction(connection, transaction, [web3Keypair], {
    commitment: "confirmed",
  });
  const after = await getParsedTokenBalance(connection, owner, mint);
  return {
    action: "wrapped-native-sol-to-existing-wsol-ata",
    before,
    after,
    ata: ata.toBase58(),
    signatures: [signature],
  };
}

async function ensureSplAccount(connection, owner, mint, network) {
  const before = await getParsedTokenBalance(connection, owner, mint);
  if (before.accounts.length > 0) {
    return { action: "existing-token-account", before, after: before, signatures: [] };
  }

  const result = await runCli("spl-token", [
    "create-account",
    mint.toBase58(),
    "--url",
    network,
    "--output",
    "json",
  ]);
  const after = await getParsedTokenBalance(connection, owner, mint);
  return {
    action: "created-token-account",
    before,
    after,
    signatures: extractCliSignatures(result.stdout),
    cliOutput: safeJson(result.stdout) ?? result.stdout,
    cliStderr: result.stderr,
  };
}

async function main() {
  const network = env("UMBRA_NETWORK", env("NEXT_PUBLIC_UMBRA_NETWORK", "devnet"));
  if (network !== "devnet" && env("UMBRA_ALLOW_MAINNET_FUNDED") !== "true") {
    throw new Error("Funded Umbra smoke refuses non-devnet networks unless UMBRA_ALLOW_MAINNET_FUNDED=true.");
  }

  const keypairPath = env("UMBRA_FUNDED_KEYPAIR", env("SOLANA_KEYPAIR", `${homedir()}/.config/solana/id.json`));
  const rpcUrl = env("UMBRA_RPC_URL", env("NEXT_PUBLIC_UMBRA_RPC_URL", env("NEXT_PUBLIC_SOLANA_RPC_URL", DEFAULT_DEVNET_RPC)));
  const rpcSubscriptionsUrl = env("UMBRA_RPC_WS_URL", env("NEXT_PUBLIC_UMBRA_RPC_WS_URL", DEFAULT_DEVNET_WS));
  const indexerApiEndpoint = env("UMBRA_INDEXER_URL", env("NEXT_PUBLIC_UMBRA_INDEXER_URL", DEFAULT_DEVNET_INDEXER));
  const relayerApiEndpoint = env("UMBRA_RELAYER_URL", env("NEXT_PUBLIC_UMBRA_RELAYER_URL", DEFAULT_DEVNET_RELAYER));
  const mintAddress = env("UMBRA_FUNDED_MINT", env("UMBRA_MINT_ADDRESS", env("NEXT_PUBLIC_UMBRA_MINT_ADDRESS", WSOL_MINT)));
  const amountBaseUnits = BigInt(env("UMBRA_FUNDED_AMOUNT_BASE_UNITS", DEFAULT_AMOUNT_BASE_UNITS.toString()));
  const assetKind = env("UMBRA_FUNDED_ASSET_KIND", mintAddress === WSOL_MINT ? "wsol" : "spl");
  const withdrawAfterDeposit = env("UMBRA_FUNDED_WITHDRAW", "true") !== "false";
  const sdkProgram = getNetworkConfig(network).programId;

  const keypairBytes = readKeypairBytes(keypairPath);
  const web3Keypair = Keypair.fromSecretKey(keypairBytes);
  const signer = await createSignerFromPrivateKeyBytes(keypairBytes);
  const owner = new PublicKey(signer.address);
  const mint = new PublicKey(mintAddress);
  const connection = new Connection(rpcUrl, "confirmed");
  const walletLamports = await connection.getBalance(owner, "confirmed");

  const report = {
    smoke: "umbra-funded",
    sdkPackage: "@umbra-privacy/sdk",
    sdkVersion: pkg.version,
    network,
    rpcUrl,
    indexerApiEndpoint,
    relayerApiEndpoint,
    programId: sdkProgram,
    wallet: signer.address,
    walletLamports: walletLamports.toString(),
    assetKind,
    mint: mintAddress,
    amountBaseUnits: amountBaseUnits.toString(),
    tokenPreparation: null,
    registrationSignatures: [],
    depositResult: null,
    withdrawResult: null,
    encryptedBalanceAfterDeposit: null,
    encryptedBalanceAfterWithdraw: null,
    txSignatures: [],
    txExplorerUrls: [],
    fundedFlowLive: false,
    nativeSolRoute: "Current ShieldLend C2H withdraw remains native SOL direct stealth_address; Umbra routing requires this wSOL/SPL token leg before it can be claimed.",
    mixerUtxoStatus: "Not attempted. Receiver-claimable UTXO creation/claim requires a compatible @umbra-privacy/web-zk-prover; this branch keeps SDK 4.0.0 and does not force-install the older peer.",
    blocker: "",
  };

  if (walletLamports <= 0) {
    throw new Error(`Devnet wallet ${signer.address} has zero SOL; fund it before running a funded smoke.`);
  }

  report.tokenPreparation = assetKind === "wsol"
    ? await ensureWsol(connection, web3Keypair, owner, mint, amountBaseUnits)
    : await ensureSplAccount(connection, owner, mint, network);

  const tokenBalance = await getParsedTokenBalance(connection, owner, mint);
  if (tokenBalance.total < amountBaseUnits) {
    throw new Error(`Token balance for mint ${mintAddress} is ${tokenBalance.total.toString()}, below required ${amountBaseUnits.toString()}.`);
  }

  const client = await getUmbraClient({
    signer,
    network,
    rpcUrl,
    rpcSubscriptionsUrl,
    indexerApiEndpoint,
  });

  const queryUser = getUserAccountQuerierFunction({ client });
  report.userAccountBefore = await queryUser(address(signer.address));
  if (report.userAccountBefore.state !== "exists" || !report.userAccountBefore.data?.isUserAccountX25519KeyRegistered) {
    const register = getUserRegistrationFunction({ client });
    report.registrationSignatures = await register({ confidential: true, anonymous: false });
  }
  report.userAccountAfter = await queryUser(address(signer.address));

  const deposit = getPublicBalanceToEncryptedBalanceDirectDepositorFunction({ client });
  report.depositResult = await deposit(address(signer.address), address(mintAddress), amountBaseUnits);

  const queryEncryptedBalance = getEncryptedBalanceQuerierFunction({ client });
  const encryptedBalancesAfterDeposit = await queryEncryptedBalance([address(mintAddress)]);
  report.encryptedBalanceAfterDeposit = encryptedBalancesAfterDeposit.get(address(mintAddress)) ?? null;

  if (withdrawAfterDeposit) {
    const available = report.encryptedBalanceAfterDeposit?.state === "shared"
      ? BigInt(report.encryptedBalanceAfterDeposit.balance)
      : 0n;
    if (available > 0n) {
      const withdrawAmount = available < amountBaseUnits ? available : amountBaseUnits;
      const withdraw = getEncryptedBalanceToPublicBalanceDirectWithdrawerFunction({ client });
      report.withdrawResult = await withdraw(address(signer.address), address(mintAddress), withdrawAmount);
      const encryptedBalancesAfterWithdraw = await queryEncryptedBalance([address(mintAddress)]);
      report.encryptedBalanceAfterWithdraw = encryptedBalancesAfterWithdraw.get(address(mintAddress)) ?? null;
    } else {
      report.blocker = `Deposit submitted but encrypted balance is not locally readable as shared state: ${stringifyReport(report.encryptedBalanceAfterDeposit)}`;
    }
  }

  report.txSignatures = [
    ...(report.tokenPreparation?.signatures ?? []),
    ...report.registrationSignatures,
    ...collectSignatures(report.depositResult),
    ...collectSignatures(report.withdrawResult),
  ];
  report.txExplorerUrls = report.txSignatures.map(explorer);
  report.fundedFlowLive = Boolean(report.depositResult?.queueSignature) &&
    (!withdrawAfterDeposit || Boolean(report.withdrawResult?.queueSignature));

  console.log(stringifyReport(report));
  if (!report.fundedFlowLive) process.exitCode = 1;
}

main().catch((error) => {
  process.exitCode = 1;
  console.error(error instanceof Error ? error.stack || error.message : error);
});
