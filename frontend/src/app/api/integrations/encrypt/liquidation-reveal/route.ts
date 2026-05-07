import { NextResponse } from "next/server";
import {
  createEncryptHealthRatioInput,
  ENCRYPT_PRE_ALPHA_DISCLAIMER,
} from "../../../../../lib/privacyRails/encrypt";

export async function POST(request: Request) {
  const body = await request.json();
  for (const key of ["loanPda", "ciphertextHandle", "collateralValueHandle", "outstandingDebtLamports", "liquidationThresholdBps"]) {
    if (typeof body[key] !== "string" || body[key].length === 0) {
      return NextResponse.json({ error: `Missing ${key}` }, { status: 400 });
    }
  }

  if (body.createHealthRatioInput === true) {
    const healthRatioBps = typeof body.healthRatioBps === "string" ? BigInt(body.healthRatioBps) : 15_000n;
    const created = await createEncryptHealthRatioInput({
      loanPda: body.loanPda,
      healthRatioBps,
    });

    return NextResponse.json({
      provider: "encrypt",
      operation: "encrypt.v1.EncryptService/CreateInput",
      graph: "shieldlend_liquidation_health_v1",
      healthRatioBps: healthRatioBps.toString(),
      ciphertextIdentifierHex: created.ciphertextIdentifier.toString("hex"),
      selectedNetworkKeyHex: created.selectedNetworkKeyHex,
      claimBoundary: ENCRYPT_PRE_ALPHA_DISCLAIMER,
    });
  }

  return NextResponse.json({
    provider: "encrypt",
    operation: "client_gRPC_probe_only",
    graph: "shieldlend_liquidation_health_v1",
    loanPda: body.loanPda,
    ciphertextHandle: body.ciphertextHandle,
    collateralValueHandle: body.collateralValueHandle,
    outstandingDebtLamports: body.outstandingDebtLamports,
    liquidationThresholdBps: body.liquidationThresholdBps,
    claimBoundary: ENCRYPT_PRE_ALPHA_DISCLAIMER,
  });
}
