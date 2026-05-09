#!/usr/bin/env node
// Real IKA Anchor approval smoke for ShieldLend on Solana devnet.
//
// Flow:
//   1. Generate a fresh collateral proof locally.
//   2. Ensure LendingPool interest model exists.
//   3. Temporarily authorize the local wallet in nullifier_registry if needed.
//   4. Register a fresh active nullifier and create a fresh ShieldLend loan.
//   5. Create a real IKA dWallet over gRPC + poll its on-chain PDA.
//   6. Transfer dWallet authority to the LendingPool CPI authority PDA.
//   7. Submit lending_pool::approve_ika_borrow_message via CPI.
//   8. If approval exists, request presign + sign over gRPC and poll the
//      MessageApproval account for a committed signature.
//
// This script does not claim production privacy. IKA pre-alpha still uses a
// single mock signer and its interfaces may drift.

import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
  Transaction,
  SystemProgram,
  ComputeBudgetProgram,
  sendAndConfirmTransaction,
} = require("@solana/web3.js");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const { bcs } = require("@mysten/bcs");
const snarkjs = require("snarkjs");
const circomlibjs = require("circomlibjs");
const { keccak_256 } = require("@noble/hashes/sha3");
const bs58 = require("bs58");

const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";
const GRPC_URL =
  process.env.IKA_GRPC_URL ?? "pre-alpha-dev-1.ika.ika-network.net:443";

const SHIELDED_POOL_PROGRAM_ID = new PublicKey(
  "9Bvt3jMawHFRRxpaQTtV5VvFdpZkmAZtvwjTrAX9TAtE"
);
const LENDING_POOL_PROGRAM_ID = new PublicKey(
  process.env.LENDING_POOL_PROGRAM_ID ??
    "HLtWrvLyc2SE3ERWHaEdY4RG84GxFfHv3Qf4NzJPxaF7"
);
const NULLIFIER_REGISTRY_PROGRAM_ID = new PublicKey(
  "E42nSmqvSCuC1EWbmzYqsdLHimBMeuZyir5dB5gE24rF"
);
const IKA_PROGRAM_ID = new PublicKey(
  process.env.IKA_PROGRAM_ID ??
    "87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY"
);

const REGISTRY_WRITER_SEED = Buffer.from("registry-writer");
const PROOF_DATA_SEED = Buffer.from("proof-data");
const CPI_AUTHORITY_SEED = Buffer.from("__ika_cpi_authority");
const IKA_COORDINATOR_SEED = Buffer.from("dwallet_coordinator");
const IKA_DWALLET_SEED = Buffer.from("dwallet");
const IKA_MESSAGE_APPROVAL_SEED = Buffer.from("message_approval");

const IKA_CURVE_CURVE25519 = 2;
const IKA_SIGNATURE_SCHEME_EDDSA_SHA512 = 5;
const IKA_TRANSFER_OWNERSHIP_IX = 24;

const IKA_COORDINATOR_DISC = 1;
const IKA_COORDINATOR_LEN = 116;
const IKA_NEK_DISC = 3;
const IKA_NEK_LEN = 164;
const IKA_DWALLET_DISC = 2;
const IKA_DWALLET_ACTIVE_STATE = 1;
const IKA_MESSAGE_APPROVAL_DISC = 14;

const ROOT_HISTORY_SIZE = 30;
const BASE_FIELD_PRIME =
  21888242871839275222246405745257275088696311157297823662689037894645226208583n;

const VALID_KINKS = [
  0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000,
];
const VALID_RATES = [0, 150, 300, 450, 600, 800, 1100, 1600, 2400, 4000, 8000];

const COLLATERAL_DENOMINATION =
  BigInt(process.env.IKA_COLLATERAL_DENOMINATION ?? "100000000");
const COLLATERAL_BORROW_AMOUNT =
  BigInt(process.env.IKA_BORROW_AMOUNT ?? "50000000");
const COLLATERAL_BORROW_BUCKET =
  Number(process.env.IKA_BORROW_BUCKET ?? "5000");
const LOAN_ID = BigInt(process.env.IKA_LOAN_ID ?? "424242");
const INTEREST_RATE_BPS = BigInt(process.env.IKA_INTEREST_RATE_BPS ?? "1000");

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const constantsPath = path.resolve(rootDir, "circuits/constants.json");
const collateralWasmPath = path.resolve(
  rootDir,
  "frontend/public/circuits/collateral_ring.wasm"
);
const collateralZkeyPath = path.resolve(
  rootDir,
  "frontend/public/circuits/collateral_ring.zkey"
);

const protoSource = `
syntax = "proto3";
package ika.dwallet.v1;
service DWalletService {
  rpc SubmitTransaction(UserSignedRequest) returns (TransactionResponse);
  rpc GetPresigns(GetPresignsRequest) returns (GetPresignsResponse);
  rpc GetPresignsForDWallet(GetPresignsForDWalletRequest) returns (GetPresignsResponse);
}
message UserSignedRequest {
  bytes user_signature = 1;
  bytes signed_request_data = 2;
}
message TransactionResponse {
  bytes response_data = 1;
}
message GetPresignsRequest {
  bytes user_pubkey = 1;
}
message GetPresignsForDWalletRequest {
  bytes user_pubkey = 1;
  bytes dwallet_id = 2;
}
message GetPresignsResponse {
  repeated PresignInfo presigns = 1;
}
message PresignInfo {
  bytes presign_id = 1;
  bytes dwallet_id = 2;
  uint32 curve = 3;
  uint32 signature_scheme = 4;
  uint64 epoch = 5;
}
`;

function ok(msg) {
  console.log(`[OK]   ${msg}`);
}

function info(msg) {
  console.log(`       ${msg}`);
}

function warn(msg) {
  console.log(`[WARN] ${msg}`);
}

function fail(code, msg, extra = {}) {
  console.error(`\n[FAIL] ${code}: ${msg}`);
  if (Object.keys(extra).length > 0) {
    console.error(JSON.stringify(extra, null, 2));
  }
  process.exit(1);
}

function disc(name) {
  return createHash("sha256").update(`global:${name}`).digest().slice(0, 8);
}

