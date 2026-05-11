// scripts/devnet-fullround.mjs
// C2H — Full devnet round-trip proof smoke test.
//
// Sequence:
//   0. Verify/fix nullifier_registry authorized_programs (registry_writer PDAs)
//   1. Pre-checks: pool state — deposit+flush if needed, or skip if already done
//   2. deposit      — queues the DEV/TEST smoke commitment into epoch_commitments
//   3. flush_epoch  — inserts commitment into Merkle tree, records smoke root in historical_roots
//   4. store_withdraw_proof — writes DEV/TEST proof to a proof PDA
//   5. withdraw     — reads proof PDA, exercises on-chain Groth16 verifier, marks proof consumed
//
// Idempotency: if next_index=1 and current_root=smoke_root, steps 2–3 are skipped.
// Uses the existing DEV/TEST smoke vectors (secret=123456789, nullifier=987654321).
// Proof was generated from the DEV/TEST pow14 trusted setup — NOT production trusted setup.
//
// Run: node scripts/devnet-fullround.mjs
// Requires: devnet wallet at ~/.config/solana/id.json, ≥ 0.5 SOL balance.

import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
  ComputeBudgetProgram,
} = require("@solana/web3.js");

// ─── Program IDs (verified: Anchor.toml + declare_id! + anchor keys list) ────

const SHIELDED_POOL = new PublicKey("9Bvt3jMawHFRRxpaQTtV5VvFdpZkmAZtvwjTrAX9TAtE");
const LENDING_POOL  = new PublicKey("J2yn42PLSiRvGEGj24Uj2q4QeGHZa1sbgzs5foLK81qn");
const NULL_REGISTRY = new PublicKey("E42nSmqvSCuC1EWbmzYqsdLHimBMeuZyir5dB5gE24rF");

// ─── Seeds ────────────────────────────────────────────────────────────────────

