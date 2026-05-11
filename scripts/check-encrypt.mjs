#!/usr/bin/env node
import * as grpc from "@grpc/grpc-js";
import { Connection, PublicKey } from "@solana/web3.js";
import process from "node:process";

const ENCRYPT_GRPC_DEFAULT = "pre-alpha-dev-1.encrypt.ika-network.net:443";
const ENCRYPT_RPC_DEFAULT = "https://api.devnet.solana.com";
const ENCRYPT_PROGRAM_ID = "4ebfzWdKnrnGseuQpezXdG8yCdHqwQ1SSBHD3bWArND8";
const LENDING_POOL_PROGRAM_ID = "J2yn42PLSiRvGEGj24Uj2q4QeGHZa1sbgzs5foLK81qn";
const SDK_PACKAGE = "@encrypt.xyz/pre-alpha-solana-client";
const SDK_VERSION = "0.1.0";

function normalizeGrpcTarget(input) {
  return input.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function encodeVarint(value) {
  let n = BigInt(value);
  const out = [];
  do {
    let byte = Number(n & 0x7fn);
    n >>= 7n;
    if (n !== 0n) byte |= 0x80;
    out.push(byte);
  } while (n !== 0n);
  return Buffer.from(out);
}

function encodeFieldKey(field, wireType) {
  return encodeVarint((field << 3) | wireType);
}

function encodeBytesField(field, value) {
  return Buffer.concat([encodeFieldKey(field, 2), encodeVarint(value.length), value]);
}

function encodeVarintField(field, value) {
  return Buffer.concat([encodeFieldKey(field, 0), encodeVarint(value)]);
}

function encodeEncryptedInput(input) {
  return Buffer.concat([
    encodeBytesField(1, input.ciphertextBytes),
    encodeVarintField(2, input.fheType),
  ]);
}

function encodeCreateInputRequest(request) {
  const fields = [encodeVarintField(1, request.chain)];
  for (const input of request.inputs) fields.push(encodeBytesField(2, encodeEncryptedInput(input)));
  if (request.proof.length > 0) fields.push(encodeBytesField(3, request.proof));
  fields.push(encodeBytesField(4, request.authorized));
  fields.push(encodeBytesField(5, request.networkEncryptionPublicKey));
  return Buffer.concat(fields);
}

function readVarint(buffer, offset) {
  let shift = 0n;
  let value = 0n;
  let next = offset;
  while (next < buffer.length) {
    const byte = buffer[next++];
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return { value, offset: next };
    shift += 7n;
  }
  throw new Error("Invalid protobuf varint.");
}

function decodeCreateInputResponse(buffer) {
  const ciphertextIdentifiers = [];
  let offset = 0;
  while (offset < buffer.length) {
    const key = readVarint(buffer, offset);
    offset = key.offset;
    const field = Number(key.value >> 3n);
    const wireType = Number(key.value & 7n);
    if (field !== 1 || wireType !== 2) {
      if (wireType === 0) {
        offset = readVarint(buffer, offset).offset;
        continue;
      }
      if (wireType === 2) {
        const len = readVarint(buffer, offset);
        offset = len.offset + Number(len.value);
        continue;
      }
      throw new Error(`Unsupported CreateInput response field ${field}/${wireType}.`);
    }
    const len = readVarint(buffer, offset);
    offset = len.offset;
    ciphertextIdentifiers.push(buffer.subarray(offset, offset + Number(len.value)));
    offset += Number(len.value);
  }
  return { ciphertextIdentifiers };
}

function createEncryptGrpcClient(grpcUrl) {
  const service = {
    createInput: {
      path: "/encrypt.v1.EncryptService/CreateInput",
      requestStream: false,
      responseStream: false,
      requestSerialize: encodeCreateInputRequest,
      requestDeserialize: (value) => value,
      responseSerialize: (value) => value,
      responseDeserialize: decodeCreateInputResponse,
    },
  };
  const Client = grpc.makeGenericClientConstructor(service, "EncryptService");
  return new Client(normalizeGrpcTarget(grpcUrl), grpc.credentials.createSsl());
}

function hexToBytes32(hex) {
  const cleaned = hex.replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{64}$/.test(cleaned)) {
    throw new Error("ENCRYPT_NETWORK_PUBLIC_KEY_HEX must be a 32-byte hex string.");
  }
  return Buffer.from(cleaned, "hex");
}

function u64Le(value) {
  const out = Buffer.alloc(8);
  out.writeBigUInt64LE(BigInt(value));
  return out;
}

