#!/usr/bin/env node
/**
 * MagicBlock Private Payments live SPL flow.
 *
 * Dry run:
 *   node scripts/magicblock-private-payments-live.mjs --dry-run
 *
 * Live:
 *   node scripts/magicblock-private-payments-live.mjs --live
 *
 * The live path signs locally with the Solana CLI devnet wallet and submits
 * only unsigned transactions returned by the public MagicBlock API.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import process from "node:process";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

const PRIVATE_PAYMENTS_API =
  process.env.MAGICBLOCK_PRIVATE_PAYMENTS_API_URL ||
  process.env.NEXT_PUBLIC_MAGICBLOCK_PRIVATE_PAYMENTS_URL ||
  "https://payments.magicblock.app";

const CLUSTER = process.env.MAGICBLOCK_PRIVATE_PAYMENTS_CLUSTER || "devnet";
const WSOL_MINT = "So11111111111111111111111111111111111111112";
const DEVNET_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const DEFAULT_AMOUNT_BASE_UNITS = "1000000";
const DEFAULT_BASE_RPC = "https://api.devnet.solana.com";
const DEFAULT_EPHEMERAL_RPC = "https://devnet-router.magicblock.app";
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

const args = new Set(process.argv.slice(2));
const mode = args.has("--live") ? "live" : "dry-run";
let activeReport = null;
if (!args.has("--live") && !args.has("--dry-run")) {
  console.error("Usage: node scripts/magicblock-private-payments-live.mjs --dry-run|--live");
  process.exit(1);
}
if (args.has("--live") && args.has("--dry-run")) {
  console.error("Choose exactly one mode: --dry-run or --live");
  process.exit(1);
}

function argValue(name, fallback = "") {
  const prefix = `${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function env(name, fallback = "") {
  return process.env[name] || fallback;
}

function normalizeBase(url) {
  return url.replace(/\/$/, "");
}

function walletPath() {
  return env(
    "MAGICBLOCK_PRIVATE_PAYMENTS_KEYPAIR",
    env("SOLANA_WALLET_PATH", env("SOLANA_KEYPAIR", `${homedir()}/.config/solana/id.json`))
  );
}

function readKeypair(path) {
  if (!existsSync(path)) throw new Error(`Keypair file not found: ${path}`);
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(parsed) || parsed.length !== 64) {
    throw new Error(`Expected Solana CLI 64-byte keypair array at ${path}`);
  }
  return Keypair.fromSecretKey(new Uint8Array(parsed));
}

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(bytes) {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) + BigInt(byte);
  let encoded = "";
  while (value > 0n) {
    encoded = BASE58_ALPHABET[Number(value % 58n)] + encoded;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte === 0) encoded = "1" + encoded;
    else break;
  }
  return encoded || "1";
}

function toBase64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

function appendQuery(path, params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

function redactedHeaders(headers) {
  const out = { ...headers };
  if (out.authorization) out.authorization = "Bearer <redacted>";
  return out;
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

function explorer(signature) {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
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

async function tokenBalance(connection, owner, mint) {
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

async function ensureWsol(connection, wallet, mint, amountBaseUnits) {
  const before = await tokenBalance(connection, wallet.publicKey, mint);
  if (before.total >= amountBaseUnits) {
    return { action: "existing-wsol-balance", before, after: before, signatures: [] };
  }

  const ata = getAssociatedTokenAddressSync(mint, wallet.publicKey);
  const amountToWrap = amountBaseUnits - before.total;
  const solBalance = BigInt(await connection.getBalance(wallet.publicKey, "confirmed"));
  if (solBalance <= amountToWrap + 10_000_000n) {
    throw new Error(
      `Insufficient devnet SOL to wrap ${amountToWrap.toString()} lamports into wSOL and keep fees.`
    );
  }

  const tx = new Transaction();
  const ataInfo = await connection.getAccountInfo(ata, "confirmed");
  if (!ataInfo) {
    tx.add(createAssociatedTokenAccountInstruction(wallet.publicKey, ata, wallet.publicKey, mint));
  }
  tx.add(
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: ata,
      lamports: Number(amountToWrap),
    }),
    createSyncNativeInstruction(ata)
  );
  const signature = await sendAndConfirmTransaction(connection, tx, [wallet], {
    commitment: "confirmed",
  });
  const after = await tokenBalance(connection, wallet.publicKey, mint);
  return {
    action: "wrapped-native-sol-to-wsol-ata",
    ata: ata.toBase58(),
    amountWrapped: amountToWrap.toString(),
    before,
    after,
    signatures: [signature],
  };
}

function summarizeBuild(payload) {
  if (!payload || typeof payload !== "object") return payload;
  return {
    kind: payload.kind,
    version: payload.version,
    sendTo: payload.sendTo,
    recentBlockhash: payload.recentBlockhash,
    lastValidBlockHeight: payload.lastValidBlockHeight,
    instructionCount: payload.instructionCount,
    requiredSigners: payload.requiredSigners,
    validator: payload.validator,
    transactionBase64Length:
      typeof payload.transactionBase64 === "string"
        ? payload.transactionBase64.length
        : undefined,
  };
}

async function request(report, method, path, { body, bearerToken } = {}) {
  const url = `${normalizeBase(PRIVATE_PAYMENTS_API)}${path}`;
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (bearerToken) headers.authorization = `Bearer ${bearerToken}`;

  const entry = {
    method,
    path,
    url,
    requestHeaders: redactedHeaders(headers),
    requestBody: body ?? null,
    status: null,
    ok: false,
    response: null,
    responseText: "",
  };
  report.endpointsHit.push(entry);

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    entry.status = res.status;
    entry.ok = res.ok;
    const text = await res.text();
    entry.responseText = text;
    entry.response = safeJson(text) ?? text;
    return entry;
  } catch (error) {
    entry.responseText = error instanceof Error ? error.message : String(error);
    entry.response = { error: entry.responseText };
    return entry;
  }
}

async function apiGet(report, path, opts) {
  return request(report, "GET", path, opts);
}

async function apiPost(report, path, body, opts = {}) {
  return request(report, "POST", path, { ...opts, body });
}

async function signAndSendBuild(report, connectionByTarget, wallet, label, build) {
  if (!build?.transactionBase64 || !build?.sendTo) {
    throw new Error(`${label} did not return a usable unsigned transaction.`);
  }

  const raw = Buffer.from(build.transactionBase64, "base64");
  let serialized;
  if (build.version === "v0") {
    const tx = VersionedTransaction.deserialize(raw);
    tx.sign([wallet]);
    serialized = tx.serialize();
  } else {
    const tx = Transaction.from(raw);
    tx.sign(wallet);
    serialized = tx.serialize();
  }

  const connection = connectionByTarget[build.sendTo];
  if (!connection) throw new Error(`${label} returned unsupported sendTo=${build.sendTo}`);

  const signature = await connection.sendRawTransaction(serialized, {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });
  await connection.confirmTransaction(
    {
      signature,
      blockhash: build.recentBlockhash,
      lastValidBlockHeight: build.lastValidBlockHeight,
    },
    "confirmed"
  );
  report.txSignatures.push({ label, signature, sendTo: build.sendTo, explorer: explorer(signature) });
  return signature;
}

async function main() {
  const keypairPath = walletPath();
  const wallet = readKeypair(keypairPath);
  const owner = wallet.publicKey.toBase58();
  const mintAddress = argValue(
    "--mint",
    env("MAGICBLOCK_PRIVATE_PAYMENTS_MINT", WSOL_MINT)
  );
  const recipient = argValue(
    "--recipient",
    env("MAGICBLOCK_PRIVATE_PAYMENTS_RECIPIENT", owner)
  );
  const amountBaseUnits = BigInt(
    argValue(
      "--amount-base-units",
      env("MAGICBLOCK_PRIVATE_PAYMENTS_AMOUNT_BASE_UNITS", DEFAULT_AMOUNT_BASE_UNITS)
    )
  );
  if (amountBaseUnits < 1n) throw new Error("Amount must be at least 1 base unit.");
  if (amountBaseUnits > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Amount is above JavaScript safe integer range for this API script.");
  }

  const baseRpcUrl = env("MAGICBLOCK_BASE_RPC_URL", env("NEXT_PUBLIC_SOLANA_RPC_URL", DEFAULT_BASE_RPC));
  const ephemeralRpcUrl = env(
    "MAGICBLOCK_EPHEMERAL_RPC_URL",
    env("NEXT_PUBLIC_MAGICBLOCK_ROUTER_RPC_URL", DEFAULT_EPHEMERAL_RPC)
  );
  const baseConnection = new Connection(baseRpcUrl, "confirmed");
  const ephemeralConnection = new Connection(ephemeralRpcUrl, "confirmed");
  const report = {
    script: "magicblock-private-payments-live",
    mode,
    apiBaseUrl: normalizeBase(PRIVATE_PAYMENTS_API),
    cluster: CLUSTER,
    wallet: owner,
    keypairPath,
    mint: mintAddress,
    preferredMint: mintAddress === WSOL_MINT ? "wSOL" : "custom/devnet SPL",
    wsolMint: WSOL_MINT,
    devnetUsdcMint: DEVNET_USDC_MINT,
    amountBaseUnits: amountBaseUnits.toString(),
    recipient,
    baseRpcUrl,
    ephemeralRpcUrl,
    endpointsHit: [],
    txSignatures: [],
    tokenPreparation: null,
    dryRunNotice:
      mode === "dry-run"
        ? "Unsigned transactions may be requested from the API, but no challenge, transaction, or message is signed and nothing is submitted."
        : "",
    liveStatus: {
      health: "unknown",
      challengeLogin: "not-attempted",
      mintInitialized: "unknown",
      deposit: "not-attempted",
      privateTransfer: "not-attempted",
      publicTransfer: "builder-only",
      withdraw: "not-attempted",
    },
    blocker: "",
  };
  activeReport = report;

  const health = await apiGet(report, "/health");
  report.liveStatus.health = health.ok ? "ok" : `blocked HTTP ${health.status}`;

  await apiGet(report, "/v1/mcp");

  const balancePath = appendQuery("/v1/spl/balance", {
    address: owner,
    mint: mintAddress,
    cluster: CLUSTER,
  });
  await apiGet(report, balancePath);

  const mintStatusPath = appendQuery("/v1/spl/is-mint-initialized", {
    mint: mintAddress,
    cluster: CLUSTER,
  });
  const mintStatus = await apiGet(report, mintStatusPath);
  const mintInitialized = Boolean(mintStatus.response?.initialized);
  report.liveStatus.mintInitialized = mintStatus.ok
    ? String(mintInitialized)
    : `blocked HTTP ${mintStatus.status}`;

  const challengePath = appendQuery("/v1/spl/challenge", {
    pubkey: owner,
    cluster: CLUSTER,
  });
  const challenge = await apiGet(report, challengePath);

  let bearerToken = "";
  if (mode === "live") {
    if (!challenge.ok || typeof challenge.response?.challenge !== "string") {
      throw new Error("Challenge request failed; cannot perform bearer-token login.");
    }
    const challengeBytes = new TextEncoder().encode(challenge.response.challenge);
    const signatureBytes = wallet.secretKey.slice(0, 64);
    const nacl = await import("tweetnacl");
    const detached = nacl.default.sign.detached(challengeBytes, signatureBytes);
    const loginBody = {
      pubkey: owner,
      challenge: challenge.response.challenge,
      signature: base58Encode(detached),
      cluster: CLUSTER,
    };
    let login = await apiPost(report, "/v1/spl/login", loginBody);
    if (!login.ok) {
      login = await apiPost(report, "/v1/spl/login", {
        ...loginBody,
        signature: toBase64(detached),
      });
    }
    if (!login.ok || typeof login.response?.token !== "string") {
      report.liveStatus.challengeLogin = `blocked HTTP ${login.status}`;
      throw new Error(`Login failed with HTTP ${login.status}: ${login.responseText}`);
    }
    bearerToken = login.response.token;
    login.response = { token: "<redacted>" };
    report.liveStatus.challengeLogin = "ok";
    await apiGet(
      report,
      appendQuery("/v1/spl/private-balance", {
        address: owner,
        mint: mintAddress,
        cluster: CLUSTER,
      }),
      { bearerToken }
    );
  } else {
    report.liveStatus.challengeLogin = challenge.ok
      ? "challenge-ok; login skipped in dry-run"
      : `challenge blocked HTTP ${challenge.status}`;
  }

  const depositBody = {
    owner,
    mint: mintAddress,
    amount: Number(amountBaseUnits),
    cluster: CLUSTER,
    initIfMissing: true,
    initVaultIfMissing: true,
    initAtasIfMissing: true,
    idempotent: true,
  };
  const publicTransferBody = {
    from: owner,
    to: recipient,
    mint: mintAddress,
    amount: 1,
    visibility: "public",
    fromBalance: "base",
    toBalance: "base",
    cluster: CLUSTER,
    initIfMissing: true,
    initAtasIfMissing: true,
    initVaultIfMissing: false,
    memo: "ShieldLend MagicBlock public builder check",
    legacy: true,
  };
  const privateTransferBody = {
    from: owner,
    to: recipient,
    mint: mintAddress,
    amount: Number(amountBaseUnits),
    visibility: "private",
    fromBalance: "ephemeral",
    toBalance: "ephemeral",
    cluster: CLUSTER,
    initIfMissing: true,
    initAtasIfMissing: true,
    initVaultIfMissing: false,
    memo: "ShieldLend MagicBlock private live check",
    minDelayMs: "0",
    maxDelayMs: "0",
    clientRefId: "1",
    split: 1,
    gasless: false,
    legacy: true,
  };
  const withdrawBody = {
    owner,
    mint: mintAddress,
    amount: Number(amountBaseUnits),
    cluster: CLUSTER,
    initIfMissing: true,
    initAtasIfMissing: true,
    idempotent: true,
  };

  const publicTransfer = await apiPost(report, "/v1/spl/transfer", publicTransferBody);
  publicTransfer.response = summarizeBuild(publicTransfer.response);

  const deposit = await apiPost(report, "/v1/spl/deposit", depositBody);
  const depositBuild = deposit.response;
  deposit.response = summarizeBuild(deposit.response);
  report.liveStatus.deposit = deposit.ok ? "unsigned-builder-ok" : `blocked HTTP ${deposit.status}`;

  const privateTransfer = await apiPost(
    report,
    "/v1/spl/transfer",
    privateTransferBody,
    bearerToken ? { bearerToken } : {}
  );
  const privateTransferBuild = privateTransfer.response;
  privateTransfer.response = summarizeBuild(privateTransfer.response);
  report.liveStatus.privateTransfer = privateTransfer.ok
    ? "unsigned-builder-ok"
    : `blocked HTTP ${privateTransfer.status}`;

  const withdraw = await apiPost(report, "/v1/spl/withdraw", withdrawBody);
  const withdrawBuild = withdraw.response;
  withdraw.response = summarizeBuild(withdraw.response);
  report.liveStatus.withdraw = withdraw.ok ? "unsigned-builder-ok" : `blocked HTTP ${withdraw.status}`;

  if (mode === "live") {
    const mint = new PublicKey(mintAddress);
    if (!mintInitialized) {
      const initMint = await apiPost(report, "/v1/spl/initialize-mint", {
        owner,
        mint: mintAddress,
        cluster: CLUSTER,
      });
      const initBuild = initMint.response;
      initMint.response = summarizeBuild(initMint.response);
      if (!initMint.ok) throw new Error(`initialize-mint blocked HTTP ${initMint.status}: ${initMint.responseText}`);
      await signAndSendBuild(
        report,
        { base: baseConnection, ephemeral: ephemeralConnection },
        wallet,
        "initialize-mint",
        initBuild
      );
    }

    if (mintAddress === WSOL_MINT && env("MAGICBLOCK_AUTO_WRAP_WSOL", "true") !== "false") {
      report.tokenPreparation = await ensureWsol(baseConnection, wallet, mint, amountBaseUnits);
      for (const signature of report.tokenPreparation.signatures ?? []) {
        report.txSignatures.push({
          label: "wrap-wsol",
          signature,
          sendTo: "base",
          explorer: explorer(signature),
        });
      }
    }

    const liveDeposit = await apiPost(report, "/v1/spl/deposit", depositBody);
    const liveDepositBuild = liveDeposit.response;
    liveDeposit.response = summarizeBuild(liveDeposit.response);
    if (!liveDeposit.ok) throw new Error(`deposit blocked HTTP ${liveDeposit.status}: ${liveDeposit.responseText}`);
    await signAndSendBuild(
      report,
      { base: baseConnection, ephemeral: ephemeralConnection },
      wallet,
      "deposit",
      liveDepositBuild
    );
    report.liveStatus.deposit = "submitted";

    const livePrivateTransfer = await apiPost(
      report,
      "/v1/spl/transfer",
      privateTransferBody,
      bearerToken ? { bearerToken } : {}
    );
    const livePrivateTransferBuild = livePrivateTransfer.response;
    livePrivateTransfer.response = summarizeBuild(livePrivateTransfer.response);
    if (livePrivateTransfer.ok) {
      try {
        await signAndSendBuild(
          report,
          { base: baseConnection, ephemeral: ephemeralConnection },
          wallet,
          "private-transfer",
          livePrivateTransferBuild
        );
        report.liveStatus.privateTransfer = "submitted";
      } catch (error) {
        report.liveStatus.privateTransfer =
          `submit-blocked: ${error instanceof Error ? error.message : String(error)}`;
      }
    } else {
      report.liveStatus.privateTransfer = `blocked HTTP ${livePrivateTransfer.status}`;
    }

    const liveWithdraw = await apiPost(report, "/v1/spl/withdraw", withdrawBody);
    const liveWithdrawBuild = liveWithdraw.response;
    liveWithdraw.response = summarizeBuild(liveWithdraw.response);
    if (!liveWithdraw.ok) throw new Error(`withdraw blocked HTTP ${liveWithdraw.status}: ${liveWithdraw.responseText}`);
    await signAndSendBuild(
      report,
      { base: baseConnection, ephemeral: ephemeralConnection },
      wallet,
      "withdraw",
      liveWithdrawBuild
    );
    report.liveStatus.withdraw = "submitted";

    await apiGet(
      report,
      appendQuery("/v1/spl/private-balance", {
        address: owner,
        mint: mintAddress,
        cluster: CLUSTER,
      }),
      { bearerToken }
    );
  }

  const blocked = report.endpointsHit.filter((entry) => !entry.ok);
  if (blocked.length > 0) {
    report.blocker = blocked
      .map((entry) => `${entry.method} ${entry.path} -> HTTP ${entry.status}: ${entry.responseText}`)
      .join("\n");
  }

  console.log(stringifyReport(report));
  if (mode === "live" && report.txSignatures.length === 0) process.exitCode = 1;
}

main().catch((error) => {
  process.exitCode = 1;
  if (activeReport) {
    activeReport.blocker = error instanceof Error ? error.message : String(error);
    console.error(stringifyReport(activeReport));
  }
  console.error(error instanceof Error ? error.stack || error.message : error);
});
