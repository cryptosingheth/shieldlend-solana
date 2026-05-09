import * as grpc from "@grpc/grpc-js";
import { Connection, PublicKey } from "@solana/web3.js";

export const ENCRYPT_SDK_PACKAGE = "@encrypt.xyz/pre-alpha-solana-client";
export const ENCRYPT_SDK_VERSION = "0.1.0";
export const ENCRYPT_GRPC_IMPORT = "@encrypt.xyz/pre-alpha-solana-client/grpc";
export const ENCRYPT_GRPC_DEFAULT = "pre-alpha-dev-1.encrypt.ika-network.net:443";
export const ENCRYPT_RPC_DEFAULT = "https://api.devnet.solana.com";
export const ENCRYPT_PROGRAM_ID = "4ebfzWdKnrnGseuQpezXdG8yCdHqwQ1SSBHD3bWArND8";
export const ENCRYPT_FHE_TYPE_EUINT64 = 4;

export const ENCRYPT_PRE_ALPHA_DISCLAIMER =
  "Encrypt pre-alpha is for SDK exploration only. The official docs state there is no real encryption guarantee in pre-alpha, data may be plaintext/public, keys and trust model are not final, and devnet state may be wiped.";

export type EncryptRailMode = "client-probe" | "live-create-input";

export interface EncryptNetworkKey {
  account: string;
  discriminator: number;
  publicKeyHex: string;
  active: boolean;
}

export interface EncryptProbeResult {
  configured: boolean;
  sdkPackage: string;
  sdkVersion: string;
  grpcApi: string;
  grpcUrl: string;
  rpcUrl: string;
  programId: string;
  clientConstructed: boolean;
  sdkImportStatus: "blocked" | "not-checked";
  sdkImportNote: string;
  networkKeys: EncryptNetworkKey[];
  selectedNetworkKeyHex?: string;
  anchorIntegration: {
    dependencyPattern: string;
    compileStatus: "compile-wired-local-fork" | "blocked";
    blocker: string;
    onChainFheLive: false;
  };
  liveCreateInput?: {
    requested: boolean;
    healthRatioBps: string;
    ciphertextIdentifierHex?: string;
    ciphertextIdentifierBase58?: string;
  };
  claimBoundary: string;
}

export interface EncryptHealthRatioInput {
  loanPda: string;
  healthRatioBps: bigint;
  authorizedProgramId?: string;
  grpcUrl?: string;
  rpcUrl?: string;
  encryptProgramId?: string;
  networkEncryptionPublicKeyHex?: string;
}

type CreateInputRequest = {
  chain: number;
  inputs: Array<{ ciphertextBytes: Buffer; fheType: number }>;
  proof: Buffer;
  authorized: Buffer;
  networkEncryptionPublicKey: Buffer;
};

