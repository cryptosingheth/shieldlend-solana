/* global React */
// ShieldLend — shared data layer (mock state)

const SL_DATA = (() => {
  const now = Date.now();
  const day = 86400000;

  const notes = [
    { id: "n01", commitmentShort: "0xa31c…f2ee", denom: 1.0, status: "Active", createdAt: now - 14*day, ringReady: 16, slot: 312410991 },
    { id: "n02", commitmentShort: "0x73bd…a91b", denom: 1.0, status: "Locked", createdAt: now - 9*day,  ringReady: 16, slot: 312280004, loanId: "ab12…d3" },
    { id: "n03", commitmentShort: "0xff04…7c2a", denom: 10.0, status: "Active", createdAt: now - 21*day, ringReady: 16, slot: 311900512 },
    { id: "n04", commitmentShort: "0x10de…5b09", denom: 0.1, status: "Active", createdAt: now - 4*day, ringReady: 11, slot: 312615009 },
    { id: "n05", commitmentShort: "0x9c2f…3a18", denom: 1.0, status: "Active", createdAt: now - 31*day, ringReady: 16, slot: 311102045 },
  ];

  const loans = [
    {
      id: "ab12…d3",
      collateralRef: "n02",
      bucket: 0.5,
      principal: 0.5,
      interest: 0.0700,
      outstanding: 1.0700,
      apr: 6.2,
      hf: 2.41,
      borrowedAt: now - 9*day,
      lastAccrual: 4100000,
      status: "Active",
    },
    {
      id: "ce93…81f",
      collateralRef: "n03",
      bucket: 5.0,
      principal: 5.0,
      interest: 0.0420,
      outstanding: 5.0420,
      apr: 5.8,
      hf: 3.18,
      borrowedAt: now - 3*day,
      lastAccrual: 4189322,
      status: "Active",
    },
  ];

  const buckets = [
    { v: 0.1, depth: 64, flushMin: 6 },
    { v: 0.5, depth: 41, flushMin: 9 },
    { v: 1.0, depth: 27, flushMin: 14 },
    { v: 5.0, depth: 9,  flushMin: 28 },
    { v: 10.0, depth: 3, flushMin: null },
  ];

  const history = [
    { id: "h01", op: "DEPOSIT",  amount: 1.0, bucket: 1.0,  ts: now - 17*day, txShort: "4F7…kQa", nullShort: "3a8…ee1", memo: "rent for stealth-mainwallet" },
    { id: "h02", op: "BORROW",   amount: 0.5, bucket: 0.5,  ts: now - 9*day,  txShort: "9d2…m4b", loanId: "ab12…d3",   memo: "" },
    { id: "h03", op: "DEPOSIT",  amount: 10.0,bucket: 10.0, ts: now - 21*day, txShort: "ed1…9pe", nullShort: "ff4…b21", memo: "" },
    { id: "h04", op: "WITHDRAW", amount: 1.0, bucket: 1.0,  ts: now - 28*day, txShort: "01a…77c", nullShort: "5c1…d70", memo: "moved to cold" },
    { id: "h05", op: "DEPOSIT",  amount: 0.1, bucket: 0.1,  ts: now - 4*day,  txShort: "82c…9f1", nullShort: "10d…b09", memo: "" },
    { id: "h06", op: "BORROW",   amount: 5.0, bucket: 5.0,  ts: now - 3*day,  txShort: "4ab…2e8", loanId: "ce93…81f",   memo: "ops payroll" },
    { id: "h07", op: "DEPOSIT",  amount: 1.0, bucket: 1.0,  ts: now - 31*day, txShort: "77f…01d", nullShort: "9c2…a18", memo: "" },
  ];

  const rails = [
    { key: "ika",      name: "IKA dWallet",                role: "Authorization", lastEpoch: 4178, latencyMs: 1400 },
    { key: "per",      name: "MagicBlock PER",             role: "Routing",       lastEpoch: 4178, latencyMs: 220  },
    { key: "vrf",      name: "MagicBlock VRF",             role: "Anonymity",     lastEpoch: 4178, latencyMs: 110  },
    { key: "pay",      name: "MagicBlock Private Payments",role: "Settlement",    lastEpoch: 4177, latencyMs: 480  },
    { key: "encrypt", name: "Encrypt FHE",                role: "Computation",   lastEpoch: 4177, latencyMs: 720  },
    { key: "umbra",    name: "Umbra SDK",                  role: "Address",       lastEpoch: 4178, latencyMs: 90   },
    { key: "zk",       name: "groth16-solana verifier",    role: "Verification",  lastEpoch: 4178, latencyMs: 60   },
  ];

  return { notes, loans, buckets, history, rails };
})();

window.SL_DATA = SL_DATA;

// Shared formatters
window.SL_FMT = {
  sol: (n, dp = 4) => `${Number(n).toFixed(dp)} SOL`,
  ago: (ts) => {
    const s = Math.floor((Date.now() - ts)/1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s/60); if (m < 60) return `${m}m ago`;
    const h = Math.floor(m/60); if (h < 24) return `${h}h ago`;
    const d = Math.floor(h/24); return `${d}d ago`;
  },
  date: (ts) => {
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2,"0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },
};