function u16LE(n) {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(Number(n), 0);
  return buf;
}

function u32LE(n) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(Number(n), 0);
  return buf;
}

function u64LE(n) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(n), 0);
  return buf;
}

function bigintTo32BE(value) {
  const hex = BigInt(value).toString(16).padStart(64, "0");
  if (hex.length !== 64) {
    throw new Error(`value too large for 32 bytes: ${value}`);
  }
  return Buffer.from(hex, "hex");
}

function g1Bytes(point) {
  return Buffer.concat([
    bigintTo32BE(BigInt(point[0])),
    bigintTo32BE(BigInt(point[1])),
  ]);
}

function g1NegBytes(point) {
  return Buffer.concat([
    bigintTo32BE(BigInt(point[0])),
    bigintTo32BE((BASE_FIELD_PRIME - BigInt(point[1])) % BASE_FIELD_PRIME),
  ]);
}

function g2Bytes(point) {
  return Buffer.concat([
    bigintTo32BE(BigInt(point[0][1])),
    bigintTo32BE(BigInt(point[0][0])),
    bigintTo32BE(BigInt(point[1][1])),
    bigintTo32BE(BigInt(point[1][0])),
  ]);
}

function pda(seeds, programId) {
  return PublicKey.findProgramAddressSync(seeds, programId);
}

function loadWallet() {
  const keypairPath =
    process.env.SOLANA_KEYPAIR ??
    path.join(homedir(), ".config", "solana", "id.json");
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(keypairPath, "utf8")))
  );
}

