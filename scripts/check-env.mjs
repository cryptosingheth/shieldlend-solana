import { spawnSync } from "node:child_process";
import process from "node:process";

const checks = [
  { name: "Rust cargo", cmd: "cargo", args: ["--version"], required: true },
  { name: "Solana CLI", cmd: "solana", args: ["--version"], required: true },
  { name: "Anchor CLI", cmd: "anchor", args: ["--version"], required: true },
  { name: "Circom", cmd: "circom", args: ["--version"], required: true },
  { name: "snarkjs package", cmd: "node", args: ["-e", "require.resolve('snarkjs')"], required: true },
];

const envChecks = [
  { name: "MagicBlock Router RPC", key: "NEXT_PUBLIC_MAGICBLOCK_ROUTER_RPC_URL", required: true, defaultValue: "https://devnet-router.magicblock.app" },
  { name: "MagicBlock Private Payments API", key: "NEXT_PUBLIC_MAGICBLOCK_PRIVATE_PAYMENTS_URL", required: true },
  { name: "IKA gRPC URL", key: "IKA_GRPC_URL", required: true, defaultValue: "https://pre-alpha-dev-1.ika.ika-network.net:443" },
  { name: "Encrypt gRPC URL", key: "ENCRYPT_GRPC_URL", required: true, defaultValue: "https://pre-alpha-dev-1.encrypt.ika-network.net:443" },
  { name: "Umbra network", key: "UMBRA_NETWORK", required: false },
];

let failed = false;

for (const check of checks) {
  const result = spawnSync(check.cmd, check.args, { encoding: "utf8" });
  if (result.status === 0) {
    console.log(`ok   ${check.name}: ${result.stdout.trim() || result.stderr.trim()}`);
  } else {
    failed ||= check.required;
    console.log(`miss ${check.name}: ${check.cmd} ${check.args.join(" ")} failed or is not installed`);
  }
}

for (const check of envChecks) {
  const value = process.env[check.key] ?? check.defaultValue;
  if (value) {
    console.log(`ok   ${check.name}: ${value}${process.env[check.key] ? "" : " (default)"}`);
  } else {
    failed ||= check.required;
    console.log(`${check.required ? "miss" : "skip"} ${check.name}: ${check.key} is not set`);
  }
}

if (failed) {
  console.error("\nEnvironment is not ready for end-to-end deployment/testing.");
  process.exit(1);
}

console.log("\nEnvironment is ready for the configured end-to-end checks.");
