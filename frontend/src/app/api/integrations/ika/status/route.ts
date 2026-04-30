import { NextResponse } from "next/server";
import { getIkaPreAlphaStatus } from "../../../../../lib/prealphaIntegrations";

export async function GET() {
  return NextResponse.json(await getIkaPreAlphaStatus());
}