const PROOF_DATA_SEED      = Buffer.from("proof-data");
const REGISTRY_WRITER_SEED = Buffer.from("registry-writer");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function disc(name) {
  return createHash("sha256").update(`global:${name}`).digest().slice(0, 8);
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

function pda(seeds, programId) {
  return PublicKey.findProgramAddressSync(seeds, programId);
}

async function send(connection, wallet, ixs, label) {
  const tx = new Transaction().add(...ixs);
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  try {
    const sig = await sendAndConfirmTransaction(connection, tx, [wallet], {
      commitment: "confirmed",
    });
    console.log(`  OK   ${label}`);
    console.log(`       sig: ${sig}`);
    console.log(`       explorer: https://explorer.solana.com/tx/${sig}?cluster=devnet`);
    return { ok: true, sig };
  } catch (err) {
    const logs = err.logs ?? [];
    const progErr = logs.find((l) => l.includes("Error") || l.includes("error")) ?? err.message;
    console.log(`  FAIL ${label}`);
    console.log(`       reason: ${progErr}`);
    if (logs.length) logs.forEach((l) => console.log(`       ${l}`));
    return { ok: false, err, logs };
  }
}

// ─── DEV/TEST smoke vectors ───────────────────────────────────────────────────
//
// These are derived from secret=123456789, nullifier=987654321, denomination=100_000_000.
// The proof was generated locally using dev_pot14_final.ptau (NOT production trusted setup).
// The Merkle tree used pathElements=[0,0,...,0] for all 24 levels.
//
// commitment = Poseidon(123456789, 987654321, 100000000)
//            = 1340094716125420145701433838419136962767785604811236688259672987297509550698
//
// Merkle root = Poseidon tree root with commitment at leaf_index=0, all pathElements=0
//             = 10598782442549369384606510100635396398649329532160382647358478520741371554495
//
// nullifierHash = Poseidon(987654321, 0, 11254132154452147490799744423140604481167841310631133650094460832786634327021)
//               = 15823151740475693182734763529297185011266492017094657128221676237501138118004

// commitment as 32-byte big-endian (public_inputs[1] = ring[0])
const COMMITMENT = Buffer.from([
  0x02, 0xf6, 0x77, 0x7b, 0xa2, 0xb4, 0x23, 0xed, 0x37, 0xc5, 0x88, 0x76, 0xd1, 0x74, 0x0b, 0xe2,
  0xae, 0x2d, 0xb4, 0x11, 0x20, 0x6b, 0x87, 0x63, 0x81, 0xe3, 0x12, 0x36, 0xb2, 0x94, 0x2a, 0x6a,
]); // 32 bytes

// Merkle root as 32-byte big-endian (public_inputs[18] = signal[18])
const SMOKE_ROOT = Buffer.from([
  0x17, 0x6e, 0xb2, 0xc2, 0x41, 0xcc, 0x0b, 0x69, 0x4d, 0x3c, 0x9d, 0xdf, 0x02, 0x22, 0x10, 0xcf,
  0x0c, 0x1c, 0x23, 0xdf, 0xa4, 0x17, 0x54, 0xfd, 0x27, 0x42, 0x60, 0x44, 0x31, 0x53, 0xaa, 0xbf,
]); // 32 bytes

// nullifierHash as 32-byte big-endian (public_inputs[17] = signal[17])
const NULLIFIER_HASH = Buffer.from([
  0x22, 0xfb, 0x96, 0x25, 0x97, 0x1f, 0xbf, 0x61, 0xee, 0xe6, 0xcf, 0xf9, 0xf4, 0x9e, 0xfa, 0x4e,
  0xbd, 0x06, 0x8e, 0x1c, 0x5d, 0x1a, 0xe2, 0x9a, 0x6f, 0xb9, 0x40, 0x91, 0x19, 0x76, 0xa5, 0x74,
]); // 32 bytes

// proof_a: negated pi_a (groth16-solana convention: negate y coordinate of pi_a)
const PROOF_A = Buffer.from([
  0x11, 0xc3, 0x58, 0xba, 0x0e, 0xd8, 0xd4, 0x76, 0x19, 0xca, 0x4d, 0x4a, 0x29, 0x2c, 0xe0, 0x83,
  0x53, 0xb3, 0xc7, 0x58, 0xe5, 0x73, 0xc5, 0x75, 0xcc, 0x44, 0x2e, 0x23, 0xc2, 0x59, 0x04, 0x1b,
  0x16, 0xb8, 0x47, 0x7a, 0x2f, 0xb2, 0xa0, 0x25, 0x8c, 0x93, 0x91, 0xc2, 0x75, 0x91, 0xec, 0x40,
  0x47, 0x96, 0xb0, 0x31, 0x7e, 0xdc, 0x08, 0x08, 0xdd, 0x20, 0x54, 0x20, 0xb4, 0xc4, 0x4e, 0x15,
]); // 64 bytes

// proof_b: pi_b (G2 reordered: snarkjs [[c1,c0],[c1,c0]] → Solana [x_c0||x_c1||y_c0||y_c1])
const PROOF_B = Buffer.from([
  0x2d, 0xc8, 0xfb, 0xd6, 0x88, 0x08, 0xc6, 0x69, 0x61, 0xa5, 0x65, 0x09, 0x1a, 0x09, 0x28, 0x73,
  0x7c, 0xd7, 0x7d, 0xb8, 0xcf, 0xa1, 0x23, 0x71, 0xd6, 0x39, 0xa7, 0x47, 0x03, 0xd3, 0x61, 0xb0,
  0x20, 0xbb, 0x30, 0xb1, 0x17, 0x1a, 0x32, 0x07, 0x2e, 0x28, 0x9f, 0x50, 0x0c, 0xa8, 0xe4, 0xbe,
  0x30, 0xe1, 0x6e, 0xc9, 0xe7, 0xb6, 0x0c, 0x1c, 0x2a, 0xc3, 0x37, 0x3f, 0x29, 0x81, 0x46, 0x76,
  0x18, 0x7f, 0x94, 0x93, 0x76, 0x07, 0xb8, 0x20, 0xdd, 0x39, 0xd9, 0xcb, 0x95, 0x2a, 0x69, 0xcb,
  0x2e, 0x3d, 0xa5, 0x24, 0xc4, 0x19, 0x62, 0xe3, 0x23, 0xb3, 0x0e, 0x39, 0xb5, 0x64, 0x8c, 0xd4,
  0x05, 0xef, 0xb1, 0xd7, 0x72, 0x0e, 0xe2, 0x3d, 0x22, 0x2c, 0x75, 0x54, 0x67, 0x5d, 0xa5, 0x3d,
  0x61, 0xfc, 0x4b, 0xb3, 0xdd, 0x4b, 0x1b, 0x61, 0x2f, 0x74, 0x98, 0x3b, 0xf0, 0x41, 0x3d, 0x3e,
]); // 128 bytes

// proof_c: pi_c (G1 unmodified)
const PROOF_C = Buffer.from([
  0x1c, 0xaa, 0xad, 0xe7, 0x37, 0xbc, 0xe8, 0xdc, 0x5d, 0x97, 0x4e, 0x8e, 0xb2, 0x84, 0x56, 0x59,
  0x16, 0xb3, 0x8c, 0xc2, 0xe4, 0x6b, 0xab, 0x55, 0xff, 0x70, 0xad, 0xe7, 0x81, 0xb1, 0x41, 0x3f,
  0x1a, 0xf0, 0xc2, 0x04, 0xee, 0x9a, 0x8c, 0x61, 0x5f, 0x63, 0x7d, 0x97, 0xa6, 0x87, 0xd3, 0x6c,
  0x57, 0x75, 0xe8, 0x1e, 0xc4, 0xb2, 0xd8, 0xba, 0xe9, 0xa0, 0x32, 0xe3, 0x5b, 0x4e, 0xcb, 0x45,
]); // 64 bytes

// 19 public signals × 32 bytes (withdraw_ring public signal order):
//   [0]     denomination_out = 0x05f5e100 = 100_000_000 lamports
//   [1]     ring[0] = COMMITMENT
//   [2..16] ring[1..15] = dummy field elements (distinct, non-zero)
//   [17]    nullifierHash
//   [18]    root
const PUBLIC_SIGNALS = Buffer.concat([
  // signal[0] denomination_out = 100_000_000 = 0x05f5e100
  Buffer.from([0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x05,0xf5,0xe1,0x00]),
  // signal[1] ring[0] = commitment
  COMMITMENT,
  // signal[2..16] ring[1..15] dummy values (1000001..1000015, distinct)
  Buffer.from([0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x0f,0x42,0x41]),
  Buffer.from([0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x0f,0x42,0x42]),
  Buffer.from([0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x0f,0x42,0x43]),
  Buffer.from([0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x0f,0x42,0x44]),
  Buffer.from([0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x0f,0x42,0x45]),
  Buffer.from([0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x0f,0x42,0x46]),
  Buffer.from([0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x0f,0x42,0x47]),
  Buffer.from([0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x0f,0x42,0x48]),
  Buffer.from([0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x0f,0x42,0x49]),
  Buffer.from([0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x0f,0x42,0x4a]),
  Buffer.from([0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x0f,0x42,0x4b]),
  Buffer.from([0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x0f,0x42,0x4c]),
  Buffer.from([0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x0f,0x42,0x4d]),
  Buffer.from([0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x0f,0x42,0x4e]),
  Buffer.from([0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x0f,0x42,0x4f]),
  // signal[17] nullifierHash
  NULLIFIER_HASH,
  // signal[18] root
  SMOKE_ROOT,
]); // 19 × 32 = 608 bytes

// ─── On-chain state helpers ────────────────────────────────────────────────────

async function checkPoolState(connection, poolState) {
  const info = await connection.getAccountInfo(poolState);
  if (!info) return null;
  // Offsets: disc(8) + auth(32) + cur_root(32) + hist_roots(30*32=960) + root_idx(1) = 1033
  const nextIndex   = info.data.readBigUInt64LE(1033);
  const commitLen   = info.data.readUInt32LE(1041);
  const currentRoot = info.data.slice(40, 72);
  return { nextIndex, commitLen, currentRoot };
}

async function checkRegistryConfig(connection, registryConfig) {
  const info = await connection.getAccountInfo(registryConfig);
  if (!info) return null;
  // disc(8) + authority(32) + Vec<Pubkey>: u32 LE length at offset 40
  const len = info.data.readUInt32LE(40);
  const programs = [];
  for (let i = 0; i < len; i++) {
    programs.push(new PublicKey(info.data.slice(44 + i * 32, 44 + (i + 1) * 32)));
  }
  return programs;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const keypairPath = path.join(homedir(), ".config", "solana", "id.json");
  const wallet = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(keypairPath, "utf-8")))
  );
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const balanceBefore = await connection.getBalance(wallet.publicKey);

  console.log("=== C2H: Full Devnet Round-Trip Proof Smoke Test ===\n");
  console.log(`Wallet:         ${wallet.publicKey.toBase58()}`);
  console.log(`Balance before: ${(balanceBefore / 1e9).toFixed(9)} SOL`);
  console.log(`Commitment:     ${COMMITMENT.toString("hex")}`);
  console.log(`Smoke root:     ${SMOKE_ROOT.toString("hex")}`);
  console.log(`NullifierHash:  ${NULLIFIER_HASH.toString("hex")}\n`);

  // ── PDAs ──────────────────────────────────────────────────────────────────

  const [poolState]      = pda([Buffer.from("shielded-pool-state")], SHIELDED_POOL);
  const [registryConfig] = pda([Buffer.from("registry-config")], NULL_REGISTRY);
  const [registryWriter] = pda([REGISTRY_WRITER_SEED], SHIELDED_POOL);
  const [nullifierPda]   = pda([Buffer.from("nullifier"), NULLIFIER_HASH], NULL_REGISTRY);
  const [lendRegistryWriter] = pda([REGISTRY_WRITER_SEED], LENDING_POOL);

  console.log("PDAs:");
  console.log(`  pool state:         ${poolState.toBase58()}`);
  console.log(`  registry config:    ${registryConfig.toBase58()}`);
  console.log(`  sp registry_writer: ${registryWriter.toBase58()}`);
  console.log(`  lp registry_writer: ${lendRegistryWriter.toBase58()}`);
  console.log(`  nullifier PDA:      ${nullifierPda.toBase58()}\n`);

  // ── Step 0a: Verify/fix nullifier_registry authorized_programs ────────────
  //
  // The registry CPI checks writer.key() against authorized_programs.
  // The writer is the registry_writer PDA (seeds=["registry-writer"] in each program),
  // NOT the program ID itself. The authorized list must contain the PDA addresses.

  console.log("Step 0a: Check nullifier_registry authorized_programs...");
  const registryPrograms = await checkRegistryConfig(connection, registryConfig);
  if (!registryPrograms) {
    console.error("  ABORT: registry config not found.");
    process.exit(1);
  }
  const writerAddresses = [registryWriter.toBase58(), lendRegistryWriter.toBase58()];
  const needsFix = !writerAddresses.every((addr) => registryPrograms.some((p) => p.toBase58() === addr));

  if (needsFix) {
    console.log("  authorized_programs mismatch — updating to registry_writer PDAs...");
    const authProgBuf = Buffer.concat([
      Buffer.from([2, 0, 0, 0]), // Vec length = 2
      registryWriter.toBytes(),
      lendRegistryWriter.toBytes(),
    ]);
    const fixResult = await send(
      connection,
      wallet,
      [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 50_000 }),
        new TransactionInstruction({
          programId: NULL_REGISTRY,
          keys: [
            { pubkey: wallet.publicKey, isSigner: true,  isWritable: false },
            { pubkey: registryConfig,   isSigner: false, isWritable: true  },
          ],
          data: Buffer.concat([disc("update_authorized_programs"), authProgBuf]),
        }),
      ],
      "nullifier_registry::update_authorized_programs"
    );
    if (!fixResult.ok) {
      console.error("  ABORT: could not fix authorized_programs.");
      process.exit(1);
    }
  } else {
    console.log(`  OK: authorized_programs already contains registry_writer PDAs\n`);
  }

  // ── Step 0b: Pre-check pool state ─────────────────────────────────────────

  console.log("\nStep 0b: Pre-check pool state...");
  const poolInfo = await checkPoolState(connection, poolState);
  if (!poolInfo) {
    console.error("  ABORT: pool state PDA does not exist — run devnet-e2e.mjs first to initialize.");
    process.exit(1);
  }
  console.log(`  next_index:        ${poolInfo.nextIndex}`);
  console.log(`  epoch_commitments: ${poolInfo.commitLen}`);
  console.log(`  current_root:      ${poolInfo.currentRoot.toString("hex")}`);

  // Decide whether to skip deposit+flush (already done from a previous run)
  const alreadyFlushed = poolInfo.nextIndex === 1n &&
                          poolInfo.commitLen === 0 &&
                          poolInfo.currentRoot.equals(SMOKE_ROOT);

  let doDepositFlush = true;
  if (alreadyFlushed) {
    console.log("  SKIP: next_index=1 + current_root=smoke_root — deposit+flush already done ✓\n");
    doDepositFlush = false;
  } else if (poolInfo.nextIndex === 0n && poolInfo.commitLen === 0) {
    console.log("  OK: pool is fresh (next_index=0, commitments empty) — will deposit+flush\n");
  } else {
    console.error(`  ABORT: unexpected pool state (next_index=${poolInfo.nextIndex}, commitLen=${poolInfo.commitLen}).`);
    console.error("  This smoke test requires either a fresh pool (next_index=0) or a pool already flushed with smoke_root.");
    process.exit(1);
  }

  // ── Step 1: deposit ───────────────────────────────────────────────────────

  if (doDepositFlush) {
    console.log("Step 1: shielded_pool::deposit ...");
    const depositResult = await send(
      connection,
      wallet,
      [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }),
        new TransactionInstruction({
          programId: SHIELDED_POOL,
          keys: [
            { pubkey: wallet.publicKey, isSigner: true,  isWritable: true  }, // relay
            { pubkey: poolState,        isSigner: false, isWritable: true  }, // state
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          data: Buffer.concat([
            disc("deposit"),
            COMMITMENT,         // commitment: [u8; 32]
            u64LE(100_000_000), // denomination_lamports: u64
            u64LE(1),           // relay_nonce: u64
          ]),
        }),
      ],
      "shielded_pool::deposit (0.1 SOL)"
    );
    if (!depositResult.ok) {
      console.error("\nABORT: deposit failed. Cannot proceed — smoke root requires commitment at leaf_index=0.");
      process.exit(1);
    }

    // ── Step 2: flush_epoch ─────────────────────────────────────────────────

    console.log("\nStep 2: shielded_pool::flush_epoch ...");
    const vrfHash = randomBytes(32);
    const flushResult = await send(
      connection,
      wallet,
      [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }),
        new TransactionInstruction({
          programId: SHIELDED_POOL,
          keys: [
            { pubkey: wallet.publicKey, isSigner: true,  isWritable: false }, // authority
            { pubkey: poolState,        isSigner: false, isWritable: true  }, // state
          ],
          data: Buffer.concat([
            disc("flush_epoch"),
            SMOKE_ROOT,  // new_root: must match proof's public_inputs[18]
            u16LE(1),    // inserted_count: must equal epoch_commitments.len()
            vrfHash,     // vrf_randomness_hash: must be non-zero
          ]),
        }),
      ],
      "shielded_pool::flush_epoch (root = smoke_root)"
    );
    if (!flushResult.ok) {
      console.error("\nABORT: flush_epoch failed. Cannot proceed to withdraw.");
      process.exit(1);
    }

    const poolAfterFlush = await checkPoolState(connection, poolState);
    const rootMatch = poolAfterFlush.currentRoot.equals(SMOKE_ROOT);
    console.log(`\n  Post-flush check:`);
    console.log(`    next_index:   ${poolAfterFlush.nextIndex} (expected 1)`);
    console.log(`    current_root: ${poolAfterFlush.currentRoot.toString("hex")}`);
    console.log(`    root_match:   ${rootMatch ? "YES ✓" : "NO — mismatch!"}`);
    if (!rootMatch) {
      console.error("\nABORT: on-chain root does not match smoke root. Withdraw will fail.");
      process.exit(1);
    }
  }

  // ── Step 3: store_withdraw_proof ─────────────────────────────────────────
  //
  // Borsh layout: proof_nonce([u8;32]) | proof_a([u8;64]) | proof_b([u8;128]) | proof_c([u8;64]) | public_inputs(19×[u8;32])
  // Fresh random proof_nonce per run; passed to withdraw as WithdrawArgs.proof_nonce.

  console.log("\nStep 3: shielded_pool::store_withdraw_proof ...");
  const proofNonce = randomBytes(32);
  const [proofDataPda] = pda([PROOF_DATA_SEED, wallet.publicKey.toBytes(), proofNonce], SHIELDED_POOL);
  console.log(`  proof_nonce:    ${proofNonce.toString("hex")}`);
  console.log(`  proof_data PDA: ${proofDataPda.toBase58()}`);

  const storeResult = await send(
    connection,
    wallet,
    [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }),
      new TransactionInstruction({
        programId: SHIELDED_POOL,
        keys: [
          { pubkey: wallet.publicKey, isSigner: true,  isWritable: true  }, // authority
          { pubkey: proofDataPda,     isSigner: false, isWritable: true  }, // proof_data (init)
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: Buffer.concat([
          disc("store_withdraw_proof"),
          proofNonce,   // proof_nonce: [u8; 32]
          PROOF_A,      // proof_a: [u8; 64]
          PROOF_B,      // proof_b: [u8; 128]
          PROOF_C,      // proof_c: [u8; 64]
          PUBLIC_SIGNALS, // public_inputs: [[u8;32];19] = 608 bytes
        ]),
      }),
    ],
    "shielded_pool::store_withdraw_proof"
  );
  if (!storeResult.ok) {
    console.error("\nABORT: store_withdraw_proof failed.");
    process.exit(1);
  }

  // Confirm proof PDA exists and is unconsumed
  const proofPdaInfo = await connection.getAccountInfo(proofDataPda);
  if (!proofPdaInfo) {
    console.error("\nABORT: proof PDA not found after store_withdraw_proof.");
    process.exit(1);
  }
  // consumed flag is at offset: disc(8)+auth(32)+kind(1)+a(64)+b(128)+c(64)+inputs(608) = 905, + 0 bytes = 905
  // Actually: 8+32+1+64+128+64+(19*32)+1+1 layout per ProofData::SPACE=908
  // consumed is at offset: 8+32+1+64+128+64+608 = 905
  const consumed = proofPdaInfo.data[905];
  console.log(`\n  proof PDA size: ${proofPdaInfo.data.length} bytes (expected 908)`);
  console.log(`  consumed flag:  ${consumed} (expected 0 = false)`);
  if (consumed !== 0) {
    console.error("\nABORT: proof PDA is already consumed.");
    process.exit(1);
  }

  // ── Step 4: withdraw ──────────────────────────────────────────────────────
  //
  // WithdrawArgs Borsh layout (144 bytes):
  //   root([u8;32]) | nullifier_hash([u8;32]) | denomination_lamports(u64 LE) |
  //   stealth_address([u8;32]) | relay_nonce(u64 LE) | proof_nonce([u8;32])
  //
  // Compute budget: 1_400_000 CU — BN254 Groth16 pairing for withdraw_ring (nPublic=19)
  // requires ~220k–260k CU plus 3 CPI calls to nullifier_registry.

  console.log("\nStep 4: shielded_pool::withdraw (on-chain Groth16 verifier) ...");
  console.log("  Compute budget: 1,400,000 CU");
  console.log("  If this passes, on-chain Groth16 pairing has been exercised.");

  const withdrawArgs = Buffer.concat([
    SMOKE_ROOT,                          // root: must match historical_roots entry
    NULLIFIER_HASH,                      // nullifier_hash: must match proof.public_inputs[17]
    u64LE(100_000_000n),                 // denomination_lamports: 0.1 SOL
    wallet.publicKey.toBytes(),          // stealth_address: smoke placeholder
    u64LE(1n),                           // relay_nonce
    proofNonce,                          // proof_nonce: locates the proof PDA
  ]);

  const withdrawResult = await send(
    connection,
    wallet,
    [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
      new TransactionInstruction({
        programId: SHIELDED_POOL,
        keys: [
          { pubkey: wallet.publicKey, isSigner: true,  isWritable: true  }, // relay
          { pubkey: poolState,        isSigner: false, isWritable: true  }, // state
          { pubkey: nullifierPda,     isSigner: false, isWritable: true  }, // nullifier (CPI target)
          { pubkey: registryConfig,   isSigner: false, isWritable: false }, // registry_config
          { pubkey: registryWriter,   isSigner: false, isWritable: false }, // registry_writer (shielded_pool PDA)
          { pubkey: NULL_REGISTRY,    isSigner: false, isWritable: false }, // nullifier_registry_program
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: proofDataPda,     isSigner: false, isWritable: true  }, // proof_data (consumed after)
        ],
        data: Buffer.concat([disc("withdraw"), withdrawArgs]),
      }),
    ],
    "shielded_pool::withdraw"
  );

  // ── Final report ──────────────────────────────────────────────────────────

  const balanceAfter = await connection.getBalance(wallet.publicKey);
  console.log("\n=== C2H Round-Trip Result ===\n");

  if (withdrawResult.ok) {
    console.log("RESULT: FULL ROUND-TRIP PASSED");
    console.log("  deposit           → OK");
    console.log("  flush_epoch       → OK (smoke root recorded on-chain)");
    console.log("  store_proof       → OK (ProofData PDA created)");
    console.log("  withdraw          → OK (on-chain Groth16 pairing exercised)");
    console.log("\n  On-chain Groth16 BN254 verification is CONFIRMED working on devnet.");
    console.log("  Note: DEV/TEST trusted setup only — not production-ready.");
  } else {
    // Classify the failure
    const logsStr = (withdrawResult.logs ?? []).join(" ");
    let reason = "UNKNOWN";
    if (logsStr.includes("UnknownRoot") || logsStr.includes("0x1777")) reason = "UnknownRoot — root not in historical_roots";
    else if (logsStr.includes("Groth16VerificationFailed") || logsStr.includes("0x1779")) reason = "Groth16VerificationFailed — pairing check failed";
    else if (logsStr.includes("ProofAccountConsumed") || logsStr.includes("0x177a")) reason = "ProofAccountConsumed — nonce was already used";
    else if (logsStr.includes("WrongProofKind") || logsStr.includes("0x177b")) reason = "WrongProofKind — circuit_kind mismatch";
    else if (logsStr.includes("ProofAccountOwnerMismatch")) reason = "ProofAccountOwnerMismatch";
    else if (logsStr.includes("ComputationalBudgetExceeded")) reason = "ComputationalBudgetExceeded — increase CU limit";
    else if (logsStr.includes("0x1") || logsStr.includes("InsufficientFunds")) reason = "InsufficientFunds";
    else reason = logsStr.substring(0, 200);

    console.log("RESULT: WITHDRAW FAILED");
    console.log(`  exact failure reason: ${reason}`);
    console.log("  deposit      → OK");
    console.log("  flush_epoch  → OK");
    console.log("  store_proof  → OK");
    console.log(`  withdraw     → FAIL (${reason})`);
    console.log("\n  On-chain Groth16 pairing was NOT confirmed.");
  }

  console.log(`\nBalance before: ${(balanceBefore / 1e9).toFixed(9)} SOL`);
  console.log(`Balance after:  ${(balanceAfter / 1e9).toFixed(9)} SOL`);
  console.log(`Net cost:       ${((balanceBefore - balanceAfter) / 1e9).toFixed(9)} SOL`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