function buildGrpcClient(url) {
  const protoPath = path.join(tmpdir(), "codex-ika-dwallet.proto");
  if (!existsSync(protoPath)) {
    require("node:fs").writeFileSync(protoPath, protoSource);
  }
  const def = protoLoader.loadSync(protoPath, {
    keepCase: true,
    longs: String,
    enums: Number,
    defaults: true,
    oneofs: true,
  });
  const desc = grpc.loadPackageDefinition(def);
  const Client = desc.ika.dwallet.v1.DWalletService;
  const creds =
    url.includes("localhost") || url.includes("127.0.0.1")
      ? grpc.credentials.createInsecure()
      : grpc.credentials.createSsl();
  return new Client(url.replace(/^https?:\/\//, ""), creds);
}

function defineBcsTypes() {
  const ChainId = bcs.enum("ChainId", { Solana: null, Sui: null });
  const DWalletCurve = bcs.enum("DWalletCurve", {
    Secp256k1: null,
    Secp256r1: null,
    Curve25519: null,
    Ristretto: null,
  });
  const DWalletSignatureAlgorithm = bcs.enum("DWalletSignatureAlgorithm", {
    ECDSASecp256k1: null,
    ECDSASecp256r1: null,
    Taproot: null,
    EdDSA: null,
    SchnorrkelSubstrate: null,
  });
  const DWalletSignatureScheme = bcs.enum("DWalletSignatureScheme", {
    EcdsaKeccak256: null,
    EcdsaSha256: null,
    EcdsaDoubleSha256: null,
    TaprootSha256: null,
    EcdsaBlake2b256: null,
    EddsaSha512: null,
    SchnorrkelMerlin: null,
  });
  const ApprovalProof = bcs.enum("ApprovalProof", {
    Solana: bcs.struct("APS", {
      transaction_signature: bcs.vector(bcs.u8()),
      slot: bcs.u64(),
    }),
    Sui: bcs.struct("APSui", {
      effects_certificate: bcs.vector(bcs.u8()),
    }),
  });
  const UserSignature = bcs.enum("UserSignature", {
    Ed25519: bcs.struct("USE", {
      signature: bcs.vector(bcs.u8()),
      public_key: bcs.vector(bcs.u8()),
    }),
    Secp256k1: bcs.struct("USS", {
      signature: bcs.vector(bcs.u8()),
      public_key: bcs.vector(bcs.u8()),
    }),
    Secp256r1: bcs.struct("USR", {
      signature: bcs.vector(bcs.u8()),
      public_key: bcs.vector(bcs.u8()),
    }),
  });
  const NetworkSignedAttestation = bcs.struct("NetworkSignedAttestation", {
    attestation_data: bcs.vector(bcs.u8()),
    network_signature: bcs.vector(bcs.u8()),
    network_pubkey: bcs.vector(bcs.u8()),
    epoch: bcs.u64(),
  });
  const SignDuringDKGRequest = bcs.struct("SignDuringDKGRequest", {
    presign_session_identifier: bcs.vector(bcs.u8()),
    presign: bcs.vector(bcs.u8()),
    signature_scheme: DWalletSignatureScheme,
    message: bcs.vector(bcs.u8()),
    message_metadata: bcs.vector(bcs.u8()),
    message_centralized_signature: bcs.vector(bcs.u8()),
  });
  const UserSecretKeyShare = bcs.enum("UserSecretKeyShare", {
    Encrypted: bcs.struct("USKSEnc", {
      encrypted_centralized_secret_share_and_proof: bcs.vector(bcs.u8()),
      encryption_key: bcs.vector(bcs.u8()),
      signer_public_key: bcs.vector(bcs.u8()),
    }),
    Public: bcs.struct("USKSPub", {
      public_user_secret_key_share: bcs.vector(bcs.u8()),
    }),
  });
  const DWalletRequest = bcs.enum("DWalletRequest", {
    DKG: bcs.struct("DKG", {
      dwallet_network_encryption_public_key: bcs.vector(bcs.u8()),
      curve: DWalletCurve,
      centralized_public_key_share_and_proof: bcs.vector(bcs.u8()),
      user_secret_key_share: UserSecretKeyShare,
      user_public_output: bcs.vector(bcs.u8()),
      sign_during_dkg_request: bcs.option(SignDuringDKGRequest),
    }),
    Sign: bcs.struct("Sign", {
      message: bcs.vector(bcs.u8()),
      message_metadata: bcs.vector(bcs.u8()),
      presign_session_identifier: bcs.vector(bcs.u8()),
      message_centralized_signature: bcs.vector(bcs.u8()),
      dwallet_attestation: NetworkSignedAttestation,
      approval_proof: ApprovalProof,
    }),
    PresignForDWallet: bcs.struct("PFD", {
      dwallet_network_encryption_public_key: bcs.vector(bcs.u8()),
      dwallet_public_key: bcs.vector(bcs.u8()),
      dwallet_attestation: NetworkSignedAttestation,
      curve: DWalletCurve,
      signature_algorithm: DWalletSignatureAlgorithm,
    }),
  });
  const SignedRequestData = bcs.struct("SignedRequestData", {
    session_identifier_preimage: bcs.fixedArray(32, bcs.u8()),
    epoch: bcs.u64(),
    chain_id: ChainId,
    intended_chain_sender: bcs.vector(bcs.u8()),
    request: DWalletRequest,
  });
  const TransactionResponseData = bcs.enum("TransactionResponseData", {
    Signature: bcs.struct("SigResp", { signature: bcs.vector(bcs.u8()) }),
    Attestation: NetworkSignedAttestation,
    Error: bcs.struct("ErrResp", { message: bcs.string() }),
  });
  const VersionedDWalletDataAttestation = bcs.enum(
    "VersionedDWalletDataAttestation",
    {
      V1: bcs.struct("DWalletDataAttestationV1", {
        session_identifier: bcs.fixedArray(32, bcs.u8()),
        intended_chain_sender: bcs.vector(bcs.u8()),
        curve: DWalletCurve,
        public_key: bcs.vector(bcs.u8()),
        public_output: bcs.vector(bcs.u8()),
        is_imported_key: bcs.bool(),
        sign_during_dkg_signature: bcs.option(bcs.vector(bcs.u8())),
      }),
    }
  );
  const VersionedPresignDataAttestation = bcs.enum(
    "VersionedPresignDataAttestation",
    {
      V1: bcs.struct("PresignDataAttestationV1", {
        session_identifier: bcs.fixedArray(32, bcs.u8()),
        epoch: bcs.u64(),
        presign_session_identifier: bcs.vector(bcs.u8()),
        presign_data: bcs.vector(bcs.u8()),
        curve: DWalletCurve,
        signature_algorithm: DWalletSignatureAlgorithm,
        dwallet_public_key: bcs.option(bcs.vector(bcs.u8())),
        user_pubkey: bcs.vector(bcs.u8()),
      }),
    }
  );
  return {
    UserSignature,
    SignedRequestData,
    TransactionResponseData,
    VersionedDWalletDataAttestation,
    VersionedPresignDataAttestation,
  };
}

function buildUserSignatureSerializer(types, pubkeyBytes) {
  return types.UserSignature.serialize({
    Ed25519: {
      signature: Array.from(new Uint8Array(64)),
      public_key: Array.from(pubkeyBytes),
    },
  }).toBytes();
}

function submitGrpc(client, userSignature, signedRequestData) {
  return new Promise((resolve, reject) => {
    client.SubmitTransaction(
      {
        user_signature: Buffer.from(userSignature),
        signed_request_data: Buffer.from(signedRequestData),
      },
      (err, response) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(new Uint8Array(response.response_data));
      }
    );
  });
}

async function send(
  connection,
  wallet,
  ixs,
  label,
  extraSigners = [],
  { fatal = true } = {}
) {
  const tx = new Transaction().add(...ixs);
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  try {
    const sig = await sendAndConfirmTransaction(
      connection,
      tx,
      [wallet, ...extraSigners],
      { commitment: "confirmed" }
    );
    ok(`${label}: ${sig}`);
    return sig;
  } catch (error) {
    const logs = error.logs ?? [];
    const details = {
      message: String(error.message ?? error),
      logs,
    };
    if (!fatal) {
      return { ok: false, error, logs, details };
    }
    fail("TX_FAILED", label, details);
  }
}

async function waitForAccount(connection, pubkey, check, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const info = await connection.getAccountInfo(pubkey);
    if (info?.data && check(Buffer.from(info.data))) {
      return Buffer.from(info.data);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return null;
}

async function getProgramAccountByDisc(
  connection,
  programId,
  discByte,
  minLen,
  timeoutMs = 30000
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const accounts = await connection.getProgramAccounts(programId);
    const found = accounts.find(
      (item) =>
        item.account.data.length >= minLen && item.account.data[0] === discByte
    );
    if (found) {
      return found;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return null;
}

function dwalletPdaSeeds(curve, publicKeyBytes) {
  const payload = Buffer.alloc(2 + publicKeyBytes.length);
  payload.writeUInt16LE(curve, 0);
  Buffer.from(publicKeyBytes).copy(payload, 2);

  const seeds = [IKA_DWALLET_SEED];
  for (let i = 0; i < payload.length; i += 32) {
    seeds.push(payload.subarray(i, Math.min(i + 32, payload.length)));
  }
  return seeds;
}

function findMessageApprovalPda({
  dwalletProgramId,
  curve,
  publicKeyBytes,
  signatureScheme,
  messageDigest,
  messageMetadataDigest,
}) {
  const scheme = Buffer.alloc(2);
  scheme.writeUInt16LE(signatureScheme, 0);
  const seeds = [
    ...dwalletPdaSeeds(curve, publicKeyBytes),
    IKA_MESSAGE_APPROVAL_SEED,
    scheme,
    Buffer.from(messageDigest),
  ];
  if (messageMetadataDigest && !Buffer.from(messageMetadataDigest).equals(Buffer.alloc(32))) {
    seeds.push(Buffer.from(messageMetadataDigest));
  }
  return pda(seeds, dwalletProgramId);
}

function parseRegistryConfig(info) {
  const authority = new PublicKey(info.data.slice(8, 40));
  const len = info.data.readUInt32LE(40);
  const authorizedPrograms = [];
  for (let i = 0; i < len; i += 1) {
    authorizedPrograms.push(
      new PublicKey(info.data.slice(44 + i * 32, 44 + (i + 1) * 32))
    );
  }
  return { authority, authorizedPrograms };
}

function serializePubkeyVec(pubkeys) {
  return Buffer.concat([
    u32LE(pubkeys.length),
    ...pubkeys.map((pubkey) => Buffer.from(pubkey.toBytes())),
  ]);
}

async function ensureInterestModel(connection, wallet) {
  const [interestModel] = pda(
    [Buffer.from("interest-rate-model")],
    LENDING_POOL_PROGRAM_ID
  );
  const modelInfo = await connection.getAccountInfo(interestModel);
  if (modelInfo) {
    ok(`interest-rate-model already exists: ${interestModel.toBase58()}`);
    return interestModel;
  }

  info("initializing lending_pool interest-rate-model");
  const data = Buffer.concat([
    disc("initialize"),
    ...VALID_KINKS.map((value) => u16LE(value)),
    ...VALID_RATES.map((value) => u16LE(value)),
  ]);

  await send(
    connection,
    wallet,
    [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 120_000 }),
      new TransactionInstruction({
        programId: LENDING_POOL_PROGRAM_ID,
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: interestModel, isSigner: false, isWritable: true },
          {
            pubkey: SystemProgram.programId,
            isSigner: false,
            isWritable: false,
          },
        ],
        data,
      }),
    ],
    "lending_pool::initialize"
  );

  return interestModel;
}

