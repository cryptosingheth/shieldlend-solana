// scripts/setup-devnet-wallet.mjs
// Helper: create a fresh Solana keypair JSON at the standard Solana CLI path.
//
// Why this exists: scripts/devnet-fullround.mjs and devnet-wsol-umbra-roundtrip.mjs
// load a keypair from ~/.config/solana/id.json. On a fresh checkout (especially
// on Windows where Solana CLI isn't typically installed), that file doesn't
// exist. This script generates one without requiring the full Solana CLI.
//
// Usage:
//   node scripts/setup-devnet-wallet.mjs                  # writes to default path
//   node scripts/setup-devnet-wallet.mjs --force          # overwrite if exists
//   node scripts/setup-devnet-wallet.mjs --out=<absPath>  # custom file location
//
// After running:
//   1. Visit https://faucet.solana.com
//   2. Paste the printed address
//   3. Request 2 SOL
//   4. Run: SKIP_C2H=1 node scripts/devnet-wsol-umbra-roundtrip.mjs
//
// SECURITY: the generated key is plaintext on disk. Use this wallet for devnet
// funds only. Never deposit mainnet SOL into a keypair created by this script.

import { writeFileSync, existsSync, mkdirSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Keypair, Connection } = require("@solana/web3.js");

// ─── Args ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const force = args.includes("--force");
const customPath = args.find((a) => a.startsWith("--out="))?.slice("--out=".length);

const targetPath = customPath || path.join(homedir(), ".config", "solana", "id.json");
const targetDir = path.dirname(targetPath);

// ─── Refuse to overwrite ──────────────────────────────────────────────────────

if (existsSync(targetPath) && !force) {
  console.error("");
  console.error(`  ❌ Wallet already exists at: ${targetPath}`);
  console.error("");
  console.error("  Refusing to overwrite. Options:");
  console.error("    • Use the existing wallet — just run the devnet scripts");
  console.error("    • Pass --force to overwrite (DESTROYS the existing keypair, no recovery)");
  console.error("    • Pass --out=<path> to write a separate wallet to a different location");
  console.error("");
  process.exit(1);
}

// ─── Generate + write ─────────────────────────────────────────────────────────

mkdirSync(targetDir, { recursive: true });

const kp = Keypair.generate();
const json = JSON.stringify(Array.from(kp.secretKey));
writeFileSync(targetPath, json);

// Restrict to owner-read on Unix-ish systems. On Windows this is a no-op.
try {
  chmodSync(targetPath, 0o600);
} catch {
  // chmod is unsupported on Windows; ACLs not changed
}

// ─── Report + next steps ──────────────────────────────────────────────────────

const address = kp.publicKey.toBase58();
console.log("");
console.log("  ✓ Devnet wallet created");
console.log(`     path:    ${targetPath}`);
console.log(`     address: ${address}`);
console.log("");
console.log("  Next steps:");
console.log("");
console.log("    1. Fund this wallet on Solana devnet (free):");
console.log(`       a. Open https://faucet.solana.com`);
console.log(`       b. Paste the address above`);
console.log(`       c. Pick 'Devnet' and request 2 SOL`);
console.log(`       d. Wait ~10 seconds for confirmation`);
console.log("");
console.log("    2. Verify the balance landed:");
console.log(`       node -e \"const { Connection, PublicKey } = require('@solana/web3.js'); new Connection('https://api.devnet.solana.com').getBalance(new PublicKey('${address}')).then(b => console.log((b/1e9).toFixed(4), 'SOL'))\"`);
console.log("");
console.log("    3. Run the wSOL Umbra round-trip script:");
console.log("       SKIP_C2H=1 node scripts/devnet-wsol-umbra-roundtrip.mjs");
console.log("");
console.log("       (SKIP_C2H=1 skips the Phase 1 step that fails on re-runs because");
console.log("        the smoke-vector nullifier has already been consumed on devnet.)");
console.log("");
console.log("  ⚠️  SECURITY:");
console.log(`     This wallet's private key is plaintext at ${targetPath}.`);
console.log("     • Use ONLY for devnet test funds");
console.log("     • Never deposit mainnet SOL into this wallet");
console.log("     • Anyone with disk access can spend from this wallet");
console.log("");

// Best-effort: print current balance if one is already present (e.g. user re-ran
// with --force and the address was previously funded). Doesn't fail on RPC errors.
try {
  const conn = new Connection("https://api.devnet.solana.com", "confirmed");
  const balance = await conn.getBalance(kp.publicKey);
  console.log(`  Current balance: ${(balance / 1e9).toFixed(4)} SOL (0 is expected for a fresh wallet)`);
  console.log("");
} catch {
  // RPC unreachable — skip the balance check silently
}
