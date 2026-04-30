import { NextResponse } from "next/server";
import { buildIkaFutureSignApprovalContext } from "../../../../../lib/prealphaIntegrations";

export async function POST(request: Request) {
  const body = await request.json();
  for (const key of ["loanId", "loanPda", "messageHash", "userPublicKey", "signatureScheme"]) {
    if (typeof body[key] !== "string" || body[key].length === 0) {
      return NextResponse.json({ error: `Missing ${key}` }, { status: 400 });
    }
  }

  return NextResponse.json(
    buildIkaFutureSignApprovalContext({
      loanId: body.loanId,
      loanPda: body.loanPda,
      messageHash: body.messageHash,
      userPublicKey: body.userPublicKey,
      signatureScheme: body.signatureScheme,
    })
  );
}
