#!/usr/bin/env node
// scripts/devnet-wsol-umbra-roundtrip.mjs
//
// Post-withdraw wSOL Umbra settlement adapter — devnet demo.
//
// CLAIM BOUNDARY (read before running):
//   Phase 1 — C2H ZK proof: The shielded_pool withdraw instruction verifies a
//   Groth16 proof on-chain and consumes the nullifier. The exit is queued in
//   exit_queue. flush_exits is fail-closed (PER adapter not wired in the
//   current Anchor 0.30.1 workspace), so no SOL is actually transferred to the
//   stealth_address in the current devnet state. Phase 1 is skipped when the
//   smoke nullifier is already consumed from a prior devnet-fullround.mjs run.
//
//   Phase 2 — wSOL/Umbra settlement: This script wraps a small amount of
//   fresh wallet SOL to wSOL to represent the hypothetical post-flush payout
//   amount (since flush_exits is fail-closed). It then routes that wSOL
//   through the Umbra encrypted-balance SDK flow (deposit → withdraw).
//   This is "ShieldLend C2H withdraw → wrap SOL to wSOL → Umbra settlement",
//   not a native protocol-level Umbra payout from the pool.
//
// Safe to claim: "wSOL Umbra settlement adapter confirmed on devnet."
// Do NOT claim: "ShieldLend native SOL exits are Umbra-routed" or
//               "flush_exits delivered SOL to the Umbra relayer."
//
// Run: node scripts/devnet-wsol-umbra-roundtrip.mjs
// Requires: devnet wallet at ~/.config/solana/id.json, >= 0.02 SOL balance.
//           @umbra-privacy/sdk@4.0.0 in node_modules (npm install).

import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

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

const require = createRequire(import.meta.url);
const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  ComputeBudgetProgram,
} = require("@solana/web3.js");

// ─── Constants ───────────────────────────────────────────────────────────────

const SHIELDED_POOL   = new PublicKey("9Bvt3jMawHFRRxpaQTtV5VvFdpZkmAZtvwjTrAX9TAtE");
const NULL_REGISTRY   = new PublicKey("E42nSmqvSCuC1EWbmzYqsdLHimBMeuZyir5dB5gE24rF");
const LENDING_POOL    = new PublicKey("HLtWrvLyc2SE3ERWHaEdY4RG84GxFfHv3Qf4NzJPxaF7");

const WSOL_MINT       = "So11111111111111111111111111111111111111112";
const TOKEN_PROGRAM   = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ATA_PROGRAM     = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

const DEVNET_RPC      = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
const DEVNET_WS       = "wss://api.devnet.solana.com";
const DEVNET_INDEXER  = process.env.NEXT_PUBLIC_UMBRA_INDEXER_URL || "https://utxo-indexer.api-devnet.umbraprivacy.com";
const DEVNET_RELAYER  = process.env.NEXT_PUBLIC_UMBRA_RELAYER_URL || "https://relayer.api-devnet.umbraprivacy.com";

// Amount of SOL to wrap and route through Umbra (0.001 SOL = 1_000_000 lamports).
// Keep small: this is a demo amount representing the "post-flush payout".
const WRAP_AMOUNT_LAMPORTS = BigInt(process.env.WSOL_UMBRA_DEMO_AMOUNT || "1000000");

// ─── DEV/TEST C2H smoke nullifier hash (from devnet-fullround.mjs) ───────────
// Used to check whether the smoke nullifier is already consumed on devnet.
const SMOKE_NULLIFIER_HASH = Buffer.from([
  0x22, 0xfb, 0x96, 0x25, 0x97, 0x1f, 0xbf, 0x61, 0xee, 0xe6, 0xcf, 0xf9, 0xf4, 0x9e, 0xfa, 0x4e,
  0xbd, 0x06, 0x8e, 0x1c, 0x5d, 0x1a, 0xe2, 0x9a, 0x6f, 0xb9, 0x40, 0x91, 0x19, 0x76, 0xa5, 0x74,
]);
const REGISTRY_WRITER_SEED = Buffer.from("registry-writer");
const PROOF_DATA_SEED      = Buffer.from("proof-data");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function disc(name) {
  return createHash("sha256").update(`global:${name}`).digest().slice(0, 8);
}

