/* global React, Icon, SS_DATA, SS_FMT */
const { useState: useES } = React;

const EarnScreen = () => {
  const [mode, setMode] = useES("deposit");
  const [amount, setAmount] = useES("");
  const [submitted, setSubmitted] = useES(false);
  const max = mode === "deposit" ? 24.0 : SS_DATA.user.shieldedBalance;
  const num = Number(amount) || 0;
  const valid = num > 0 && num <= max;

  return (
    <div className="col gap-32 fade-up" style={{ maxWidth: 720 }}>
      <div className="col gap-6">
        <span className="t-cap">Earn</span>
        <h1 className="t-h1 fg-1">Grow your SOL, privately.</h1>
        <p className="t-body-l">Deposits earn supply yield. Your balance and activity stay hidden from the public ledger.</p>
      </div>

      <div className="card">
        <div className="seg" style={{ marginBottom: 22 }}>
          <button className="seg-item" data-active={mode==="deposit"}  onClick={() => { setMode("deposit"); setSubmitted(false); }}>Deposit</button>
          <button className="seg-item" data-active={mode==="withdraw"} onClick={() => { setMode("withdraw"); setSubmitted(false); }}>Withdraw</button>
        </div>

        <div className="card-quiet" style={{ padding: 22 }}>
          <div className="row between" style={{ marginBottom: 8 }}>
            <span className="t-cap">{mode === "deposit" ? "You deposit" : "You withdraw"}</span>
            <span className="t-cap">Available · <span className="fg-2 t-num">{max.toFixed(2)} SOL</span></span>
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
              {[25, 50, 75, 100].map(p => (
                <button key={p} className="btn btn-sm btn-ghost" onClick={() => setAmount(((max * p) / 100).toFixed(2))}>{p === 100 ? "Max" : `${p}%`}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="col gap-10" style={{ marginTop: 22 }}>
          <Row k={mode === "deposit" ? "Supply APY" : "You'll receive"} v={mode === "deposit" ? `${SS_DATA.market.supplyApy}%` : `${num.toFixed(2)} SOL`}/>
          <Row k="Estimated yearly earnings" v={mode === "deposit" ? `+${(num * SS_DATA.market.supplyApy/100).toFixed(3)} SOL` : "—"}/>
          <Row k="Network fee" v="≈ 0.0001 SOL"/>
          <Row k="Privacy" v={<span className="row gap-6"><Icon name="shield" size={11} color="var(--seal)"/><span className="fg-seal">Shielded</span></span>}/>
        </div>

        <button className="btn btn-primary btn-block btn-lg" style={{ marginTop: 22 }} disabled={!valid || submitted} onClick={() => setSubmitted(true)}>
          {submitted ? "Confirming…" : valid ? `${mode === "deposit" ? "Deposit" : "Withdraw"} ${num.toFixed(2)} SOL` : "Enter an amount"}
        </button>

        {submitted && (
          <div className="card-quiet fade-up" style={{ marginTop: 16, padding: 16 }}>
            <div className="row gap-10" style={{ marginBottom: 8 }}>
              <span style={{ width: 22, height: 22, borderRadius: 999, background: "var(--seal-soft)", color: "var(--seal)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="check" size={12}/></span>
              <span className="t-body fg-1">Submitted privately.</span>
            </div>
            <div className="t-body fg-3">Your wallet does not appear on-chain for this action. A receipt has been added to <strong className="fg-2">Activity</strong> — keep it if you ever need to prove the transaction.</div>
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

window.EarnScreen = EarnScreen;
