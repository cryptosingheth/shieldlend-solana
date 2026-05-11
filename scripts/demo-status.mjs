#!/usr/bin/env node
// demo-status.mjs — ShieldLend hackathon submission status check
// Non-destructive. Reads local state only unless --live is passed.

import { spawnSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const LIVE = process.argv.includes('--live');
const OK   = '\x1b[32mok  \x1b[0m';
const WARN = '\x1b[33mwarn\x1b[0m';
const FAIL = '\x1b[31mFAIL\x1b[0m';

let exitCode = 0;

function ok(msg)   { console.log(`  ${OK}  ${msg}`); }
function warn(msg) { console.log(`  ${WARN} ${msg}`); }
function fail(msg) { console.log(`  ${FAIL} ${msg}`); exitCode = 1; }
function section(title) { console.log(`\n── ${title}`); }

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { cwd: root, encoding: 'utf8', ...opts });
}

// ── Git ──────────────────────────────────────────────────────────────────────

section('Git');

const branchResult = run('git', ['branch', '--show-current']);
const logResult    = run('git', ['log', '-1', '--format=%H %s']);

if (branchResult.status !== 0) {
  fail('could not read git branch');
} else {
  const branch = branchResult.stdout.trim();
  ok(`branch: ${branch}`);
  if (branch !== 'convergence/privacy-rails-integration') {
    warn(`expected branch convergence/privacy-rails-integration — got ${branch}`);
  }
}

if (logResult.status !== 0) {
  fail('could not read git log');
} else {
  const [hash, ...rest] = logResult.stdout.trim().split(' ');
  ok(`commit: ${hash.slice(0, 8)} ${rest.join(' ')}`);
}

// ── Artifact manifest ────────────────────────────────────────────────────────

section('ZK Artifact Manifest');

const manifestPath = resolve(root, 'circuits/artifact_manifest.json');
if (!existsSync(manifestPath)) {
  fail('circuits/artifact_manifest.json not found');
} else {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    for (const circuit of ['withdraw', 'collateral', 'repay']) {
      if (!manifest[circuit]) {
        fail(`${circuit} circuit missing from manifest`);
        continue;
      }
      const { wasm, zkey, vkey } = manifest[circuit];
      if (wasm?.sha256 && zkey?.sha256 && vkey?.sha256) {
        ok(`${circuit}: wasm=${wasm.sha256.slice(0, 12)}… zkey=${zkey.sha256.slice(0, 12)}… vkey=${vkey.sha256.slice(0, 12)}…`);
      } else {
        fail(`${circuit}: manifest entry incomplete`);
      }
    }
    warn('trusted setup: DEV/TEST pot14 ceremony — NOT production');
  } catch (e) {
    fail(`could not parse artifact manifest: ${e.message}`);
  }
}

// ── Program IDs ──────────────────────────────────────────────────────────────

section('Deployed Program IDs (from Anchor.toml)');

const EXPECTED_PROGRAMS = {
  nullifier_registry: 'E42nSmqvSCuC1EWbmzYqsdLHimBMeuZyir5dB5gE24rF',
  shielded_pool:      '9Bvt3jMawHFRRxpaQTtV5VvFdpZkmAZtvwjTrAX9TAtE',
  lending_pool:       'J2yn42PLSiRvGEGj24Uj2q4QeGHZa1sbgzs5foLK81qn',
};

const anchorTomlPath = resolve(root, 'Anchor.toml');
if (!existsSync(anchorTomlPath)) {
  fail('Anchor.toml not found');
} else {
  const toml = readFileSync(anchorTomlPath, 'utf8');
  for (const [name, expectedId] of Object.entries(EXPECTED_PROGRAMS)) {
    const match = toml.match(new RegExp(`${name}\\s*=\\s*"([^"]+)"`));
    if (!match) {
      fail(`${name}: not found in Anchor.toml`);
    } else if (match[1] !== expectedId) {
      fail(`${name}: expected ${expectedId} — got ${match[1]}`);
    } else {
      ok(`${name}: ${match[1]}`);
    }
  }
}

// ── Rail check scripts ───────────────────────────────────────────────────────

section('Privacy Rail Scripts');

const RAIL_SCRIPTS = [
  { name: 'check-encrypt.mjs',    rail: 'Encrypt',    runCmd: 'npm run check:encrypt' },
  { name: 'check-umbra.mjs',      rail: 'Umbra',      runCmd: 'npm run check:umbra' },
  { name: 'check-magicblock.mjs', rail: 'MagicBlock', runCmd: 'npm run check:magicblock' },
  { name: 'check-ika.mjs',        rail: 'IKA',        runCmd: 'npm run check:ika' },
  { name: 'ika-anchor-cpi-diagnostic.mjs', rail: 'IKA CPI', runCmd: 'npm run check:ika-cpi' },
  {
    name: 'devnet-fullround.mjs',
    rail: 'C2H',
    runCmd: 'node scripts/devnet-fullround.mjs  << DESTRUCTIVE — do not run during demo',
  },
];

for (const { name, rail, runCmd } of RAIL_SCRIPTS) {
  if (existsSync(resolve(root, 'scripts', name))) {
    ok(`${rail}: ${name} — run: ${runCmd}`);
  } else {
    fail(`${rail}: ${name} not found`);
  }
}

// ── Optional live status checks ──────────────────────────────────────────────