async function ensureWalletAuthorizedForRegister(connection, wallet) {
  const [registryConfig] = pda(
    [Buffer.from("registry-config")],
    NULLIFIER_REGISTRY_PROGRAM_ID
  );
  const registryInfo = await connection.getAccountInfo(registryConfig);
  if (!registryInfo) {
    fail("MISSING_REGISTRY_CONFIG", "nullifier registry config is missing", {
      registryConfig: registryConfig.toBase58(),
    });
  }

  const parsed = parseRegistryConfig(registryInfo);
  if (!parsed.authority.equals(wallet.publicKey)) {
    fail(
      "UNAUTHORIZED_REGISTRY_ADMIN",
      "configured devnet wallet is not the nullifier registry authority",
      {
        expectedAuthority: parsed.authority.toBase58(),
        wallet: wallet.publicKey.toBase58(),
      }
    );
  }

  const alreadyAuthorized = parsed.authorizedPrograms.some((pubkey) =>
    pubkey.equals(wallet.publicKey)
  );
  if (alreadyAuthorized) {
    ok("wallet already authorized in nullifier_registry");
    return { registryConfig, originalAuthorizedPrograms: parsed.authorizedPrograms, modified: false };
  }

  const updatedPrograms = [...parsed.authorizedPrograms, wallet.publicKey];
  info("temporarily authorizing wallet in nullifier_registry for fresh register");

  await send(
    connection,
    wallet,
    [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 80_000 }),
      new TransactionInstruction({
        programId: NULLIFIER_REGISTRY_PROGRAM_ID,
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
          { pubkey: registryConfig, isSigner: false, isWritable: true },
        ],
        data: Buffer.concat([
          disc("update_authorized_programs"),
          serializePubkeyVec(updatedPrograms),
        ]),
      }),
    ],
    "nullifier_registry::update_authorized_programs(+wallet)"
  );

  return {
    registryConfig,
    originalAuthorizedPrograms: parsed.authorizedPrograms,
    modified: true,
  };
}

async function restoreAuthorizedPrograms(connection, wallet, registryConfig, originalAuthorizedPrograms) {
  info("restoring original nullifier_registry authorized_programs");
  await send(
    connection,
    wallet,
    [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 80_000 }),
      new TransactionInstruction({
        programId: NULLIFIER_REGISTRY_PROGRAM_ID,
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
          { pubkey: registryConfig, isSigner: false, isWritable: true },
        ],
        data: Buffer.concat([
          disc("update_authorized_programs"),
          serializePubkeyVec(originalAuthorizedPrograms),
        ]),
      }),
    ],
    "nullifier_registry::update_authorized_programs(restore)"
  );
}

async function registerFreshNullifier(connection, wallet, nullifierHash, leafIndex) {
  const [registryConfig] = pda(
    [Buffer.from("registry-config")],
    NULLIFIER_REGISTRY_PROGRAM_ID
  );
  const [nullifierPda] = pda(
    [Buffer.from("nullifier"), nullifierHash],
    NULLIFIER_REGISTRY_PROGRAM_ID
  );
  const existing = await connection.getAccountInfo(nullifierPda);
  if (existing) {
    const status = existing.data[40];
    if (status === 0) {
      ok(`fresh nullifier already active: ${nullifierPda.toBase58()}`);
      return nullifierPda;
    }
    fail(
      "NULLIFIER_NOT_ACTIVE",
      "freshly derived collateral nullifier PDA already exists but is not Active",
      {
        nullifierPda: nullifierPda.toBase58(),
        status,
      }
    );
  }

  await send(
    connection,
    wallet,
    [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 120_000 }),
      new TransactionInstruction({
        programId: NULLIFIER_REGISTRY_PROGRAM_ID,
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
          { pubkey: registryConfig, isSigner: false, isWritable: false },
          { pubkey: nullifierPda, isSigner: false, isWritable: true },
          {
            pubkey: SystemProgram.programId,
            isSigner: false,
            isWritable: false,
          },
        ],
        data: Buffer.concat([
          disc("register"),
          Buffer.from(nullifierHash),
          u64LE(leafIndex),
        ]),
      }),
    ],
    "nullifier_registry::register"
  );

  return nullifierPda;
}

