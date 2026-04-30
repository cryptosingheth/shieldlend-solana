/* global React, Icon, PrivacyDisclosurePanel, StepperRow, SL_DATA, SL_FMT */
const { useState: useRState } = React;

const RepayScreen = ({ mode }) => {
  const loans = SL_DATA.loans.filter(l => l.status === "Active");
  const [loanId, setLoanId] = useRState(loans[0]?.id);
  const loan = loans.find(l => l.id === loanId) || loans[0];
  const [rail, setRail] = useRState(mode === "full" ? "private" : "public");
  const [step, setStep] = useRState(0);
  const [submitted, setSubmitted] = useRState(false);

  React.useEffect(() => { if (mode !== "full") setRail("public"); }, [mode]);

  React.useEffect(() => {
    if (!submitted) return;
    let cancel = false;
    (async () => {
      for (let i = 1; i <= 3; i++) {
        await new Promise(r => setTimeout(r, 1100));
        if (cancel) return;
        setStep(i);
      }
    })();
    return () => { cancel = true; };
  }, [submitted]);

  if (!loan) return <div className="t-body fg-tertiary">No active loans.</div>;

  return (
    <div className="col gap-32 fade-up">
      <ScreenHeader
        eyebrow="Operation · 04"
        title="Repay."
        sub="Settle a loan. Unlock collateral. The receipt binds to your loan; replays are rejected."
      />

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)", gap: 24 }}>
        <div className="col gap-12">
          {loans.map(l => (
            <button key={l.id} onClick={() => setLoanId(l.id)} className="card-hairline" style={{
              padding: 18, textAlign: "left", cursor: "pointer", background: l.id === loanId ? "color-mix(in srgb, var(--privacy-active-soft) 30%, var(--surface-1))" : "var(--surface-1)",
              borderColor: l.id === loanId ? "var(--privacy-active)" : "color-mix(in srgb, var(--fg-quaternary) 40%, transparent)",
            }}>
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
                <span className="t-num-s fg-tertiary">LOAN · {l.id} · bucket {l.bucket}</span>
                <span className="row gap-6"><Icon name="lock" size={12} color="var(--privacy-active)"/><span className="t-num fg-active">HF {l.hf.toFixed(2)}</span></span>
              </div>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
                <div className="col">
                  <span className="t-caption fg-tertiary">OUTSTANDING</span>
                  <span className="t-num-l fg-primary">{l.outstanding.toFixed(4)} SOL</span>
                </div>
                <div className="col" style={{ alignItems: "flex-end" }}>
                  <span className="t-caption fg-tertiary">{l.apr}% APR · {SL_FMT.ago(l.borrowedAt)}</span>
                  <span className="t-caption fg-tertiary">last accrual · slot {l.lastAccrual.toLocaleString()}</span>
                </div>
              </div>
              {l.id === loanId && (
                <div className="col gap-6" style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid color-mix(in srgb, var(--fg-quaternary) 40%, transparent)" }}>
                  <KV3 label="Principal" value={l.principal.toFixed(4)}/>
                  <KV3 label="Interest" value={l.interest.toFixed(4)}/>
                  <KV3 label="Next 24h" value={`+${(l.outstanding * l.apr / 100 / 365).toFixed(5)}`}/>
                </div>
              )}
            </button>
          ))}
        </div>

        <div className="col gap-16">
          {/* Rail toggle */}
          <div className="card-hairline" style={{ padding: 18 }}>
            <div className="t-micro fg-tertiary" style={{ marginBottom: 10 }}>Settlement rail</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <button className="tile" data-selected={rail === "private"} data-disabled={mode !== "full"} onClick={() => mode === "full" && setRail("private")}>
                <span className="t-micro fg-secondary">Full Privacy</span>
                <span className="t-body fg-primary">MagicBlock Private Payments</span>
                <span className="t-caption fg-tertiary">Hides repayment amount + transfer graph</span>
              </button>
              <button className="tile" data-selected={rail === "public"} onClick={() => setRail("public")}>
                <span className="t-micro fg-secondary">Degraded</span>
                <span className="t-body fg-primary">Public relay</span>
                <span className="t-caption fg-tertiary">Identity hidden · amount visible</span>
              </button>
            </div>
            {mode !== "full" && <div className="t-caption fg-degraded" style={{ marginTop: 10 }}>Private Payments offline — locked to Degraded</div>}
          </div>

          {/* Receipt binding */}
          <div className="card-hairline" style={{ padding: 18 }}>
            <div className="t-micro fg-tertiary" style={{ marginBottom: 10 }}>Receipt binding · single-use</div>
            <div className="col">
              <KV3 label="loanId" value={loan.id}/>
              <KV3 label="nullifier" value="3a8…ee1"/>
              <KV3 label="outstanding" value={loan.outstanding.toFixed(4)}/>
              <KV3 label="vault" value="7gB…kQz"/>
              <KV3 label="epoch_id" value="4178"/>
            </div>
            <div className="t-caption fg-tertiary" style={{ marginTop: 12, lineHeight: 1.55 }}>
              Each receipt is single-use and bound to this loan. Replays are rejected on-chain.
            </div>
          </div>

          {/* Unlock tracker */}
          <div className="card-hairline" style={{ padding: 18 }}>
            <div className="t-micro fg-tertiary" style={{ marginBottom: 12 }}>Collateral unlock sequence</div>
            <StepperRow active={submitted ? step : 0} steps={[
              "Receipt verified by lending_pool",
              "Nullifier → Active",
              "Collateral note re-spendable",
            ]}/>
          </div>

          <button className="btn btn-block btn-lg btn-primary" disabled={submitted} onClick={() => setSubmitted(true)}>
            {submitted ? `Settling… ${step}/3` : `Repay ${loan.outstanding.toFixed(4)} SOL`}
          </button>
          <div className="t-caption fg-tertiary" style={{ textAlign: "center" }}>
            {rail === "private" ? "Settled privately via MagicBlock Private Payments" : "Settled via public relay — amount visible on-chain"}
          </div>
        </div>
      </div>
    </div>
  );
};

const KV3 = ({ label, value }) => (
  <div className="row" style={{ justifyContent: "space-between", padding: "5px 0" }}>
    <span className="t-num-s fg-tertiary">{label}</span>
    <span className="t-num-s fg-primary">{value}</span>
  </div>
);

window.RepayScreen = RepayScreen;