function normalizeGrpcTarget(input: string): string {
  return input.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function encodeVarint(value: number | bigint): Buffer {
  let n = BigInt(value);
  const out: number[] = [];
  do {
    let byte = Number(n & 0x7fn);
    n >>= 7n;
    if (n !== 0n) byte |= 0x80;
    out.push(byte);
  } while (n !== 0n);
  return Buffer.from(out);
}

function encodeFieldKey(field: number, wireType: number): Buffer {
  return encodeVarint((field << 3) | wireType);
}

function encodeBytesField(field: number, value: Buffer): Buffer {
  return Buffer.concat([encodeFieldKey(field, 2), encodeVarint(value.length), value]);
}

function encodeVarintField(field: number, value: number): Buffer {
  return Buffer.concat([encodeFieldKey(field, 0), encodeVarint(value)]);
}

function encodeEncryptedInput(input: { ciphertextBytes: Buffer; fheType: number }): Buffer {
  return Buffer.concat([
    encodeBytesField(1, input.ciphertextBytes),
    encodeVarintField(2, input.fheType),
  ]);
}

function encodeCreateInputRequest(request: CreateInputRequest): Buffer {
  const fields = [encodeVarintField(1, request.chain)];
  for (const input of request.inputs) fields.push(encodeBytesField(2, encodeEncryptedInput(input)));
  if (request.proof.length > 0) fields.push(encodeBytesField(3, request.proof));
  fields.push(encodeBytesField(4, request.authorized));
  fields.push(encodeBytesField(5, request.networkEncryptionPublicKey));
  return Buffer.concat(fields);
}

function readVarint(buffer: Buffer, offset: number): { value: bigint; offset: number } {
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

function decodeCreateInputResponse(buffer: Buffer): { ciphertextIdentifiers: Buffer[] } {
  const ciphertextIdentifiers: Buffer[] = [];
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

function createEncryptGrpcClient(grpcUrl: string) {
  const service = {
    createInput: {
      path: "/encrypt.v1.EncryptService/CreateInput",
      requestStream: false,
      responseStream: false,
      requestSerialize: (value: CreateInputRequest) => encodeCreateInputRequest(value),
      requestDeserialize: (value: Buffer) => value,
      responseSerialize: (value: Buffer) => value,
      responseDeserialize: (value: Buffer) => decodeCreateInputResponse(value),
    },
  } as const;

  const Client = grpc.makeGenericClientConstructor(service, "EncryptService") as unknown as {
    new (address: string, credentials: grpc.ChannelCredentials): grpc.Client & {
      createInput(
        request: CreateInputRequest,
        callback: (error: grpc.ServiceError | null, response?: { ciphertextIdentifiers: Buffer[] }) => void
      ): grpc.ClientUnaryCall;
    };
  };

  return new Client(normalizeGrpcTarget(grpcUrl), grpc.credentials.createSsl());
}

function hexToBytes32(hex: string): Buffer {
  const cleaned = hex.replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{64}$/.test(cleaned)) {
    throw new Error("Encrypt network encryption public key must be a 32-byte hex string.");
  }
  return Buffer.from(cleaned, "hex");
}

function u64Le(value: bigint): Buffer {
  if (value < 0n || value > 18_446_744_073_709_551_615n) {
    throw new Error("healthRatioBps must fit in u64.");
  }
  const out = Buffer.alloc(8);
  out.writeBigUInt64LE(value);
  return out;
}

export async function discoverEncryptNetworkKeys(
  rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? ENCRYPT_RPC_DEFAULT,
  encryptProgramId = process.env.ENCRYPT_PROGRAM_ID ?? ENCRYPT_PROGRAM_ID
): Promise<EncryptNetworkKey[]> {
  const connection = new Connection(rpcUrl, "confirmed");
  const accounts = await connection.getProgramAccounts(new PublicKey(encryptProgramId), {
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

export async function createEncryptHealthRatioInput(
  params: EncryptHealthRatioInput
): Promise<{ ciphertextIdentifier: Buffer; selectedNetworkKeyHex: string }> {
  const networkKeyHex =
    params.networkEncryptionPublicKeyHex ??
    process.env.ENCRYPT_NETWORK_PUBLIC_KEY_HEX ??
    (await discoverEncryptNetworkKeys(params.rpcUrl, params.encryptProgramId))[0]?.publicKeyHex;

  if (!networkKeyHex) {
    throw new Error("No active Encrypt network encryption key found on devnet.");
  }

  const client = createEncryptGrpcClient(params.grpcUrl ?? process.env.ENCRYPT_GRPC_URL ?? ENCRYPT_GRPC_DEFAULT);
  try {
    const authorized = new PublicKey(params.authorizedProgramId ?? process.env.NEXT_PUBLIC_LENDING_POOL_PROGRAM_ID ?? "HLtWrvLyc2SE3ERWHaEdY4RG84GxFfHv3Qf4NzJPxaF7").toBuffer();
    const loanBinding = new PublicKey(params.loanPda).toBuffer();
    const healthRatio = u64Le(params.healthRatioBps);
    const ciphertextBytes = Buffer.concat([Buffer.from("shieldlend-health-v1"), loanBinding, healthRatio]);

    const response = await new Promise<{ ciphertextIdentifiers: Buffer[] }>((resolve, reject) => {
      client.createInput(
        {
          chain: 0,
          inputs: [{ ciphertextBytes, fheType: ENCRYPT_FHE_TYPE_EUINT64 }],
          proof: Buffer.alloc(0),
          authorized,
          networkEncryptionPublicKey: hexToBytes32(networkKeyHex),
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result ?? { ciphertextIdentifiers: [] });
        }
      );
    });

    const [ciphertextIdentifier] = response.ciphertextIdentifiers;
    if (!ciphertextIdentifier) throw new Error("Encrypt createInput returned no ciphertext identifier.");
    return { ciphertextIdentifier, selectedNetworkKeyHex: networkKeyHex };
  } finally {
    client.close();
  }
}

export async function probeEncryptRail(options: {
  mode?: EncryptRailMode;
  loanPda?: string;
  healthRatioBps?: bigint;
} = {}): Promise<EncryptProbeResult> {
  const grpcUrl = process.env.ENCRYPT_GRPC_URL ?? ENCRYPT_GRPC_DEFAULT;
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? ENCRYPT_RPC_DEFAULT;
  const programId = process.env.ENCRYPT_PROGRAM_ID ?? ENCRYPT_PROGRAM_ID;
  const client = createEncryptGrpcClient(grpcUrl);
  client.close();

  let networkKeys: EncryptNetworkKey[] = [];
  try {
    networkKeys = await discoverEncryptNetworkKeys(rpcUrl, programId);
  } catch {
    networkKeys = [];
  }

  const result: EncryptProbeResult = {
    configured: Boolean(grpcUrl && programId),
    sdkPackage: ENCRYPT_SDK_PACKAGE,
    sdkVersion: ENCRYPT_SDK_VERSION,
    grpcApi: "encrypt.v1.EncryptService/CreateInput",
    grpcUrl: normalizeGrpcTarget(grpcUrl),
    rpcUrl,
    programId,
    clientConstructed: true,
    sdkImportStatus: "blocked",
    sdkImportNote:
      `${ENCRYPT_GRPC_IMPORT} in ${ENCRYPT_SDK_PACKAGE}@${ENCRYPT_SDK_VERSION} resolves to TypeScript source in node_modules; the adapter uses the same documented gRPC service directly via @grpc/grpc-js.`,
    networkKeys,
    selectedNetworkKeyHex: process.env.ENCRYPT_NETWORK_PUBLIC_KEY_HEX ?? networkKeys[0]?.publicKeyHex,
    anchorIntegration: {
      dependencyPattern:
        "encrypt-types + encrypt-solana-dsl + encrypt-anchor from dwallet-labs/encrypt-pre-alpha with anchor-lang 0.32",
      compileStatus: "compile-wired-local-fork",
      blocker:
        "Official upstream encrypt-anchor still expects solana_account_info 3.1.x AccountInfo while ShieldLend Anchor 0.32.1 supplies solana_account_info 2.3.x. ShieldLend now vendors a minimal Anchor 0.32-compatible encrypt-anchor fork and compile-wires a separate lending_pool CPI request/reveal path, but live on-chain Encrypt/FHE remains unproven.",
      onChainFheLive: false,
    },
    claimBoundary: ENCRYPT_PRE_ALPHA_DISCLAIMER,
  };

  if (options.mode === "live-create-input" && options.loanPda) {
    const healthRatioBps = options.healthRatioBps ?? 15_000n;
    const created = await createEncryptHealthRatioInput({
      loanPda: options.loanPda,
      healthRatioBps,
      grpcUrl,
      rpcUrl,
      encryptProgramId: programId,
    });
    result.liveCreateInput = {
      requested: true,
      healthRatioBps: healthRatioBps.toString(),
      ciphertextIdentifierHex: created.ciphertextIdentifier.toString("hex"),
      ciphertextIdentifierBase58:
        created.ciphertextIdentifier.length === 32
          ? new PublicKey(created.ciphertextIdentifier).toBase58()
          : undefined,
    };
    result.selectedNetworkKeyHex = created.selectedNetworkKeyHex;
  }

  return result;
}
