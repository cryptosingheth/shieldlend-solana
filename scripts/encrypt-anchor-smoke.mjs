#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const args = new Set(process.argv.slice(2));
const live = args.has("--live");
const strict = args.has("--strict");
const repoRoot = process.cwd();
const localForkPath = join(repoRoot, "vendor", "encrypt-anchor-anchor032");

function run(command, commandArgs, options = {}) {
  return spawnSync(command, commandArgs, {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    ...options,
  });
}

function log(status, message) {
  console.log(`${status.padEnd(5)} ${message}`);
}

function summarizeCargo(stderr) {
  const keep = [
    "error[",
    "mismatched types",
    "expected `solana_account_info::AccountInfo",
    "found `__AccountInfo",
    "multiple different versions of crate `solana_account_info`",
    "failed to get",
    "network failure",
    "Could not resolve host",
    "could not compile",
  ];
  const lines = stderr
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => keep.some((needle) => line.includes(needle)));

  return [...new Set(lines)].slice(0, 16);
}

function isKnownAccountInfoBlocker(stderr) {
  return (
    stderr.includes("multiple different versions of crate `solana_account_info`") &&
    stderr.includes("expected `solana_account_info::AccountInfo") &&
    stderr.includes("found `__AccountInfo")
  );
}

function isNetworkBlocker(stderr) {
  return (
    stderr.includes("Could not resolve host") ||
    stderr.includes("failed to resolve address") ||
    stderr.includes("network failure")
  );
}

function writeProbe(tempDir, encryptAnchorDependency) {
  mkdirSync(join(tempDir, "src"));
  writeFileSync(
    join(tempDir, "Cargo.toml"),
    `[package]
name = "shieldlend_encrypt_anchor_probe"
version = "0.1.0"
edition = "2021"

[dependencies]
anchor-lang = "0.32.1"
encrypt-types = { git = "https://github.com/dwallet-labs/encrypt-pre-alpha" }
encrypt-dsl = { package = "encrypt-solana-dsl", git = "https://github.com/dwallet-labs/encrypt-pre-alpha" }
${encryptAnchorDependency}
`
  );
  writeFileSync(
    join(tempDir, "src/lib.rs"),
    `use anchor_lang::prelude::*;
use encrypt_anchor::EncryptContext;
use encrypt_types::encrypted::Uint64;

pub fn construct_context<'info>(
    encrypt_program: AccountInfo<'info>,
    config: AccountInfo<'info>,
    deposit: AccountInfo<'info>,
    cpi_authority: AccountInfo<'info>,
    caller_program: AccountInfo<'info>,
    network_encryption_key: AccountInfo<'info>,
    payer: AccountInfo<'info>,
    event_authority: AccountInfo<'info>,
    system_program: AccountInfo<'info>,
    cpi_authority_bump: u8,
) -> EncryptContext<'info> {
    EncryptContext {
        encrypt_program,
        config,
        deposit,
        cpi_authority,
        caller_program,
        network_encryption_key,
        payer,
        event_authority,
        system_program,
        cpi_authority_bump,
    }
}

pub fn read_verified_u64<'a>(request_data: &'a [u8], digest: &[u8; 32]) -> Result<&'a u64> {
    encrypt_anchor::accounts::read_decrypted_verified::<Uint64>(request_data, digest)
        .map_err(|_| error!(anchor_lang::error::ErrorCode::ConstraintRaw))
}
`
  );
}

function runProbe(label, encryptAnchorDependency) {
  const temp = mkdtempSync(join(tmpdir(), "shieldlend-encrypt-anchor-"));
  try {
    writeProbe(temp, encryptAnchorDependency);
    log("run", `cargo check ${label} in ${temp}`);
    const cargo = run("cargo", ["check", "--quiet"], {
      cwd: temp,
      timeout: 180_000,
    });
    return { cargo, temp };
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

log(
  "ok",
  "official docs dependency pattern: encrypt-types + encrypt-solana-dsl + encrypt-anchor + anchor-lang 0.32"
);
log("ok", "official program ID: 4ebfzWdKnrnGseuQpezXdG8yCdHqwQ1SSBHD3bWArND8");

if (live) {
  log("run", "checking live gRPC CreateInput through scripts/check-encrypt.mjs --live");
  const liveCheck = run("node", ["scripts/check-encrypt.mjs", "--live"], {
    cwd: repoRoot,
    stdio: "inherit",
    timeout: 60_000,
  });
  if (liveCheck.status !== 0) {
    log("miss", "live gRPC CreateInput failed; see output above");
    process.exit(liveCheck.status ?? 1);
  }
}

const official = runProbe(
  "official encrypt-anchor probe",
  'encrypt-anchor = { git = "https://github.com/dwallet-labs/encrypt-pre-alpha" }'
);
const officialSummary = summarizeCargo(official.cargo.stderr);
const officialBlocked = isKnownAccountInfoBlocker(official.cargo.stderr);

if (official.cargo.status === 0) {
  log("ok", "official encrypt-anchor compiled against Anchor 0.32.1 in the CPI-boundary probe");
} else if (officialBlocked) {
  log(
    "warn",
    "official encrypt-anchor is still blocked at the Anchor 0.32.1 CPI boundary by the solana_account_info crate-family mismatch"
  );
  for (const line of officialSummary) console.log(`      ${line}`);
} else if (isNetworkBlocker(official.cargo.stderr)) {
  log("warn", "could not fetch official encrypt-anchor dependencies; rerun with network access");
  for (const line of officialSummary) console.log(`      ${line}`);
  process.exit(strict ? 1 : 0);
} else {
  log("miss", "official encrypt-anchor probe failed with an unrecognized compiler error");
  for (const line of officialSummary.length ? officialSummary : official.cargo.stderr.split("\n").slice(-20)) {
    if (line.trim()) console.log(`      ${line}`);
  }
  process.exit(1);
}

const local = runProbe(
  "local Anchor 0.32 compatibility fork",
  `encrypt-anchor = { path = "${localForkPath}" }`
);
const localSummary = summarizeCargo(local.cargo.stderr);

if (local.cargo.status !== 0) {
  if (isNetworkBlocker(local.cargo.stderr)) {
    log("warn", "local compatibility fork could not finish because git dependencies were unavailable");
    for (const line of localSummary) console.log(`      ${line}`);
    process.exit(strict ? 1 : 0);
  }

  log("miss", "local Anchor 0.32 compatibility fork failed to compile");
  for (const line of localSummary.length ? localSummary : local.cargo.stderr.split("\n").slice(-20)) {
    if (line.trim()) console.log(`      ${line}`);
  }
  process.exit(1);
}

log(
  "ok",
  "local vendored encrypt-anchor Anchor 0.32 compatibility fork compiles; ShieldLend can keep a compile-wired CPI request/reveal path without downgrading Anchor"
);
if (officialBlocked) {
  log(
    "note",
    "upstream remains incompatible today; ShieldLend must keep on-chain Encrypt/FHE claims bounded to local compile wiring while gRPC CreateInput stays the only live path"
  );
}
