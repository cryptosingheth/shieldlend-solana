// ShieldedSOL v2 — minimal mock state. Domain language only — no protocol names.

window.SS_DATA = {
  user: {
    address: "0x7gB…kQz",
    shieldedBalance: 12.50, // SOL
    apr: 4.2,
    netWorth: 3127.50, // USD
    healthFactor: 2.41,
  },
  positions: {
    deposits: [
      { id: "d1", asset: "SOL", amount: 8.0,  apy: 4.2, valueUSD: 2000, age: "2d" },
      { id: "d2", asset: "SOL", amount: 3.0,  apy: 4.2, valueUSD: 750,  age: "9d" },
      { id: "d3", asset: "SOL", amount: 1.5,  apy: 4.2, valueUSD: 375,  age: "21d" },
    ],
    borrows: [
      { id: "b1", asset: "SOL", amount: 0.50, apr: 6.2, valueUSD: 125, ltv: 0.42, hf: 2.41 },
      { id: "b2", asset: "SOL", amount: 1.20, apr: 6.2, valueUSD: 300, ltv: 0.55, hf: 1.82 },
    ],
  },
  market: {
    totalSupplied: 184320,    // SOL
    totalBorrowed: 67410,
    supplyApy: 4.2,
    borrowApr: 6.2,
    utilization: 0.366,
  },
  history: [
    { id: "h1", t: "Just now",   kind: "deposit",  amount: 2.0, asset: "SOL", note: "Deposited to shielded balance", privacy: "shielded" },
    { id: "h2", t: "12m ago",    kind: "borrow",   amount: 0.5, asset: "SOL", note: "Borrow against shielded collateral", privacy: "shielded" },
    { id: "h3", t: "1h ago",     kind: "repay",    amount: 0.3, asset: "SOL", note: "Repaid loan #b1", privacy: "shielded" },
    { id: "h4", t: "Yesterday",  kind: "withdraw", amount: 1.0, asset: "SOL", note: "Withdrew to fresh address", privacy: "shielded" },
    { id: "h5", t: "3 days ago", kind: "deposit",  amount: 5.0, asset: "SOL", note: "Deposited to shielded balance", privacy: "shielded" },
    { id: "h6", t: "1 week ago", kind: "borrow",   amount: 1.2, asset: "SOL", note: "Borrow against shielded collateral", privacy: "shielded" },
  ],
  // Privacy artifacts — surfaced only in History detail
  keys: {
    viewing: "vk_8a3b…f912",  // shareable read-only key
    spending:"sk_9f2c…a781",  // never display in full
    nullifier:"nf_3d8e…ee21",
  },
};

window.SS_FMT = {
  sol: (n, dp = 4) => `${Number(n).toFixed(dp)} SOL`,
  usd: (n) => "$" + Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 }),
  pct: (n, dp = 2) => `${(n * 100).toFixed(dp)}%`,
};