async function generateCollateralProof() {
  if (!existsSync(constantsPath)) {
    fail("MISSING_CONSTANTS", "circuits/constants.json missing");
  }
  if (!existsSync(collateralWasmPath) || !existsSync(collateralZkeyPath)) {
    fail(
      "MISSING_COLLATERAL_ARTIFACTS",
      "collateral circuit wasm/zkey artifacts are missing",
      {
        collateralWasmPath,
        collateralZkeyPath,
      }
    );
  }

  const constants = JSON.parse(readFileSync(constantsPath, "utf8"));
  const shieldedPoolField = BigInt(constants.programs.shielded_pool.fieldElement);

  const poseidon = await circomlibjs.buildPoseidon();
  const F = poseidon.F;
  const secret = BigInt("0x" + randomBytes(8).toString("hex"));
  const nullifier = BigInt("0x" + randomBytes(8).toString("hex"));
  const leafIndex = 0n;
  const ringIndex = 0n;

  const commitment = F.toObject(
    poseidon([secret, nullifier, COLLATERAL_DENOMINATION])
  );
  const nullifierHash = F.toObject(
    poseidon([nullifier, leafIndex, shieldedPoolField])
  );

  let root = commitment;
  const pathElements = [];
  const pathIndices = [];
  for (let i = 0; i < 24; i += 1) {
    pathElements.push("0");
    pathIndices.push("0");
    root = F.toObject(poseidon([root, 0]));
  }

  const ring = [commitment.toString()];
  for (let i = 1; i < 16; i += 1) {
    ring.push((1000000n + BigInt(i)).toString());
  }

  const input = {
    secret: secret.toString(),
    nullifier: nullifier.toString(),
    denomination: COLLATERAL_DENOMINATION.toString(),
    leaf_index: leafIndex.toString(),
    pathElements,
    pathIndices,
    ring_index: ringIndex.toString(),
    ring,
    nullifierHash: nullifierHash.toString(),
    root: root.toString(),
    borrowed: COLLATERAL_BORROW_AMOUNT.toString(),
    minRatioBps: COLLATERAL_BORROW_BUCKET.toString(),
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    collateralWasmPath,
    collateralZkeyPath
  );

  if (publicSignals.length !== 20) {
    fail("BAD_PROOF_OUTPUT", "collateral proof returned unexpected public signal count", {
      publicSignalsLength: publicSignals.length,
    });
  }

  return {
    secret,
    nullifier,
    leafIndex,
    ringIndex,
    commitment: bigintTo32BE(commitment),
    nullifierHash: bigintTo32BE(nullifierHash),
    root: bigintTo32BE(root),
    proofA: g1NegBytes(proof.pi_a),
    proofB: g2Bytes(proof.pi_b),
    proofC: g1Bytes(proof.pi_c),
    publicSignals: publicSignals.map((value) => bigintTo32BE(BigInt(value))),
  };
}

