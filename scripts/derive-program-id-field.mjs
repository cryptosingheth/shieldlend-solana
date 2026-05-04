import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const FIELD_SIZE = BigInt(
  "21888242871839275222246405745257275088548364400416034343698204186575808495617"
);
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function parseArgs(argv) {
  const args = {
    anchor: "Anchor.toml",
    program: "shielded_pool",
    programId: undefined,
    write: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--anchor") args.anchor = argv[++i];
    else if (arg === "--program") args.program = argv[++i];
    else if (arg === "--program-id") args.programId = argv[++i];
    else if (arg === "--write") args.write = true;
    else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  return args;
}

function base58Decode(input) {
  let value = 0n;
  for (const char of input) {
    const digit = BASE58_ALPHABET.indexOf(char);
    if (digit === -1) throw new Error(`invalid base58 character: ${char}`);
    value = value * 58n + BigInt(digit);
  }

  const bytes = [];
  while (value > 0n) {
    bytes.push(Number(value & 0xffn));
    value >>= 8n;
  }
  bytes.reverse();

  for (const char of input) {
    if (char === "1") bytes.unshift(0);
    else break;
  }

  if (bytes.length !== 32) {
    throw new Error(`expected a 32-byte Solana program id, got ${bytes.length} bytes`);
  }

  return Uint8Array.from(bytes);
}

function bytesToBigInt(bytes) {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}

function readProgramIdFromAnchor(anchorPath, programName) {
  const toml = readFileSync(anchorPath, "utf8");
  const sectionMatch = toml.match(/\[programs\.localnet\]([\s\S]*?)(?:\n\[|$)/);
  if (!sectionMatch) throw new Error("Anchor.toml does not contain [programs.localnet]");

  const linePattern = new RegExp(`^\\s*${programName}\\s*=\\s*"([^"]+)"\\s*$`, "m");
  const programMatch = sectionMatch[1].match(linePattern);
  if (!programMatch) {
    throw new Error(`Anchor.toml does not contain [programs.localnet].${programName}`);
  }

  return programMatch[1];
}

export function deriveProgramIdField(programId) {
  const decoded = base58Decode(programId);
  const integer = bytesToBigInt(decoded);
  return {
    integer,
    fieldElement: integer % FIELD_SIZE,
  };
}

function writeSharedConstants({ programName, programId, fieldElement, source }) {
  const constantsJson = {
    field: "bn254",
    modulus: FIELD_SIZE.toString(),
    encoding:
      "Decode the Solana base58 program id to 32 bytes, interpret those bytes as a big-endian unsigned integer, then reduce modulo the BN254 scalar field.",
    programs: {
      [programName]: {
        programId,
        fieldElement: fieldElement.toString(),
        source,
        status: "localnet-id-needs-deployment-confirmation",
      },
    },
  };

  writeFileSync(
    "circuits/constants.json",
    `${JSON.stringify(constantsJson, null, 2)}\n`,
    "utf8"
  );
  writeFileSync(
    "circuits/constants.circom",
    `pragma circom 2.1.6;\n\nfunction ShieldedPoolProgramIdField() {\n    return ${fieldElement.toString()};\n}\n`,
    "utf8"
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const anchorPath = resolve(args.anchor);
  const programId =
    args.programId ?? readProgramIdFromAnchor(anchorPath, args.program);
  const { integer, fieldElement } = deriveProgramIdField(programId);
  const source = args.programId
    ? "manual --program-id"
    : `${args.anchor} [programs.localnet].${args.program}`;

  if (args.write) {
    writeSharedConstants({
      programName: args.program,
      programId,
      fieldElement,
      source,
    });
  }

  console.log(
    JSON.stringify(
      {
        program: args.program,
        programId,
        encoding:
          "base58 decode -> 32-byte big-endian integer -> mod BN254 scalar field",
        integer: integer.toString(),
        fieldElement: fieldElement.toString(),
        wroteFiles: args.write,
      },
      null,
      2
    )
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