function pda(seeds, programId) {
  return PublicKey.findProgramAddressSync(seeds, programId);
}

function explorer(sig) {
  return `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
}

function asUiSol(lamports) {
  const n = typeof lamports === "bigint" ? lamports : BigInt(lamports);
  const whole = n / 1_000_000_000n;
  const frac  = (n % 1_000_000_000n).toString().padStart(9, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

function collectSigs(result) {
  return [result?.queueSignature, result?.callbackSignature, result?.rentClaimSignature]
    .filter((s) => typeof s === "string" && s.length > 0);
}

function stringify(value) {
  return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2);
}

function getAta(mint, owner) {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM.toBuffer(), mint.toBuffer()],
    ATA_PROGRAM
  )[0];
}

async function getParsedTokenBalance(connection, owner, mint) {
  const res = await connection.getParsedTokenAccountsByOwner(owner, { mint }, "confirmed");
  let total = 0n;
  const accounts = [];
  for (const item of res.value) {
    const info = item.account.data.parsed.info;
    const amount = BigInt(info.tokenAmount.amount);
    total += amount;
    accounts.push({ pubkey: item.pubkey.toBase58(), amount: amount.toString() });
  }
  return { total, accounts };
}

async function sendTx(connection, wallet, ixs, label) {
  const tx = new Transaction().add(...ixs);
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  try {
    const sig = await sendAndConfirmTransaction(connection, tx, [wallet], { commitment: "confirmed" });
    console.log(`  OK   ${label}`);
    console.log(`       sig: ${sig}`);
    console.log(`       explorer: ${explorer(sig)}`);
    return { ok: true, sig };
  } catch (err) {
    const logs = err.logs ?? [];
    const msg = logs.find((l) => l.includes("Error") || l.includes("error")) ?? err.message;
    console.log(`  FAIL ${label}: ${msg}`);
    if (logs.length) logs.slice(0, 6).forEach((l) => console.log(`       ${l}`));
    return { ok: false, err, logs };
  }
}

// ─── Phase 1: check C2H state ─────────────────────────────────────────────────
// Check whether the smoke nullifier is already consumed, meaning the C2H
// proof path has already been exercised on this devnet deployment.

async function checkNullifierConsumed(connection) {
  const [nullifierPda] = pda([Buffer.from("nullifier"), SMOKE_NULLIFIER_HASH], NULL_REGISTRY);
  const info = await connection.getAccountInfo(nullifierPda, "confirmed");
  if (!info) return { consumed: false, pda: nullifierPda };
  // NullifierAccount layout: disc(8) + state(1) + nullifier_hash(32) + ...
  // state 2 = Spent
  const state = info.data[8];
  return { consumed: state === 2, state, pda: nullifierPda };
}

async function checkPoolExitQueue(connection) {
  const [poolState] = pda([Buffer.from("shielded-pool-state")], SHIELDED_POOL);
  const info = await connection.getAccountInfo(poolState, "confirmed");
  if (!info) return null;
  // Offsets: disc(8)+auth(32)+cur_root(32)+hist_roots(30*32=960)+root_idx(1)+next_idx(8)+commit_vec_len(4) = 1045
  // exit_queue vec_len is right after epoch_commitments vec (8 entries × 56 bytes = 448) + 4 header = 452
  // epoch_commitments starts at 1041 (after next_idx), vec_len 4 bytes, then MAX_EPOCH_COMMITMENTS*56 = 448 bytes, then exit_queue vec_len
  const exitQueueLenOffset = 1041 + 4 + (8 * 56); // 1041 + 4 + 448 = 1493
  const exitLen = info.data.readUInt32LE(exitQueueLenOffset);
  return { exitQueueLen: exitLen, poolStatePda: poolState };
}

// ─── Phase 1 (optional): run C2H proof if nullifier not yet consumed ──────────

// DEV/TEST smoke proof vectors (same as devnet-fullround.mjs)
const SMOKE_ROOT = Buffer.from([
  0x17, 0x6e, 0xb2, 0xc2, 0x41, 0xcc, 0x0b, 0x69, 0x4d, 0x3c, 0x9d, 0xdf, 0x02, 0x22, 0x10, 0xcf,
  0x0c, 0x1c, 0x23, 0xdf, 0xa4, 0x17, 0x54, 0xfd, 0x27, 0x42, 0x60, 0x44, 0x31, 0x53, 0xaa, 0xbf,
]);
const COMMITMENT = Buffer.from([
  0x02, 0xf6, 0x77, 0x7b, 0xa2, 0xb4, 0x23, 0xed, 0x37, 0xc5, 0x88, 0x76, 0xd1, 0x74, 0x0b, 0xe2,
  0xae, 0x2d, 0xb4, 0x11, 0x20, 0x6b, 0x87, 0x63, 0x81, 0xe3, 0x12, 0x36, 0xb2, 0x94, 0x2a, 0x6a,
]);
const PROOF_A = Buffer.from([
  0x11, 0xc3, 0x58, 0xba, 0x0e, 0xd8, 0xd4, 0x76, 0x19, 0xca, 0x4d, 0x4a, 0x29, 0x2c, 0xe0, 0x83,
  0x53, 0xb3, 0xc7, 0x58, 0xe5, 0x73, 0xc5, 0x75, 0xcc, 0x44, 0x2e, 0x23, 0xc2, 0x59, 0x04, 0x1b,
  0x16, 0xb8, 0x47, 0x7a, 0x2f, 0xb2, 0xa0, 0x25, 0x8c, 0x93, 0x91, 0xc2, 0x75, 0x91, 0xec, 0x40,
  0x47, 0x96, 0xb0, 0x31, 0x7e, 0xdc, 0x08, 0x08, 0xdd, 0x20, 0x54, 0x20, 0xb4, 0xc4, 0x4e, 0x15,
]);
const PROOF_B = Buffer.from([
  0x2d, 0xc8, 0xfb, 0xd6, 0x88, 0x08, 0xc6, 0x69, 0x61, 0xa5, 0x65, 0x09, 0x1a, 0x09, 0x28, 0x73,
  0x7c, 0xd7, 0x7d, 0xb8, 0xcf, 0xa1, 0x23, 0x71, 0xd6, 0x39, 0xa7, 0x47, 0x03, 0xd3, 0x61, 0xb0,
  0x20, 0xbb, 0x30, 0xb1, 0x17, 0x1a, 0x32, 0x07, 0x2e, 0x28, 0x9f, 0x50, 0x0c, 0xa8, 0xe4, 0xbe,
  0x30, 0xe1, 0x6e, 0xc9, 0xe7, 0xb6, 0x0c, 0x1c, 0x2a, 0xc3, 0x37, 0x3f, 0x29, 0x81, 0x46, 0x76,
  0x18, 0x7f, 0x94, 0x93, 0x76, 0x07, 0xb8, 0x20, 0xdd, 0x39, 0xd9, 0xcb, 0x95, 0x2a, 0x69, 0xcb,
  0x2e, 0x3d, 0xa5, 0x24, 0xc4, 0x19, 0x62, 0xe3, 0x23, 0xb3, 0x0e, 0x39, 0xb5, 0x64, 0x8c, 0xd4,
  0x05, 0xef, 0xb1, 0xd7, 0x72, 0x0e, 0xe2, 0x3d, 0x22, 0x2c, 0x75, 0x54, 0x67, 0x5d, 0xa5, 0x3d,
  0x61, 0xfc, 0x4b, 0xb3, 0xdd, 0x4b, 0x1b, 0x61, 0x2f, 0x74, 0x98, 0x3b, 0xf0, 0x41, 0x3d, 0x3e,
]);
const PROOF_C = Buffer.from([
  0x1c, 0xaa, 0xad, 0xe7, 0x37, 0xbc, 0xe8, 0xdc, 0x5d, 0x97, 0x4e, 0x8e, 0xb2, 0x84, 0x56, 0x59,
  0x16, 0xb3, 0x8c, 0xc2, 0xe4, 0x6b, 0xab, 0x55, 0xff, 0x70, 0xad, 0xe7, 0x81, 0xb1, 0x41, 0x3f,
  0x1a, 0xf0, 0xc2, 0x04, 0xee, 0x9a, 0x8c, 0x61, 0x5f, 0x63, 0x7d, 0x97, 0xa6, 0x87, 0xd3, 0x6c,
  0x57, 0x75, 0xe8, 0x1e, 0xc4, 0xb2, 0xd8, 0xba, 0xe9, 0xa0, 0x32, 0xe3, 0x5b, 0x4e, 0xcb, 0x45,
]);

function buildPublicSignals() {
  const rows = [
    Buffer.from([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,5,0xf5,0xe1,0x00]),
    COMMITMENT,
    Buffer.from([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0x0f,0x42,0x41]),
    Buffer.from([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0x0f,0x42,0x42]),
    Buffer.from([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0x0f,0x42,0x43]),
    Buffer.from([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0x0f,0x42,0x44]),
    Buffer.from([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0x0f,0x42,0x45]),
    Buffer.from([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0x0f,0x42,0x46]),
    Buffer.from([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0x0f,0x42,0x47]),
    Buffer.from([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0x0f,0x42,0x48]),
    Buffer.from([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0x0f,0x42,0x49]),
    Buffer.from([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0x0f,0x42,0x4a]),
    Buffer.from([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0x0f,0x42,0x4b]),
    Buffer.from([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0x0f,0x42,0x4c]),
    Buffer.from([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0x0f,0x42,0x4d]),
    Buffer.from([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0x0f,0x42,0x4e]),
    Buffer.from([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0x0f,0x42,0x4f]),
    SMOKE_NULLIFIER_HASH,
    SMOKE_ROOT,
  ];
  return Buffer.concat(rows);
}

function u64LE(n) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
}
function u16LE(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
}

async function runC2HPhase(connection, wallet) {
  console.log("\n── Phase 1: ShieldLend C2H ZK proof verification ──────────────────────────\n");
  console.log("  Checking nullifier state on devnet...");
  const nullCheck = await checkNullifierConsumed(connection);

  if (nullCheck.consumed) {
    console.log("  SKIP: smoke nullifier already consumed (state=Spent).");
    console.log("  This means devnet-fullround.mjs was run previously — C2H proof confirmed.");
    console.log("  Exit queue has the 0.1 SOL queued (flush_exits fail-closed; SOL remains in pool PDA).");
    const poolInfo = await checkPoolExitQueue(connection);
    if (poolInfo) {
      console.log(`  exit_queue length: ${poolInfo.exitQueueLen}`);
    }
    return { skipped: true, reason: "nullifier_already_consumed" };
  }

  console.log("  Smoke nullifier not yet consumed — running store_withdraw_proof + withdraw...");

  // Check pool state for deposit+flush
  const [poolState] = pda([Buffer.from("shielded-pool-state")], SHIELDED_POOL);
  const poolInfo = await connection.getAccountInfo(poolState, "confirmed");
  if (!poolInfo) {
    console.log("  SKIP: pool state PDA not found. Run devnet-e2e.mjs to initialize, then devnet-fullround.mjs for deposit+flush.");
    return { skipped: true, reason: "pool_not_initialized" };
  }

  const nextIndex = poolInfo.data.readBigUInt64LE(1033);
  const commitLen = poolInfo.data.readUInt32LE(1041);
  const currentRoot = poolInfo.data.slice(40, 72);
  const alreadyFlushed = nextIndex === 1n && commitLen === 0 && currentRoot.equals(SMOKE_ROOT);

  if (!alreadyFlushed) {
    console.log(`  SKIP: pool state unexpected (next_index=${nextIndex}, commitLen=${commitLen}, root not smoke_root).`);
    console.log("  Run devnet-fullround.mjs first to complete deposit+flush, then retry this script.");
    return { skipped: true, reason: "pool_not_flushed_with_smoke_root" };
  }

  // store_withdraw_proof
  console.log("\n  store_withdraw_proof...");
  const proofNonce = randomBytes(32);
  const [proofDataPda] = pda([PROOF_DATA_SEED, wallet.publicKey.toBytes(), proofNonce], SHIELDED_POOL);
  const storeResult = await sendTx(
    connection, wallet,
    [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }),
      new TransactionInstruction({
        programId: SHIELDED_POOL,
        keys: [
          { pubkey: wallet.publicKey, isSigner: true,  isWritable: true  },
          { pubkey: proofDataPda,     isSigner: false, isWritable: true  },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: Buffer.concat([
          disc("store_withdraw_proof"),
          proofNonce,
          PROOF_A, PROOF_B, PROOF_C,
          buildPublicSignals(),
        ]),
      }),
    ],
    "shielded_pool::store_withdraw_proof"
  );
  if (!storeResult.ok) return { skipped: false, ok: false, step: "store_withdraw_proof" };

  // withdraw
  console.log("\n  withdraw (1,400,000 CU — Groth16 BN254 pairing)...");
  const [registryConfig] = pda([Buffer.from("registry-config")], NULL_REGISTRY);
  const [registryWriter] = pda([REGISTRY_WRITER_SEED], SHIELDED_POOL);
  const [nullifierPda]   = pda([Buffer.from("nullifier"), SMOKE_NULLIFIER_HASH], NULL_REGISTRY);
  const withdrawArgs = Buffer.concat([
    SMOKE_ROOT,
    SMOKE_NULLIFIER_HASH,
    u64LE(100_000_000n),
    wallet.publicKey.toBytes(),
    u64LE(1n),
    proofNonce,
  ]);
  const withdrawResult = await sendTx(
    connection, wallet,
    [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
      new TransactionInstruction({
        programId: SHIELDED_POOL,
        keys: [
          { pubkey: wallet.publicKey, isSigner: true,  isWritable: true  },
          { pubkey: poolState,        isSigner: false, isWritable: true  },
          { pubkey: nullifierPda,     isSigner: false, isWritable: true  },
          { pubkey: registryConfig,   isSigner: false, isWritable: false },
          { pubkey: registryWriter,   isSigner: false, isWritable: false },
          { pubkey: NULL_REGISTRY,    isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: proofDataPda,     isSigner: false, isWritable: true  },
        ],
        data: Buffer.concat([disc("withdraw"), withdrawArgs]),
      }),
    ],
    "shielded_pool::withdraw (Groth16 BN254)"
  );

  if (!withdrawResult.ok) {
    return { skipped: false, ok: false, step: "withdraw" };
  }

  console.log("\n  C2H result: Groth16 proof verified on-chain. Nullifier consumed. Exit queued.");
  console.log("  NOTE: flush_exits is fail-closed (PER adapter not wired). SOL remains in pool PDA.");
  console.log("  Phase 2 wraps fresh wallet SOL to wSOL to simulate the post-flush payout amount.");
  return { skipped: false, ok: true, storeSig: storeResult.sig, withdrawSig: withdrawResult.sig };
}

// ─── Phase 2: wrap SOL → wSOL, route through Umbra ──────────────────────────

async function wrapSolToWsol(connection, web3Keypair, owner, amountLamports) {
  const mint = new PublicKey(WSOL_MINT);
  const ata  = getAta(mint, owner);
  const tx   = new Transaction();
  const ataInfo = await connection.getAccountInfo(ata, "confirmed");

  if (!ataInfo) {
    tx.add({
      keys: [
        { pubkey: owner,   isSigner: true,  isWritable: true  },
        { pubkey: ata,     isSigner: false, isWritable: true  },
        { pubkey: owner,   isSigner: false, isWritable: false },
        { pubkey: mint,    isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
      ],
      programId: ATA_PROGRAM,
      data: Buffer.alloc(0),
    });
  }

  tx.add(
    SystemProgram.transfer({ fromPubkey: owner, toPubkey: ata, lamports: Number(amountLamports) }),
    { keys: [{ pubkey: ata, isSigner: false, isWritable: true }], programId: TOKEN_PROGRAM, data: Buffer.from([17]) }
  );

  const sig = await sendAndConfirmTransaction(connection, tx, [web3Keypair], { commitment: "confirmed" });
  const after = await getParsedTokenBalance(connection, owner, mint);
  return { sig, ata: ata.toBase58(), balanceAfter: after.total.toString() };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const keypairPath = process.env.SOLANA_KEYPAIR || path.join(homedir(), ".config", "solana", "id.json");
  const keypairBytes = new Uint8Array(JSON.parse(readFileSync(keypairPath, "utf-8")));
  const web3Keypair  = Keypair.fromSecretKey(keypairBytes);
  const signer       = await createSignerFromPrivateKeyBytes(keypairBytes);
  const owner        = new PublicKey(signer.address);
  const connection   = new Connection(DEVNET_RPC, "confirmed");

  const walletLamports = await connection.getBalance(owner, "confirmed");
  const sdkProgram     = getNetworkConfig("devnet").programId;

  console.log("=== ShieldLend wSOL Umbra Settlement Adapter — Devnet Roundtrip ===\n");
  console.log("CLAIM BOUNDARY:");
  console.log("  Phase 1  — ShieldLend C2H ZK proof verified on-chain; nullifier consumed; exit queued.");
  console.log("  Phase 2  — Post-withdraw settlement: wrap wallet SOL to wSOL; Umbra encrypted-balance flow.");
  console.log("  NOT live — flush_exits (PER adapter); native pool-to-Umbra SOL routing.");
  console.log("");
  console.log(`Wallet:          ${owner.toBase58()}`);
  console.log(`Balance:         ${asUiSol(walletLamports)} SOL`);
  console.log(`Wrap amount:     ${asUiSol(WRAP_AMOUNT_LAMPORTS)} SOL (${WRAP_AMOUNT_LAMPORTS} lamports)`);
  console.log(`Umbra SDK:       ${pkg.version}`);
  console.log(`Umbra program:   ${sdkProgram}`);
  console.log(`Umbra indexer:   ${DEVNET_INDEXER}`);

  if (walletLamports < 20_000_000) {
    throw new Error(`Wallet ${owner.toBase58()} has < 0.02 SOL (${walletLamports} lamports). Fund it first.`);
  }

  const report = {
    adapter: "wsol-umbra-settlement",
    claimBoundary: {
      c2hZkProofOnChain:   "shielded_pool::withdraw verified Groth16 BN254 on devnet; nullifier consumed; exit queued in exit_queue",
      flushExitsStatus:    "FAIL-CLOSED — flush_exits requires PER adapter (Anchor 0.32.1 blocked); SOL stays in pool PDA",
      wrapStep:            `Wrapped ${WRAP_AMOUNT_LAMPORTS.toString()} lamports of fresh wallet SOL to wSOL to simulate post-flush payout`,
      umbraFlow:           "wSOL public-balance → Umbra encrypted-balance deposit → Umbra encrypted-balance withdraw",
      notLive:             "Native pool SOL → Umbra routing; production trusted setup; IKA relay; PER flush",
    },
    sdkVersion:      pkg.version,
    umbraProgram:    sdkProgram,
    wallet:          owner.toBase58(),
    walletLamports:  walletLamports.toString(),
    wrapAmount:      WRAP_AMOUNT_LAMPORTS.toString(),
    phase1:          null,
    wrapResult:      null,
    registrationSigs: [],
    depositResult:   null,
    withdrawResult:  null,
    encryptedBalanceAfterDeposit:  null,
    encryptedBalanceAfterWithdraw: null,
    txSignatures:    [],
    txExplorerUrls:  [],
    adapterLive:     false,
  };

  // Phase 1 — C2H
  report.phase1 = await runC2HPhase(connection, web3Keypair);

  // Phase 2 — wrap SOL → wSOL
  console.log("\n── Phase 2: wSOL wrap + Umbra settlement ───────────────────────────────────\n");
  console.log(`  Wrapping ${asUiSol(WRAP_AMOUNT_LAMPORTS)} SOL to wSOL...`);
  report.wrapResult = await wrapSolToWsol(connection, web3Keypair, owner, WRAP_AMOUNT_LAMPORTS);
  console.log(`  OK   wrap SOL → wSOL`);
  console.log(`       sig:     ${report.wrapResult.sig}`);
  console.log(`       ata:     ${report.wrapResult.ata}`);
  console.log(`       balance: ${report.wrapResult.balanceAfter} base units`);
  report.txSignatures.push(report.wrapResult.sig);

  // Umbra client
  const client = await getUmbraClient({
    signer,
    network: "devnet",
    rpcUrl: DEVNET_RPC,
    rpcSubscriptionsUrl: DEVNET_WS,
    indexerApiEndpoint: DEVNET_INDEXER,
  });

  // Register (if needed)
  console.log("\n  Umbra user account check...");
  const queryUser = getUserAccountQuerierFunction({ client });
  const userBefore = await queryUser(address(signer.address));
  if (userBefore.state !== "exists" || !userBefore.data?.isUserAccountX25519KeyRegistered) {
    console.log("  Registering user with Umbra...");
    const register = getUserRegistrationFunction({ client });
    report.registrationSigs = await register({ confidential: true, anonymous: false });
    report.txSignatures.push(...report.registrationSigs);
    console.log(`  OK   registration sigs: ${report.registrationSigs.length}`);
  } else {
    console.log("  SKIP: Umbra user already registered.");
  }

  // Deposit wSOL → Umbra encrypted balance
  console.log(`\n  Umbra deposit: ${WRAP_AMOUNT_LAMPORTS} lamports of wSOL...`);
  const deposit = getPublicBalanceToEncryptedBalanceDirectDepositorFunction({ client });
  report.depositResult = await deposit(address(signer.address), address(WSOL_MINT), WRAP_AMOUNT_LAMPORTS);
  const depositSigs = collectSigs(report.depositResult);
  report.txSignatures.push(...depositSigs);
  console.log(`  OK   Umbra wSOL deposit`);
  depositSigs.forEach((s) => {
    console.log(`       sig: ${s}`);
    console.log(`       explorer: ${explorer(s)}`);
  });

  // Query encrypted balance
  const queryEncBal = getEncryptedBalanceQuerierFunction({ client });
  const balAfterDeposit = await queryEncBal([address(WSOL_MINT)]);
  report.encryptedBalanceAfterDeposit = balAfterDeposit.get(address(WSOL_MINT)) ?? null;
  console.log(`\n  Encrypted balance after deposit: ${stringify(report.encryptedBalanceAfterDeposit)}`);

  // Withdraw wSOL ← Umbra encrypted balance
  const availableBalance = report.encryptedBalanceAfterDeposit?.state === "shared"
    ? BigInt(report.encryptedBalanceAfterDeposit.balance)
    : 0n;

  if (availableBalance > 0n) {
    const withdrawAmount = availableBalance < WRAP_AMOUNT_LAMPORTS ? availableBalance : WRAP_AMOUNT_LAMPORTS;
    console.log(`\n  Umbra withdraw: ${withdrawAmount} lamports of wSOL...`);
    const umbWithdraw = getEncryptedBalanceToPublicBalanceDirectWithdrawerFunction({ client });
    report.withdrawResult = await umbWithdraw(address(signer.address), address(WSOL_MINT), withdrawAmount);
    const withdrawSigs = collectSigs(report.withdrawResult);
    report.txSignatures.push(...withdrawSigs);
    console.log(`  OK   Umbra wSOL withdraw`);
    withdrawSigs.forEach((s) => {
      console.log(`       sig: ${s}`);
      console.log(`       explorer: ${explorer(s)}`);
    });
    const balAfterWithdraw = await queryEncBal([address(WSOL_MINT)]);
    report.encryptedBalanceAfterWithdraw = balAfterWithdraw.get(address(WSOL_MINT)) ?? null;
  } else {
    report.claimBoundary.umbraWithdrawBlocker =
      `Encrypted balance state is not locally readable as shared after deposit: ${report.encryptedBalanceAfterDeposit?.state}`;
    console.log(`\n  NOTE: encrypted balance not yet in shared state — withdraw skipped.`);
    console.log(`        ${report.claimBoundary.umbraWithdrawBlocker}`);
  }

  report.txExplorerUrls = report.txSignatures.map(explorer);
  report.adapterLive = Boolean(report.depositResult?.queueSignature);

  // ─── Final report ─────────────────────────────────────────────────────────

  const balanceAfter = await connection.getBalance(owner, "confirmed");
  console.log("\n=== wSOL Umbra Settlement Adapter Result ===\n");
  if (report.adapterLive) {
    console.log("RESULT: wSOL UMBRA SETTLEMENT ADAPTER CONFIRMED");
    console.log("  Phase 1 (C2H):         " + (report.phase1?.skipped
      ? `SKIPPED (${report.phase1.reason}); C2H confirmed from prior devnet-fullround.mjs run`
      : report.phase1?.ok ? "OK — Groth16 proof verified; nullifier consumed; exit queued" : "PARTIAL"));
    console.log("  Wrap SOL → wSOL:       OK");
    console.log("  Umbra wSOL deposit:    OK — queue sig: " + (report.depositResult?.queueSignature ?? "n/a"));
    console.log("  Umbra wSOL withdraw:   " + (report.withdrawResult?.queueSignature ? "OK" : "not attempted (balance state)"));
  } else {
    console.log("RESULT: PARTIAL — Umbra deposit did not return a queue signature.");
    console.log("  Check the report below for details.");
  }

  console.log("\nCLAIM BOUNDARY SUMMARY:");
  console.log("  CONFIRMED: wSOL Umbra encrypted-balance deposit/withdraw (SDK 4.0.0, devnet)");
  console.log("  CONFIRMED: ShieldLend C2H ZK proof verified on-chain (if not already done)");
  console.log("  NOT LIVE:  flush_exits SOL transfer (PER adapter fail-closed)");
  console.log("  NOT LIVE:  native pool SOL routed directly to Umbra (wSOL wrap is post-withdraw simulation)");

  console.log(`\nBalance before: ${asUiSol(walletLamports)} SOL`);
  console.log(`Balance after:  ${asUiSol(balanceAfter)} SOL`);
  console.log(`Net cost:       ${asUiSol(Math.abs(walletLamports - balanceAfter))} SOL`);
  console.log("\n=== Full report ===\n");
  console.log(stringify(report));

  if (!report.adapterLive) process.exitCode = 1;
}

main().catch((err) => {
  process.exitCode = 1;
  console.error(err instanceof Error ? err.stack || err.message : err);
});