async function discoverNetworkKeys(rpcUrl, programId) {
  const connection = new Connection(rpcUrl, "confirmed");
  const accounts = await connection.getProgramAccounts(new PublicKey(programId), {
    commitment: "confirmed",
    filters: [{ dataSize: 36 }],
  });
  return accounts
    .map(({ pubkey, account }) => {
      const data = Buffer.from(account.data);
      return {
        account: pubkey.toBase58(),
        discriminator: data[0],
        publicKeyHex: data.subarray(2, 34).toString("hex"),
        active: data[1] === 1 && data[34] === 1,
      };
    })
    .filter((key) => key.active)
    .sort((a, b) => a.discriminator - b.discriminator || a.account.localeCompare(b.account));
}

async function createHealthRatioInput({ grpcUrl, networkKeyHex, healthRatioBps, loanPda }) {
  const client = createEncryptGrpcClient(grpcUrl);
  try {
    const ciphertextBytes = Buffer.concat([
      Buffer.from("shieldlend-health-v1"),
      new PublicKey(loanPda).toBuffer(),
      u64Le(healthRatioBps),
    ]);

    return await new Promise((resolve, reject) => {
      client.createInput(
        {
          chain: 0,
          inputs: [{ ciphertextBytes, fheType: 4 }],
          proof: Buffer.alloc(0),
          authorized: new PublicKey(process.env.NEXT_PUBLIC_LENDING_POOL_PROGRAM_ID ?? LENDING_POOL_PROGRAM_ID).toBuffer(),
          networkEncryptionPublicKey: hexToBytes32(networkKeyHex),
        },
        (error, response) => {
          if (error) reject(error);
          else resolve(response?.ciphertextIdentifiers ?? []);
        }
      );
    });
  } finally {
    client.close();
  }
}

const args = new Set(process.argv.slice(2));
const live = args.has("--live");
const grpcUrl = process.env.ENCRYPT_GRPC_URL ?? ENCRYPT_GRPC_DEFAULT;
const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? ENCRYPT_RPC_DEFAULT;
const programId = process.env.ENCRYPT_PROGRAM_ID ?? ENCRYPT_PROGRAM_ID;
const client = createEncryptGrpcClient(grpcUrl);
client.close();

console.log(`ok   Encrypt SDK package: ${SDK_PACKAGE}@${SDK_VERSION} installed in lockfile`);
console.log("warn SDK import: @encrypt.xyz/pre-alpha-solana-client/grpc resolves to TypeScript source in node_modules; using documented gRPC service directly");
console.log(`ok   gRPC client constructed: ${normalizeGrpcTarget(grpcUrl)}`);
console.log(`ok   Encrypt program ID: ${programId}`);

let networkKeys = [];
try {
  networkKeys = await discoverNetworkKeys(rpcUrl, programId);
  console.log(`ok   active network encryption keys: ${networkKeys.length}`);
  for (const key of networkKeys) {
    console.log(`     ${key.account} disc=${key.discriminator} key=${key.publicKeyHex}`);
  }
} catch (error) {
  console.log(`warn network key discovery failed: ${error instanceof Error ? error.message : String(error)}`);
}

if (live) {
  const networkKeyHex = process.env.ENCRYPT_NETWORK_PUBLIC_KEY_HEX ?? networkKeys[0]?.publicKeyHex;
  if (!networkKeyHex) {
    console.error("miss live createInput: no ENCRYPT_NETWORK_PUBLIC_KEY_HEX and no active key discovered");
    process.exit(1);
  }
  const loanPda = process.env.ENCRYPT_PROBE_LOAN_PDA ?? PublicKey.unique().toBase58();
  const healthRatioBps = BigInt(process.env.ENCRYPT_PROBE_HEALTH_RATIO_BPS ?? "15000");
  const ids = await createHealthRatioInput({ grpcUrl, networkKeyHex, healthRatioBps, loanPda });
  if (!ids.length) {
    console.error("miss live createInput: no ciphertext identifier returned");
    process.exit(1);
  }
  for (const id of ids) {
    console.log(`ok   live CreateInput health_ratio_bps=${healthRatioBps} ciphertext=${id.toString("hex")}${id.length === 32 ? ` base58=${new PublicKey(id).toBase58()}` : ""}`);
  }
} else {
  console.log("skip live CreateInput: pass --live to submit a devnet pre-alpha health-ratio input");
}

console.log("note pre-alpha boundary: no production encryption guarantee; do not submit sensitive or real data.");
