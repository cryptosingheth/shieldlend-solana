/* global React, Icon, SS_DATA, SS_FMT */
const { useState: useDS } = React;

const Dashboard = ({ onNav }) => {
  const u = SS_DATA.user;
  const totalDeposits = SS_DATA.positions.deposits.reduce((a, d) => a + d.amount, 0);
  const totalBorrows  = SS_DATA.positions.borrows.reduce((a, b) => a + b.amount, 0);
  return (
    <div className="col gap-32 fade-up">
      {/* Hero */}
      <section className="card-feature">
        <div className="row between" style={{ alignItems: "flex-start", gap: 24 }}>
          <div className="col gap-12">
            <div className="row gap-8">
              <span className="chip" data-tone="seal"><span className="dot"/>Shielded</span>
              <span className="chip"><Icon name="lock" size={11}/> Only visible to you</span>
            </div>
            <div className="col gap-4">
              <span className="t-cap">Your shielded balance</span>
              <div className="row gap-12 items-baseline">
                <span className="t-num-xl fg-1">{u.shieldedBalance.toFixed(2)}</span>
                <span className="t-h2 fg-3">SOL</span>
              </div>
              <span className="t-body fg-3">≈ {SS_FMT.usd(u.netWorth)} · earning {u.apr}% APY</span>
            </div>
          </div>
          <div className="row gap-10">
            <button className="btn btn-quiet" onClick={() => onNav("earn")}><Icon name="deposit" size={14}/> Deposit</button>
            <button className="btn btn-quiet" onClick={() => onNav("earn")}><Icon name="withdraw" size={14}/> Withdraw</button>
            <button className="btn btn-primary" onClick={() => onNav("borrow")}><Icon name="borrow" size={14}/> Borrow</button>
          </div>
        </div>

        {/* sub stats */}
        <div className="row gap-32" style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid var(--hairline-soft)", flexWrap: "wrap" }}>
          <Stat label="Total deposited" value={`${totalDeposits.toFixed(2)} SOL`} sub={SS_FMT.usd(totalDeposits * 250)}/>
          <Stat label="Total borrowed" value={`${totalBorrows.toFixed(2)} SOL`} sub={`@ ${SS_DATA.market.borrowApr}% APR`}/>
          <Stat label="Health factor" value={u.healthFactor.toFixed(2)} sub="Healthy" tone="good"/>
          <Stat label="Net APY" value={`+${(u.apr - 1.0).toFixed(1)}%`} sub="After borrow cost" tone="good"/>
        </div>
      </section>

      {/* Two columns: positions + market */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)", gap: 24 }}>
        <PositionsCard onNav={onNav}/>
        <MarketCard/>
      </div>

      <RecentActivity onNav={onNav}/>
    </div>
  );
};

const Stat = ({ label, value, sub, tone }) => (
  <div className="col gap-4" style={{ minWidth: 140 }}>
    <span className="t-cap">{label}</span>
    <span className="t-h2 fg-1 t-num">{value}</span>
    <span className={`t-cap ${tone === "good" ? "fg-good" : ""}`}>{sub}</span>
  </div>
);

const PositionsCard = ({ onNav }) => {
  const [tab, setTab] = useDS("deposits");
  const list = tab === "deposits" ? SS_DATA.positions.deposits : SS_DATA.positions.borrows;
  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 16 }}>
        <span className="t-h3 fg-1">Your positions</span>
        <div className="seg">
          <button className="seg-item" data-active={tab==="deposits"} onClick={() => setTab("deposits")}>Deposits</button>
          <button className="seg-item" data-active={tab==="borrows"}  onClick={() => setTab("borrows")}>Borrows</button>
        </div>
      </div>
      {list.length === 0 ? (
        <div className="t-body fg-3" style={{ padding: "20px 0" }}>No {tab} yet.</div>
      ) : (
        <div className="col">
          {list.map((p, i) => (
            <div key={p.id} className="row gap-12" style={{ padding: "14px 0", borderBottom: i < list.length - 1 ? "1px solid var(--hairline-soft)" : "none" }}>
              <span className="asset">SOL</span>
              <div className="col" style={{ flex: 1 }}>
                <span className="t-body fg-1 t-num">{p.amount.toFixed(2)} SOL</span>
                <span className="t-cap">{SS_FMT.usd(p.valueUSD)}{p.age ? ` · ${p.age}` : ""}</span>
              </div>
              <div className="col" style={{ alignItems: "flex-end" }}>
                <span className="t-body fg-1">{tab === "deposits" ? `${p.apy}% APY` : `${p.apr}% APR`}</span>
                {tab === "borrows" && <span className="t-cap">HF {p.hf.toFixed(2)}</span>}
              </div>
              <button className="btn btn-sm btn-ghost"><Icon name="chev" size={12}/></button>
            </div>
          ))}
        </div>
      )}
      <div className="row gap-10" style={{ marginTop: 16 }}>
        <button className="btn btn-quiet btn-sm" onClick={() => onNav(tab === "deposits" ? "earn" : "borrow")}>
          <Icon name={tab === "deposits" ? "deposit" : "borrow"} size={12}/>
          {tab === "deposits" ? "New deposit" : "New borrow"}
        </button>
      </div>
    </div>
  );
};