async function createFreshLoan(connection, wallet, proofBundle) {
  const interestModel = await ensureInterestModel(connection, wallet);
  const [registryConfig] = pda(
    [Buffer.from("registry-config")],
    NULLIFIER_REGISTRY_PROGRAM_ID
  );
  const [registryWriter] = pda([REGISTRY_WRITER_SEED], LENDING_POOL_PROGRAM_ID);
  const [loan] = pda(
    [Buffer.from("loan"), proofBundle.nullifierHash],
    LENDING_POOL_PROGRAM_ID
  );

  const proofNonce = randomBytes(32);
  const [proofData] = pda(
    [PROOF_DATA_SEED, wallet.publicKey.toBytes(), proofNonce],
    LENDING_POOL_PROGRAM_ID
  );

  const registerContext = await ensureWalletAuthorizedForRegister(connection, wallet);
  let restoreNeeded = registerContext.modified;
  try {
    const nullifierPda = await registerFreshNullifier(
      connection,
      wallet,
      proofBundle.nullifierHash,
      proofBundle.leafIndex
    );

    await send(
      connection,
      wallet,
      [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
        new TransactionInstruction({
          programId: LENDING_POOL_PROGRAM_ID,
          keys: [
            { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
            { pubkey: proofData, isSigner: false, isWritable: true },
            {
              pubkey: SystemProgram.programId,
              isSigner: false,
              isWritable: false,
            },
          ],
          data: Buffer.concat([
            disc("store_collateral_proof"),
            proofNonce,
            proofBundle.proofA,
            proofBundle.proofB,
            proofBundle.proofC,
            ...proofBundle.publicSignals,
          ]),
        }),
      ],
      "lending_pool::store_collateral_proof"
    );

    await send(
      connection,
      wallet,
      [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
        new TransactionInstruction({
          programId: LENDING_POOL_PROGRAM_ID,
          keys: [
            { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
            { pubkey: loan, isSigner: false, isWritable: true },
            { pubkey: interestModel, isSigner: false, isWritable: false },
            { pubkey: nullifierPda, isSigner: false, isWritable: true },
            { pubkey: registryConfig, isSigner: false, isWritable: false },
            { pubkey: registryWriter, isSigner: false, isWritable: false },
            {
              pubkey: NULLIFIER_REGISTRY_PROGRAM_ID,
              isSigner: false,
              isWritable: false,
            },
            {
              pubkey: SystemProgram.programId,
              isSigner: false,
              isWritable: false,
            },
            { pubkey: proofData, isSigner: false, isWritable: true },
          ],
          data: Buffer.concat([
            disc("borrow"),
            Buffer.from(proofBundle.nullifierHash),
            Buffer.from([1]),
            u64LE(LOAN_ID),
            u64LE(COLLATERAL_BORROW_AMOUNT),
            u16LE(COLLATERAL_BORROW_BUCKET),
            u64LE(INTEREST_RATE_BPS),
            wallet.publicKey.toBuffer(),
            Buffer.from([1]),
            proofNonce,
          ]),
        }),
      ],
      "lending_pool::borrow"
    );

    const loanInfo = await connection.getAccountInfo(loan);
    if (!loanInfo) {
      fail("MISSING_LOAN", "loan PDA was not created after borrow", {
        loan: loan.toBase58(),
      });
    }

    ok(`fresh loan created: ${loan.toBase58()}`);
    return { loan, nullifierPda };
  } finally {
    if (restoreNeeded) {
      await restoreAuthorizedPrograms(
        connection,
        wallet,
        registerContext.registryConfig,
        registerContext.originalAuthorizedPrograms
      );
    }
  }
}

async function setupIkaDwallet(connection, wallet) {
  const [coordinatorPda] = pda([IKA_COORDINATOR_SEED], IKA_PROGRAM_ID);
  const coordinatorData = await waitForAccount(
    connection,
    coordinatorPda,
    (data) =>
      data.length >= IKA_COORDINATOR_LEN && data[0] === IKA_COORDINATOR_DISC,
    15000
  );
  if (!coordinatorData) {
    fail(
      "MISSING_IKA_COORDINATOR",
      "official IKA coordinator PDA is not live on devnet",
      { coordinatorPda: coordinatorPda.toBase58() }
    );
  }
  ok(`IKA coordinator: ${coordinatorPda.toBase58()}`);

  const nek = await getProgramAccountByDisc(
    connection,
    IKA_PROGRAM_ID,
    IKA_NEK_DISC,
    IKA_NEK_LEN,
    15000
  );
  if (!nek) {
    fail(
      "MISSING_IKA_NEK",
      "IKA NetworkEncryptionKey account not found on devnet",
      { ikaProgramId: IKA_PROGRAM_ID.toBase58() }
    );
  }
  ok(`IKA network encryption key: ${nek.pubkey.toBase58()}`);

  const client = buildGrpcClient(GRPC_URL);
  const types = defineBcsTypes();
  const senderPubkeyBytes = wallet.publicKey.toBytes();

  const dkgRequest = types.SignedRequestData.serialize({
    session_identifier_preimage: Array.from(new Uint8Array(32)),
    epoch: 1n,
    chain_id: { Solana: true },
    intended_chain_sender: Array.from(senderPubkeyBytes),
    request: {
      DKG: {
        dwallet_network_encryption_public_key: Array.from(new Uint8Array(32)),
        curve: { Curve25519: true },
        centralized_public_key_share_and_proof: Array.from(new Uint8Array(32)),
        user_secret_key_share: {
          Encrypted: {
            encrypted_centralized_secret_share_and_proof: Array.from(
              new Uint8Array(32)
            ),
            encryption_key: Array.from(new Uint8Array(32)),
            signer_public_key: Array.from(senderPubkeyBytes),
          },
        },
        user_public_output: Array.from(new Uint8Array(32)),
        sign_during_dkg_request: null,
      },
    },
  }).toBytes();

  const dkgResponseBytes = await submitGrpc(
    client,
    buildUserSignatureSerializer(types, senderPubkeyBytes),
    dkgRequest
  ).catch((error) => {
    fail("IKA_GRPC_DKG_FAILED", "DKG request to IKA gRPC failed", {
      grpcUrl: GRPC_URL,
      message: String(error.details ?? error.message ?? error),
      code: error.code,
    });
  });

  const dkgResponse = types.TransactionResponseData.parse(
    new Uint8Array(dkgResponseBytes)
  );
  if (!dkgResponse.Attestation) {
    fail(
      "IKA_DKG_NO_ATTESTATION",
      "DKG response did not return an attestation",
      { response: dkgResponse }
    );
  }
  const dkgPayload = types.VersionedDWalletDataAttestation.parse(
    new Uint8Array(dkgResponse.Attestation.attestation_data)
  );
  if (!dkgPayload.V1) {
    fail(
      "IKA_DKG_BAD_PAYLOAD",
      "DKG attestation payload did not decode as V1",
      { payload: dkgPayload }
    );
  }

  const publicKeyBytes = new Uint8Array(dkgPayload.V1.public_key);
  const dwalletAddr = new Uint8Array(senderPubkeyBytes);
  const [dwalletPda] = pda(
    dwalletPdaSeeds(IKA_CURVE_CURVE25519, publicKeyBytes),
    IKA_PROGRAM_ID
  );
  const [cpiAuthority, cpiAuthorityBump] = pda(
    [CPI_AUTHORITY_SEED],
    LENDING_POOL_PROGRAM_ID
  );

  const dwalletData = await waitForAccount(
    connection,
    dwalletPda,
    (data) => data.length >= 153 && data[0] === IKA_DWALLET_DISC,
    30000
  );
  if (!dwalletData) {
    fail(
      "IKA_DWALLET_NOT_COMMITTED",
      "DKG attestation returned, but the dWallet PDA never appeared on devnet",
      {
        dwalletPda: dwalletPda.toBase58(),
        grpcUrl: GRPC_URL,
      }
    );
  }

  const currentAuthority = new PublicKey(dwalletData.slice(2, 34));
  const curve = dwalletData.readUInt16LE(34);
  const state = dwalletData[36];
  ok(`IKA dWallet on-chain: ${dwalletPda.toBase58()}`);
  info(`dWallet authority before transfer: ${currentAuthority.toBase58()}`);
  if (curve !== IKA_CURVE_CURVE25519 || state !== IKA_DWALLET_ACTIVE_STATE) {
    fail(
      "IKA_DWALLET_BAD_STATE",
      "dWallet exists but is not the expected active Curve25519 account",
      {
        curve,
        state,
      }
    );
  }

  const transferData = Buffer.alloc(33);
  transferData[0] = IKA_TRANSFER_OWNERSHIP_IX;
  cpiAuthority.toBuffer().copy(transferData, 1);

  await send(
    connection,
    wallet,
    [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 160_000 }),
      new TransactionInstruction({
        programId: IKA_PROGRAM_ID,
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
          { pubkey: dwalletPda, isSigner: false, isWritable: true },
        ],
        data: transferData,
      }),
    ],
    "ika::TransferOwnership"
  );

  const transferredData = await waitForAccount(
    connection,
    dwalletPda,
    (data) => new PublicKey(data.slice(2, 34)).equals(cpiAuthority),
    15000
  );
  if (!transferredData) {
    fail(
      "IKA_AUTHORITY_TRANSFER_MISSING",
      "dWallet authority transfer transaction landed but the account does not show LendingPool CPI authority ownership",
      {
        dwalletPda: dwalletPda.toBase58(),
        expectedAuthority: cpiAuthority.toBase58(),
      }
    );
  }
  ok(`IKA dWallet authority transferred to LendingPool CPI PDA: ${cpiAuthority.toBase58()}`);

  return {
    client,
    types,
    coordinatorPda,
    dwalletPda,
    dwalletPublicKeyBytes: publicKeyBytes,
    dwalletAddr,
    cpiAuthority,
    cpiAuthorityBump,
  };
}

