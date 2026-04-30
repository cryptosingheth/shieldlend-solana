declare module "circomlibjs" {
  export function buildPoseidon(): Promise<{
    (inputs: bigint[]): unknown;
    F: { toObject(value: unknown): bigint };
  }>;
}

declare module "snarkjs" {
  export const groth16: {
    fullProve(
      input: Record<string, unknown>,
      wasmFile: string,
      zkeyFile: string
    ): Promise<{ proof: object; publicSignals: string[] }>;
  };
}
