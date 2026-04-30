/* global React, Icon, SS_DATA, SS_FMT */
const { useState: useBS, useMemo: useBM } = React;

const BorrowScreen = () => {
  const [tab, setTab] = useBS("borrow");
  const [amount, setAmount] = useBS("");
  const [submitted, setSubmitted] = useBS(false);
  const totalDeposit = SS_DATA.positions.deposits.reduce((a, d) => a + d.amount, 0);
  const maxBorrow = (totalDeposit * 0.66);
  const num = Number(amount) || 0;
  const newHF = num > 0 ? (totalDeposit * 0.66 / num) : Infinity;
  const valid = num > 0 && num <= maxBorrow;
  const borrows = SS_DATA.positions.borrows;
  const totalOutstanding = borrows.reduce((a, b) => a + b.amount, 0);

  return (
    <div className="col gap-32 fade-up" style={{ maxWidth: 720 }}>
      <div className="col gap-6">
        <span className="t-cap">Borrow</span>
        <h1 className="t-h1 fg-1">Borrow against your shielded balance.</h1>
        <p className="t-body-l">Use your deposits as collateral. Funds arrive at a fresh address — no on-chain link to your wallet.</p>
      </div>

      <div className="card">
        <div className="seg" style={{ marginBottom: 22 }}>
          <button className="seg-item" data-active={tab==="borrow"} onClick={() => { setTab("borrow"); setSubmitted(false); setAmount(""); }}>Borrow</button>
          <button className="seg-item" data-active={tab==="repay"}  onClick={() => { setTab("repay"); setSubmitted(false); setAmount(""); }}>Repay</button>
        </div>

        {tab === "borrow" && (
          <>
            <div className="card-quiet" style={{ padding: 22 }}>
              <div className="row between" style={{ marginBottom: 8 }}>
                <span className="t-cap">You borrow</span>
                <span className="t-cap">Max · <span className="fg-2 t-num">{maxBorrow.toFixed(2)} SOL</span></span>
              </div>
              <div className="row gap-12" style={{ alignItems: "center" }}>
                <input className="amount-input" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}/>
                <span className="row gap-8" style={{ padding: "8px 12px", background: "var(--surface-2)", borderRadius: 999, border: "1px solid var(--hairline-soft)" }}>
                  <span className="asset" style={{ width: 22, height: 22, fontSize: 9 }}>SOL</span>
                  <span className="t-body fg-1">SOL</span>
                </span>
              </div>
              <div className="row between" style={{ marginTop: 10 }}>
                <span className="t-cap">≈ {SS_FMT.usd(num * 250)}</span>
                <div className="row gap-6">
                  {[25, 50, 75].map(p => (
                    <button key={p} className="btn btn-sm btn-ghost" onClick={() => setAmount(((maxBorrow * p) / 100).toFixed(2))}>{p}%</button>
                  ))}
                </div>
              </div>
            </div>

            <div className="col gap-10" style={{ marginTop: 22 }}>
              <Row k="Borrow APR" v={`${SS_DATA.market.borrowApr}%`}/>
              <Row k="Collateral" v={`${totalDeposit.toFixed(2)} SOL deposited`}/>
              <Row k="Health factor after" v={
                <span className={newHF >= 1.5 ? "fg-good" : newHF >= 1.1 ? "fg-warn" : "fg-danger"}>
                  {Number.isFinite(newHF) ? newHF.toFixed(2) : "—"}
                </span>
              }/>
              <Row k="Liquidation at price" v="≈ $137 / SOL"/>
              <Row k="Privacy" v={<span className="row gap-6"><Icon name="shield" size={11} color="var(--seal)"/><span className="fg-seal">Shielded</span></span>}/>
            </div>

            <button className="btn btn-primary btn-block btn-lg" style={{ marginTop: 22 }} disabled={!valid || submitted} onClick={() => setSubmitted(true)}>
              {submitted ? "Confirming…" : valid ? `Borrow ${num.toFixed(2)} SOL` : "Enter an amount"}
            </button>
            {num > maxBorrow && num > 0 && <div className="t-cap fg-warn" style={{ marginTop: 8, textAlign: "center" }}>Above safe borrow limit. Lower the amount.</div>}
          </>
        )}

        {tab === "repay" && (
          <>
            <div className="col gap-10" style={{ marginBottom: 18 }}>
              {borrows.map(b => (
                <div key={b.id} className="card-quiet" style={{ padding: 16 }}>
                  <div className="row between">
                    <div className="col">
                      <span className="t-body fg-1 t-num">{b.amount.toFixed(2)} SOL</span>
                      <span className="t-cap">{b.apr}% APR · HF {b.hf.toFixed(2)}</span>
                    </div>
                    <button className="btn btn-quiet btn-sm">Repay full</button>
                  </div>
                </div>
              ))}
              <Row k="Total outstanding" v={`${totalOutstanding.toFixed(2)} SOL`}/>
            </div>

            <div className="card-quiet" style={{ padding: 22 }}>
              <div className="row between" style={{ marginBottom: 8 }}>
                <span className="t-cap">Repay amount</span>
                <span className="t-cap">Outstanding · <span className="fg-2 t-num">{totalOutstanding.toFixed(2)} SOL</span></span>
              </div>
              <div className="row gap-12" style={{ alignItems: "center" }}>
                <input className="amount-input" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}/>
                <span className="row gap-8" style={{ padding: "8px 12px", background: "var(--surface-2)", borderRadius: 999, border: "1px solid var(--hairline-soft)" }}>
                  <span className="asset" style={{ width: 22, height: 22, fontSize: 9 }}>SOL</span>
                  <span className="t-body fg-1">SOL</span>
                </span>
              </div>
            </div>

            <button className="btn btn-primary btn-block btn-lg" style={{ marginTop: 22 }} disabled={!(num > 0) || submitted} onClick={() => setSubmitted(true)}>
              {submitted ? "Confirming…" : num > 0 ? `Repay ${num.toFixed(2)} SOL` : "Enter an amount"}
            </button>
          </>
        )}

        {submitted && (
          <div className="card-quiet fade-up" style={{ marginTop: 16, padding: 16 }}>
            <div className="row gap-10" style={{ marginBottom: 8 }}>
              <span style={{ width: 22, height: 22, borderRadius: 999, background: "var(--seal-soft)", color: "var(--seal)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="check" size={12}/></span>
              <span className="t-body fg-1">Submitted privately.</span>
            </div>
            <div className="t-body fg-3">A receipt has been added to <strong className="fg-2">Activity</strong>.</div>
          </div>
        )}
      </div>
    </div>
  );
};

const Row = ({ k, v }) => (
  <div className="row between">
    <span className="t-body fg-3">{k}</span>
    <span className="t-body fg-1 t-num">{v}</span>
  </div>
);

window.BorrowScreen = BorrowScreen;