async function attemptApproveAndSign(connection, wallet, loan, ikaSetup) {
  const message = Buffer.from(
    `ShieldLend IKA devnet approval smoke ${new Date().toISOString()} loan=${loan.toBase58()}`
  );
  const messageDigest = Buffer.from(keccak_256(message));
  const messageMetadataDigest = Buffer.alloc(32);
  const userPubkey = Buffer.from(wallet.publicKey.toBytes());

  const [messageApprovalPda, messageApprovalBump] = findMessageApprovalPda({
    dwalletProgramId: IKA_PROGRAM_ID,
    curve: IKA_CURVE_CURVE25519,
    publicKeyBytes: ikaSetup.dwalletPublicKeyBytes,
    signatureScheme: IKA_SIGNATURE_SCHEME_EDDSA_SHA512,
    messageDigest,
    messageMetadataDigest,
  });

  const existing = await connection.getAccountInfo(messageApprovalPda);
  if (existing) {
    fail(
      "MESSAGE_APPROVAL_ALREADY_EXISTS",
      "derived MessageApproval PDA is already occupied; choose a fresh message digest",
      {
        messageApprovalPda: messageApprovalPda.toBase58(),
      }
    );
  }

  const approveResult = await send(
    connection,
    wallet,
    [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 350_000 }),
      new TransactionInstruction({
        programId: LENDING_POOL_PROGRAM_ID,
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: loan, isSigner: false, isWritable: false },
          { pubkey: ikaSetup.coordinatorPda, isSigner: false, isWritable: false },
          { pubkey: messageApprovalPda, isSigner: false, isWritable: true },
          { pubkey: ikaSetup.dwalletPda, isSigner: false, isWritable: false },
          { pubkey: LENDING_POOL_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: ikaSetup.cpiAuthority, isSigner: false, isWritable: false },
          { pubkey: IKA_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: Buffer.concat([
          disc("approve_ika_borrow_message"),
          messageDigest,
          messageMetadataDigest,
          userPubkey,
          u16LE(IKA_SIGNATURE_SCHEME_EDDSA_SHA512),
          Buffer.from([messageApprovalBump]),
        ]),
      }),
    ],
    "lending_pool::approve_ika_borrow_message",
    [],
    { fatal: false }
  );
  if (approveResult?.ok === false) {
    const logsJoined = (approveResult.logs ?? []).join(" ");
    if (logsJoined.includes("InstructionFallbackNotFound")) {
      fail(
        "LENDING_POOL_NOT_REDEPLOYED",
        "local branch has approve_ika_borrow_message, but the deployed devnet lending_pool binary does not. A redeploy is required before any real IKA approval CPI can land.",
        {
          lendingPoolProgramId: LENDING_POOL_PROGRAM_ID.toBase58(),
          blockerKind: "our_deployment_gap",
          approveAttemptLogs: approveResult.logs,
        }
      );
    }
    fail(
      "IKA_APPROVAL_TX_FAILED",
      "approve_ika_borrow_message transaction failed before MessageApproval creation",
      approveResult.details
    );
  }
  const approveSig = approveResult;

  const messageApprovalData = await waitForAccount(
    connection,
    messageApprovalPda,
    (data) => data[0] === IKA_MESSAGE_APPROVAL_DISC,
    15000
  );
  if (!messageApprovalData) {
    fail(
      "MESSAGE_APPROVAL_NOT_CREATED",
      "approve_message CPI tx confirmed but no MessageApproval PDA appeared",
      {
        messageApprovalPda: messageApprovalPda.toBase58(),
        approveSig,
      }
    );
  }
  ok(`MessageApproval created: ${messageApprovalPda.toBase58()}`);

  const txInfo = await connection.getTransaction(approveSig, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  const approvalSlot = txInfo?.slot ?? 0;

  const presignRequest = ikaSetup.types.SignedRequestData.serialize({
    session_identifier_preimage: Array.from(ikaSetup.dwalletAddr),
    epoch: 1n,
    chain_id: { Solana: true },
    intended_chain_sender: Array.from(wallet.publicKey.toBytes()),
    request: {
      PresignForDWallet: {
        dwallet_network_encryption_public_key: Array.from(new Uint8Array(32)),
        dwallet_public_key: Array.from(ikaSetup.dwalletAddr),
        dwallet_attestation: {
          attestation_data: Array.from(new Uint8Array(32)),
          network_signature: Array.from(new Uint8Array(64)),
          network_pubkey: Array.from(new Uint8Array(32)),
          epoch: 1n,
        },
        curve: { Curve25519: true },
        signature_algorithm: { EdDSA: true },
      },
    },
  }).toBytes();

  const presignResponseBytes = await submitGrpc(
    ikaSetup.client,
    buildUserSignatureSerializer(ikaSetup.types, wallet.publicKey.toBytes()),
    presignRequest
  ).catch((error) => {
    fail("IKA_PRESIGN_FAILED", "IKA gRPC PresignForDWallet failed", {
      grpcUrl: GRPC_URL,
      message: String(error.details ?? error.message ?? error),
      code: error.code,
    });
  });

  const presignResponse = ikaSetup.types.TransactionResponseData.parse(
    new Uint8Array(presignResponseBytes)
  );
  if (!presignResponse.Attestation) {
    fail(
      "IKA_PRESIGN_NO_ATTESTATION",
      "PresignForDWallet did not return an attestation",
      { response: presignResponse }
    );
  }
  const presignPayload = ikaSetup.types.VersionedPresignDataAttestation.parse(
    new Uint8Array(presignResponse.Attestation.attestation_data)
  );
  if (!presignPayload.V1) {
    fail(
      "IKA_PRESIGN_BAD_PAYLOAD",
      "presign attestation did not decode as V1",
      { payload: presignPayload }
    );
  }
  const presignId = new Uint8Array(
    presignPayload.V1.presign_session_identifier
  );
  ok(`IKA presign allocated: ${Buffer.from(presignId).toString("hex")}`);

  const signRequest = ikaSetup.types.SignedRequestData.serialize({
    session_identifier_preimage: Array.from(ikaSetup.dwalletAddr),
    epoch: 1n,
    chain_id: { Solana: true },
    intended_chain_sender: Array.from(wallet.publicKey.toBytes()),
    request: {
      Sign: {
        message: Array.from(message),
        message_metadata: [],
        presign_session_identifier: Array.from(presignId),
        message_centralized_signature: Array.from(new Uint8Array(64)),
        dwallet_attestation: {
          attestation_data: Array.from(new Uint8Array(32)),
          network_signature: Array.from(new Uint8Array(64)),
          network_pubkey: Array.from(new Uint8Array(32)),
          epoch: 1n,
        },
        approval_proof: {
          Solana: {
            transaction_signature: Array.from(bs58.decode(approveSig)),
            slot: BigInt(approvalSlot),
          },
        },
      },
    },
  }).toBytes();

  const signResponseBytes = await submitGrpc(
    ikaSetup.client,
    buildUserSignatureSerializer(ikaSetup.types, wallet.publicKey.toBytes()),
    signRequest
  ).catch((error) => {
    fail("IKA_SIGN_FAILED", "IKA gRPC Sign request failed after approval", {
      grpcUrl: GRPC_URL,
      message: String(error.details ?? error.message ?? error),
      code: error.code,
      approveSig,
      approvalSlot,
    });
  });

  const signResponse = ikaSetup.types.TransactionResponseData.parse(
    new Uint8Array(signResponseBytes)
  );
  if (!signResponse.Signature) {
    if (signResponse.Error) {
      fail("IKA_SIGN_REJECTED", "IKA gRPC Sign returned an error payload", {
        message: signResponse.Error.message,
        approveSig,
      });
    }
    fail(
      "IKA_SIGN_BAD_RESPONSE",
      "IKA gRPC Sign did not return a signature payload",
      { response: signResponse }
    );
  }
  const grpcSignatureHex = Buffer.from(
    signResponse.Signature.signature
  ).toString("hex");
  ok(`IKA gRPC signature returned (${signResponse.Signature.signature.length} bytes)`);

  const signedApprovalData = await waitForAccount(
    connection,
    messageApprovalPda,
    (data) => {
      if (data[0] !== IKA_MESSAGE_APPROVAL_DISC) return false;
      const docStatus = data.length >= 175 ? data[172] : 255;
      const legacyStatus = data.length >= 142 ? data[139] : 255;
      return docStatus === 1 || legacyStatus === 1;
    },
    30000
  );

  let onchainCommitted = false;
  let onchainSignatureHex = null;
  if (signedApprovalData) {
    if (signedApprovalData.length >= 175 && signedApprovalData[172] === 1) {
      const sigLen = signedApprovalData.readUInt16LE(173);
      onchainSignatureHex = Buffer.from(
        signedApprovalData.slice(175, 175 + sigLen)
      ).toString("hex");
      onchainCommitted = true;
    } else if (signedApprovalData.length >= 142 && signedApprovalData[139] === 1) {
      const sigLen = signedApprovalData.readUInt16LE(140);
      onchainSignatureHex = Buffer.from(
        signedApprovalData.slice(142, 142 + sigLen)
      ).toString("hex");
      onchainCommitted = true;
    }
  }

  return {
    message: message.toString("utf8"),
    messageDigestHex: messageDigest.toString("hex"),
    messageApprovalPda: messageApprovalPda.toBase58(),
    approveSig,
    approvalSlot,
    grpcSignatureHex,
    onchainCommitted,
    onchainSignatureHex,
  };
}

