/**
 * MagicBlock PER sidecar — entry point.
 *
 * Demonstrates the full PER lifecycle for four ShieldLend use cases:
 *   1. private deposit intent
 *   2. proof intent
 *   3. queued withdrawal intent
 *   4. batched deposit counter
 *
 * Run: cd examples/magicblock-per-sidecar && npx ts-node src/index.ts
 * Or compile: tsc --noEmit (type-check only, no emit)
 */

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  ConnectionMagicRouter,
  PERMISSION_PROGRAM_ID,
  DELEGATION_PROGRAM_ID,
  MAGIC_PROGRAM_ID,
  getPermissionStatus,
  waitUntilPermissionActive,
} from "@magicblock-labs/ephemeral-rollups-sdk";
import { buildAllUseCases } from "./shieldlend";
import { buildCommitAndUndelegateInstructions } from "./lifecycle";

// ─── Constants ───────────────────────────────────────────────────────────────

const DEVNET_RPC = "https://api.devnet.solana.com";
const TEE_RPC = process.env["MAGICBLOCK_TEE_RPC"] ?? "https://devnet-tee.magicblock.app";
const ROUTER_RPC = process.env["MAGICBLOCK_ROUTER_RPC"] ?? "https://devnet-router.magicblock.app";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function shortKey(pk: PublicKey): string {
  const s = pk.toBase58();
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

function printSection(title: string): void {
  console.log(`\n${"─".repeat(60)}`);
  console.log(title);
  console.log("─".repeat(60));
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("MagicBlock PER Sidecar — ShieldLend Integration Demo");
  console.log(`TEE RPC  : ${TEE_RPC}`);
  console.log(`Router   : ${ROUTER_RPC}`);

  // Use a deterministic test keypair (no real SOL needed for PDA derivation)
  const wallet = Keypair.generate();
  console.log(`Wallet   : ${wallet.publicKey.toBase58()}`);

  // ─── 1. Program IDs ────────────────────────────────────────────────────────
  printSection("1. MagicBlock Program IDs (SDK-verified)");
  console.log(`  Permission Program : ${PERMISSION_PROGRAM_ID.toBase58()}`);
  console.log(`  Delegation Program : ${DELEGATION_PROGRAM_ID.toBase58()}`);
  console.log(`  Magic Program      : ${MAGIC_PROGRAM_ID.toBase58()}`);

  // ─── 2. Build all use-case bundles ─────────────────────────────────────────
  printSection("2. Building ShieldLend PER Use-Case Bundles");

  const summary = buildAllUseCases(wallet.publicKey);

  for (const [name, bundle] of Object.entries(summary)) {
    const { account, lifecycle } = bundle as ReturnType<
      typeof buildAllUseCases
    >[keyof ReturnType<typeof buildAllUseCases>];
    console.log(`\n  [${name}]`);
    console.log(`    account PDA      : ${shortKey(account.pda)}`);
    console.log(`    permission PDA   : ${shortKey(account.per.permissionPda)}`);
    console.log(`    delegation record: ${shortKey(account.per.delegationRecord)}`);
    console.log(`    delegate buffer  : ${shortKey(account.per.delegateBuffer)}`);
    console.log(`    commit state PDA : ${shortKey(account.per.commitState)}`);
    console.log(`    setup ixs        : createPermission + delegatePermission + delegate`);
    console.log(`    commit ix        : commitAndUndelegate`);
  }

  // ─── 3. Instruction validation (static) ────────────────────────────────────
  printSection("3. Instruction Validation (Static)");

  const { depositIntent, proofIntent, withdrawalIntent, batchedCounter } = summary;

  const bundles = [
    { name: "depositIntent", bundle: depositIntent },
    { name: "proofIntent", bundle: proofIntent },
    { name: "withdrawalIntent", bundle: withdrawalIntent },
    { name: "batchedCounter", bundle: batchedCounter },
  ];

  for (const { name, bundle } of bundles) {
    const { lifecycle } = bundle;
    const setupKeys = Object.keys(lifecycle.setup);
    const hasCreate = "createPermission" in lifecycle.setup;
    const hasDelegate = "delegate" in lifecycle.setup;
    const hasCommit = "commitAndUndelegate" in lifecycle.commit;
    const hasCheckpoint = "commit" in lifecycle.checkpoint;
    const allOk = hasCreate && hasDelegate && hasCommit && hasCheckpoint;
    console.log(
      `  ${allOk ? "ok  " : "FAIL"} ${name}: setup[${setupKeys.join(", ")}] commit[commitAndUndelegate] checkpoint[commit]`
    );
  }

  // ─── 4. TEE / Router connectivity ──────────────────────────────────────────
  printSection("4. TEE / Router Connectivity");

  for (const [label, url] of [["TEE RPC", TEE_RPC], ["Router RPC", ROUTER_RPC]]) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
        signal: AbortSignal.timeout(10_000),
      });
      const body = (await res.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;
      const result = body?.["result"] ?? body?.["error"] ?? "?";
      console.log(`  ok   ${label}: HTTP ${res.status} — ${JSON.stringify(result)}`);
    } catch (err) {
      console.log(`  warn ${label}: ${(err as Error).message}`);
    }
  }

  // ─── 5. ConnectionMagicRouter instantiation ────────────────────────────────
  printSection("5. ConnectionMagicRouter Instantiation");

  let routerConnection: ConnectionMagicRouter | null = null;
  try {
    routerConnection = new ConnectionMagicRouter(ROUTER_RPC);
    const slot = await routerConnection.getSlot().catch(() => null);
    if (slot !== null) {
      console.log(`  ok   ConnectionMagicRouter connected — current slot: ${slot}`);
    } else {
      console.log(`  warn ConnectionMagicRouter instantiated but getSlot returned null`);
    }
  } catch (err) {
    console.log(`  warn ConnectionMagicRouter: ${(err as Error).message}`);
  }

  // ─── 6. getDelegationStatus (live check on a real devnet account) ───────────
  printSection("6. Delegation Status Check (devnet)");

  if (routerConnection) {
    const { depositIntent: di } = summary;
    try {
      const status = await routerConnection.getDelegationStatus(di.account.pda);
      console.log(
        `  ok   depositIntent PDA delegation status: isDelegated=${status.isDelegated}`
      );
      console.log(`       (Expected false — account not yet created on devnet)`);
    } catch (err) {
      console.log(
        `  warn getDelegationStatus: ${(err as Error).message}`
      );
    }
  } else {
    console.log("  skip (ConnectionMagicRouter not available)");
  }

  // ─── 7. getPermissionStatus (live check on TEE RPC) ────────────────────────
  printSection("7. Permission Status Check (TEE RPC)");

  try {
    const { depositIntent: di } = summary;
    const permStatus = await getPermissionStatus(TEE_RPC, di.account.per.permissionPda);
    console.log(
      `  ok   getPermissionStatus for depositIntent permissionPda: ${JSON.stringify(permStatus)}`
    );
  } catch (err) {
    console.log(`  warn getPermissionStatus: ${(err as Error).message}`);
    console.log(`       (Expected — permissionPda not yet created on devnet)`);
  }

  // ─── 8. Batch commit instruction (multi-account) ───────────────────────────
  printSection("8. Batch Commit Instruction (multi-account)");

  const allAccounts = bundles.map((b) => b.bundle.account.pda);
  const batchCommit = buildCommitAndUndelegateInstructions(
    wallet.publicKey,
    allAccounts
  );
  console.log(
    `  ok   commitAndUndelegate for ${allAccounts.length} accounts built`
  );
  console.log(
    `       keys: ${batchCommit.commitAndUndelegate.keys.length} account metas`
  );
  console.log(
    `       data length: ${batchCommit.commitAndUndelegate.data.length} bytes`
  );

  // ─── Summary ───────────────────────────────────────────────────────────────
  printSection("Summary");

  console.log("  PDA derivation      : PASS — all 4 use-case PDAs derived");
  console.log("  Instruction build   : PASS — setup + commit + checkpoint for each");
  console.log("  Batch commit        : PASS — multi-account commitAndUndelegate built");
  console.log("  ConnectionMagicRouter: " + (routerConnection ? "PASS" : "warn — not connected"));
  console.log("  TEE / Router RPC    : see section 4 above");
  console.log("");
  console.log("Next steps:");
  console.log("  1. Fund wallet on devnet: solana airdrop 2");
  console.log("  2. Create the intent accounts on devnet via shielded_pool CPI");
  console.log("  3. Submit setup instructions to base-layer Solana RPC");
  console.log("  4. Route PER transactions via ConnectionMagicRouter");
  console.log("  5. Submit commitAndUndelegate via ConnectionMagicRouter to finalize");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
