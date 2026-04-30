import { NextResponse } from "next/server";
import { buildEncryptLiquidationRevealContext } from "../../../../../lib/prealphaIntegrations";

export async function POST(request: Request) {
  const body = await request.json();
  for (const key of ["loanPda", "ciphertextHandle", "collateralValueHandle", "outstandingDebtLamports", "liquidationThresholdBps"]) {
    if (typeof body[key] !== "string" || body[key].length === 0) {
      return NextResponse.json({ error: `Missing ${key}` }, { status: 400 });
    }
  }

  return NextResponse.json(
    buildEncryptLiquidationRevealContext({
      loanPda: body.loanPda,
      ciphertextHandle: body.ciphertextHandle,
      collateralValueHandle: body.collateralValueHandle,
      outstandingDebtLamports: body.outstandingDebtLamports,
      liquidationThresholdBps: body.liquidationThresholdBps,
    })
  );
}