async function main() {
  console.log("=== ShieldLend IKA Anchor Approval Smoke ===");
  console.log(`Date     : ${new Date().toISOString()}`);
  console.log(`RPC      : ${RPC_URL}`);
  console.log(`gRPC     : ${GRPC_URL}`);
  console.log(`IKA prog : ${IKA_PROGRAM_ID.toBase58()}`);
  console.log(`Lending  : ${LENDING_POOL_PROGRAM_ID.toBase58()}`);
  console.log("");
  console.log("Source docs:");
  console.log("  - https://solana-pre-alpha.ika.xyz/frameworks/anchor.html");
  console.log("  - https://github.com/dwallet-labs/ika-pre-alpha");
  console.log("");

  const wallet = loadWallet();
  const connection = new Connection(RPC_URL, "confirmed");
  const balance = await connection.getBalance(wallet.publicKey);
  ok(`wallet: ${wallet.publicKey.toBase58()}`);
  ok(`balance: ${(balance / 1e9).toFixed(9)} SOL`);
  if (balance < 1_000_000_000) {
    fail("LOW_BALANCE", "wallet balance is too low for live devnet smoke", {
      balanceLamports: balance,
    });
  }

  const proofBundle = await generateCollateralProof();
  ok(`fresh collateral nullifier hash: ${proofBundle.nullifierHash.toString("hex")}`);
  ok(`fresh collateral root: ${proofBundle.root.toString("hex")}`);

  const { loan, nullifierPda } = await createFreshLoan(
    connection,
    wallet,
    proofBundle
  );
  const ikaSetup = await setupIkaDwallet(connection, wallet);
  const result = await attemptApproveAndSign(connection, wallet, loan, ikaSetup);

  console.log("\n=== Result ===");
  console.log(JSON.stringify(
    {
      wallet: wallet.publicKey.toBase58(),
      loan: loan.toBase58(),
      nullifierPda: nullifierPda.toBase58(),
      dwalletPda: ikaSetup.dwalletPda.toBase58(),
      cpiAuthority: ikaSetup.cpiAuthority.toBase58(),
      messageApprovalPda: result.messageApprovalPda,
      approveSig: result.approveSig,
      approvalSlot: result.approvalSlot,
      grpcSignatureHex: result.grpcSignatureHex,
      onchainCommitted: result.onchainCommitted,
      onchainSignatureHex: result.onchainSignatureHex,
      ikaPreAlpha: "single mock signer, not production MPC",
    },
    null,
    2
  ));

  if (result.onchainCommitted) {
    ok("real devnet IKA approval + sign flow reached Signed on-chain state");
  } else {
    warn(
      "gRPC signature returned, but MessageApproval did not reach a confirmed Signed state before timeout"
    );
  }
}

main().catch((error) => {
  fail("UNCAUGHT", String(error.message ?? error), {
    stack: error.stack,
  });
});