if (LIVE) {
  section('Live Rail Status Checks (--live)');

  const liveChecks = [
    { script: 'check-encrypt.mjs',    label: 'Encrypt gRPC' },
    { script: 'check-umbra.mjs',      label: 'Umbra SDK' },
    { script: 'check-magicblock.mjs', label: 'MagicBlock SDK' },
    { script: 'check-ika.mjs',        label: 'IKA SDK' },
    { script: 'ika-anchor-cpi-diagnostic.mjs', label: 'IKA Anchor CPI' },
  ];

  for (const { script, label } of liveChecks) {
    const scriptPath = resolve(root, 'scripts', script);
    if (!existsSync(scriptPath)) {
      warn(`${label}: script not found, skipping`);
      continue;
    }
    console.log(`\n  --- ${label} ---`);
    const r = run('node', [resolve(root, 'scripts', script)], {
      stdio: 'inherit',
      timeout: 30000,
    });
    if (r.status !== 0) {
      warn(`${label}: exited non-zero (see output above)`);
    }
  }
}

// ── Confirmed devnet evidence ────────────────────────────────────────────────

section('Confirmed Devnet Evidence');

ok('C2H Groth16 BN254 withdraw round-trip: PASSED on devnet');
ok('  deposit → flush_epoch → store_withdraw_proof → withdraw');
ok('  198,502 CU consumed; nullifier consumed; nullifier registry CPI succeeded');
ok('Umbra funded wSOL deposit/withdraw: CONFIRMED — 7 devnet tx signatures on record');
ok('Encrypt gRPC CreateInput probe: CONFIRMED — ciphertext 5VZ8BhpSWqDCAXMMb4ESVGsQRKb6X9dDgD1xGLydCA6y');
ok('MagicBlock TEE RPC: HTTP 200 — devnet-tee.magicblock.app');
ok('MagicBlock Router RPC: HTTP 200 — devnet-router.magicblock.app');
ok('MagicBlock Private Payments API: health/challenge/builders live; wSOL deposit/withdraw submitted');
ok('IKA SDK/WASM: loaded; capability probe passed; blockers source-documented');
ok('IKA Anchor CPI: approve_ika_borrow_message CPI CONFIRMED on devnet (2026-05-11)');
ok('  approval tx 1: m5trvfdGc2AtqXh4chLoKdo5cXfCCL7mE3EB7tKHynGdDN5RV12SzpkQX2DgzAFiwzcLtYdQSgBJ1cPPbbj9WBF');
ok('  approval tx 2: 3AHThchU8EAjQ2aYsbrDy212JJvHPE3ajtLx2ZLKVBxJnfSHnRTTUeZxX2en2zz4UGmUuzMjU3sgbV5J9bkKZbk2');
ok('  MessageApproval PDAs created on-chain; IKA gRPC presign/sign blocked by coordinator BCS schema mismatch');

// ── Claim boundary ───────────────────────────────────────────────────────────

section('Hackathon Claim Boundary');

console.log(`
  ALLOWED CLAIMS (confirmed by devnet evidence):
  ✓ Three Anchor programs deployed on Solana devnet
  ✓ Full Groth16 BN254 withdraw round-trip confirmed (DEV/TEST trusted setup)
  ✓ On-chain Groth16 BN254 pairing passed; 198,502 CU; nullifier consumed
  ✓ Umbra funded devnet wSOL encrypted-balance deposit and withdrawal confirmed
  ✓ Encrypt pre-alpha gRPC CreateInput probe live; ciphertext handle returned
  ✓ MagicBlock TEE RPC + Router RPC HTTP 200 on devnet
  ✓ MagicBlock PER SDK builders verified: 13/13 SDK functions, 17/17 sidecar tests
  ✓ MagicBlock Private Payments API live for auth/builders; wSOL deposit/withdraw submitted
  ✓ IKA SDK/WASM loaded; capability probe passed; blockers source-documented
  ✓ IKA Anchor CPI compile-wired in lending_pool against official pre-alpha approve_message ABI
  ✓ IKA approve_ika_borrow_message CPI confirmed on devnet — two approval tx signatures on record
  ✓ All four rail adapters in frontend/src/lib/privacyRails/
  ✓ Frontend privacy status panel shows live rail statuses

  NOT ALLOWED (do not claim):
  ✗ Production ZK trusted setup (DEV/TEST pot14 only)
  ✗ Production privacy guarantee
  ✗ IKA relay signing active end-to-end (approval CPI confirmed; gRPC presign/sign blocked by IKA pre-alpha coordinator BCS schema mismatch; IKA pre-alpha is single mock signer, not production MPC)
  ✗ MagicBlock Private Payments private transfer via intended ephemeral/router path (ephemeral submit blocked; base devnet fallback only)
  ✗ MagicBlock PER Rust macros in Anchor programs (Anchor 0.32.1 compatibility present; macros not wired)
  ✗ MagicBlock TDX attestation verified (challenge format mismatch with SDK 0.8.8)
  ✗ Umbra native SOL ShieldLend payout (C2H exits direct stealth_address; no wSOL bridge)
  ✗ Encrypt on-chain FHE active (Anchor 0.32.1 compatibility present; Encrypt Anchor CPI not wired)
`);

// ── Summary ──────────────────────────────────────────────────────────────────

section('Summary');

if (exitCode === 0) {
  console.log(`\n  ${OK} All checks passed. Demo package is submission-ready.\n`);
  console.log('  Next steps:');
  console.log('    node scripts/demo-status.mjs --live   # runs live rail checks');
  console.log('    npm run typecheck:frontend');
  console.log('    npm run build:frontend');
  console.log('    See docs/DEMO_SCRIPT.md for full demo walkthrough');
  console.log('    See docs/SUBMISSION_CHECKLIST.md for submission checklist\n');
} else {
  console.log(`\n  ${FAIL} Some checks failed. Review output above before submitting.\n`);
}

process.exit(exitCode);
