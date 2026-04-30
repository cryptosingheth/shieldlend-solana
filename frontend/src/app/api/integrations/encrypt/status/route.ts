import { NextResponse } from "next/server";
import { getEncryptPreAlphaStatus } from "../../../../../lib/prealphaIntegrations";

export async function GET() {
  return NextResponse.json(await getEncryptPreAlphaStatus());
}
