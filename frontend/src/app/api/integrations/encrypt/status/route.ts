import { NextResponse } from "next/server";
import { probeEncryptRail } from "../../../../../lib/privacyRails/encrypt";

export async function GET() {
  return NextResponse.json(await probeEncryptRail());
}
