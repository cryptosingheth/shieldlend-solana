import { NextResponse } from "next/server";
import {
  getUmbraFundedFlowStatus,
  getUmbraRailConfig,
  getUmbraStatus,
} from "../../../../../lib/privacyRails/umbra";

async function fetchHealth(url: string, path: string) {
  if (!url) return { ok: false, status: 0, body: "missing-url" };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}${path}`, {
      signal: controller.signal,
      cache: "no-store",
    });
    return {
      ok: response.ok,
      status: response.status,
      body: await response.text().catch(() => ""),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET() {
  const config = getUmbraRailConfig();
  const sdk = getUmbraStatus(config);
  const fundedFlow = getUmbraFundedFlowStatus();
  const [indexerHealth, relayerHealth] = await Promise.all([
    fetchHealth(config.indexerApiEndpoint, "/health"),
    fetchHealth(config.relayerApiEndpoint, "/v1/health"),
  ]);

  return NextResponse.json({
    sdk,
    fundedFlow,
    health: {
      indexer: indexerHealth,
      relayer: relayerHealth,
    },
    payoutRoute: {
      c2hPreserved: true,
      currentShieldLendWithdrawAsset: "native-sol",
      usesUmbraForNativeSolWithdraw: false,
      requirement: "Native SOL C2H withdraw still needs a wSOL/SPL settlement leg before Umbra routing can be claimed.",
    },
  });
}