const MarketCard = () => {
  const m = SS_DATA.market;
  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 16 }}>
        <span className="t-h3 fg-1">SOL market</span>
        <span className="chip"><Icon name="bolt" size={10}/> Live</span>
      </div>
      <div className="col gap-14">
        <Row label="Supply APY" value={`${m.supplyApy}%`}/>
        <Row label="Borrow APR" value={`${m.borrowApr}%`}/>
        <Row label="Total supplied" value={`${(m.totalSupplied/1000).toFixed(1)}k SOL`}/>
        <Row label="Total borrowed" value={`${(m.totalBorrowed/1000).toFixed(1)}k SOL`}/>
        <div className="col gap-6" style={{ marginTop: 6 }}>
          <div className="row between">
            <span className="t-cap">Utilization</span>
            <span className="t-cap fg-2">{(m.utilization * 100).toFixed(1)}%</span>
          </div>
          <div className="bar"><div className="bar-fill" style={{ width: `${m.utilization * 100}%` }}/></div>
        </div>
      </div>
    </div>
  );
};

const Row = ({ label, value }) => (
  <div className="row between">
    <span className="t-body fg-3">{label}</span>
    <span className="t-body fg-1 t-num">{value}</span>
  </div>
);

const RecentActivity = ({ onNav }) => (
  <div className="card">
    <div className="row between" style={{ marginBottom: 14 }}>
      <span className="t-h3 fg-1">Recent activity</span>
      <button className="btn btn-sm btn-ghost" onClick={() => onNav("history")}>View all <Icon name="chev" size={11}/></button>
    </div>
    <div className="col">
      {SS_DATA.history.slice(0, 4).map((h, i) => (
        <div key={h.id} className="row gap-14" style={{ padding: "12px 0", borderBottom: i < 3 ? "1px solid var(--hairline-soft)" : "none" }}>
          <ActIcon kind={h.kind}/>
          <div className="col" style={{ flex: 1 }}>
            <span className="t-body fg-1">{h.note}</span>
            <span className="t-cap">{h.t}</span>
          </div>
          <span className="t-body fg-1 t-num">{h.kind === "withdraw" || h.kind === "borrow" ? "−" : "+"}{h.amount.toFixed(2)} SOL</span>
          <span className="chip" data-tone="seal" title="This action is shielded — your wallet does not appear on-chain"><Icon name="shield" size={10}/></span>
        </div>
      ))}
    </div>
  </div>
);

const ActIcon = ({ kind }) => {
  const M = {
    deposit:  { icon: "deposit",  tone: "var(--brand)" },
    withdraw: { icon: "withdraw", tone: "var(--fg-2)" },
    borrow:   { icon: "borrow",   tone: "var(--warn)" },
    repay:    { icon: "repay",    tone: "var(--good)" },
  };
  const m = M[kind] || M.deposit;
  return (
    <span style={{ width: 32, height: 32, borderRadius: 999, background: "var(--surface-1)", border: "1px solid var(--hairline-soft)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: m.tone }}>
      <Icon name={m.icon} size={14}/>
    </span>
  );
};

window.Dashboard = Dashboard;
