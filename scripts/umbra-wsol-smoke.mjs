#!/usr/bin/env node

process.env.UMBRA_FUNDED_ASSET_KIND = process.env.UMBRA_FUNDED_ASSET_KIND || "wsol";
process.env.UMBRA_FUNDED_MINT = process.env.UMBRA_FUNDED_MINT || "So11111111111111111111111111111111111111112";

await import("./umbra-funded-smoke.mjs");
