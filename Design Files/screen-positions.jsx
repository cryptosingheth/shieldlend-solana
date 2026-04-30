/* global React, Icon, PrivacyDisclosurePanel, NoteStatusBadge, RingMeter, StepperRow, SL_DATA, SL_FMT */
const { useState, useEffect, useMemo } = React;

/* ============================================================
   ScreenHeader — shared
   ============================================================ */
const ScreenHeader = ({ eyebrow, title, sub, right }) => (
  <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end", marginBottom: 32, gap: 24 }}>
    <div className="col gap-8">
      {eyebrow && <span className="t-micro fg-tertiary">{eyebrow}</span>}
      <h1 className="t-display-l fg-primary" style={{ margin: 0 }}>{title}</h1>
      {sub && <p className="t-body-l fg-secondary" style={{ margin: 0, maxWidth: 640 }}>{sub}</p>}
    </div>
    {right}
  </div>
);
window.ScreenHeader = ScreenHeader;

/* ============================================================
   Positions (dashboard)
   ============================================================ */
const PositionsScreen = ({ mode, onNav }) => {
  const totalDeposited = SL_DATA.notes.filter(n=>n.status!=="Spent").reduce((a,n)=>a+n.denom,0);
  const totalBorrowed = SL_DATA.loans.filter(l=>l.status==="Active").reduce((a,l)=>a+l.outstanding,0);
  const lockedNotes = SL_DATA.notes.filter(n=>n.status==="Locked").length;
  const activeNotes = SL_DATA.notes.filter(n=>n.status==="Active").length;

  return (
    <div className="col gap-32 fade-up">
      <ScreenHeader
        eyebrow="Operations console"
        title="Positions."
        sub="Your shielded balance, active loans, and a single hand on the steering wheel for everything else."
        right={
          <div className="row gap-12">
            <button className="btn btn-ghost" onClick={() => onNav("history")}><Icon name="history" size={14}/> History</button>
            <button className="btn btn-primary" onClick={() => onNav("deposit")}><Icon name="plus" size={14}/> New deposit</button>
          </div>
        }
      />

      {/* Summary row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16 }}>
        <SummaryCard label="Shielded balance"  value={`${totalDeposited.toFixed(2)}`} unit="SOL" sub={`${activeNotes} active · ${lockedNotes} locked`} highlight/>
        <SummaryCard label="Outstanding debt"  value={`${totalBorrowed.toFixed(4)}`} unit="SOL" sub={`${SL_DATA.loans.filter(l=>l.status==="Active").length} loans · poly-linear 11pt`}/>
        <SummaryCard label="Aggregate health"  value="2.41" unit="HF" sub="Encrypted · only you" lock/>
        <SummaryCard label="Anonymity set"     value="318" unit="depositors" sub="ring K=16 · depth 24"/>
      </div>

      {/* Two-up: notes + loans */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)", gap: 24 }}>
        <div className="card-hairline" style={{ padding: 0 }}>
          <div className="row" style={{ justifyContent: "space-between", padding: "18px 20px", borderBottom: "1px solid color-mix(in srgb, var(--fg-quaternary) 40%, transparent)" }}>
            <div className="col">
              <span className="t-micro fg-tertiary">Notes</span>
              <span className="t-heading-m fg-primary" style={{ marginTop: 2 }}>Your shielded notes</span>
            </div>
            <div className="row gap-8">
              <button className="btn btn-sm btn-ghost" onClick={() => onNav("withdraw")}><Icon name="withdraw" size={12}/> Withdraw</button>
              <button className="btn btn-sm btn-ghost" onClick={() => onNav("borrow")}><Icon name="borrow" size={12}/> Borrow</button>
            </div>
          </div>
          <div className="col">
            {SL_DATA.notes.map((n) => (
              <div key={n.id} className="row" style={{ padding: "14px 20px", borderBottom: "1px solid color-mix(in srgb, var(--fg-quaternary) 30%, transparent)", gap: 16 }}>
                <NoteStatusBadge status={n.status}/>
                <div className="col" style={{ minWidth: 96 }}>
                  <span className="t-num fg-primary">{n.denom} SOL</span>
                  <span className="t-num-s fg-tertiary">{n.commitmentShort}</span>
                </div>
                <div className="col" style={{ minWidth: 90 }}>
                  <span className="t-caption fg-tertiary">DEPOSITED</span>
                  <span className="t-body fg-secondary">{SL_FMT.ago(n.createdAt)}</span>
                </div>
                <div className="col" style={{ minWidth: 140 }}>
                  <span className="t-caption fg-tertiary">RING</span>
                  <div className="row gap-8" style={{ marginTop: 2 }}>
                    <RingMeter ready={n.ringReady}/>
                    <span className="t-num-s fg-secondary">{n.ringReady}/16</span>
                  </div>
                </div>
                <div style={{ flex: 1 }}/>
                {n.status === "Locked" && (
                  <span className="t-caption fg-degraded">Loan {n.loanId}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="card-hairline" style={{ padding: 0 }}>
          <div className="row" style={{ justifyContent: "space-between", padding: "18px 20px", borderBottom: "1px solid color-mix(in srgb, var(--fg-quaternary) 40%, transparent)" }}>
            <div className="col">
              <span className="t-micro fg-tertiary">Loans</span>
              <span className="t-heading-m fg-primary" style={{ marginTop: 2 }}>Active loans</span>
            </div>
            <button className="btn btn-sm btn-ghost" onClick={() => onNav("repay")}><Icon name="repay" size={12}/> Repay</button>
          </div>
          <div className="col">
            {SL_DATA.loans.map((l) => (
              <div key={l.id} className="col" style={{ padding: "16px 20px", borderBottom: "1px solid color-mix(in srgb, var(--fg-quaternary) 30%, transparent)", gap: 10 }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <div className="col">
                    <span className="t-num-s fg-tertiary">LOAN {l.id}</span>
                    <span className="t-num fg-primary" style={{ marginTop: 2 }}>{SL_FMT.sol(l.outstanding)}</span>
                  </div>
                  <div className="col" style={{ alignItems: "flex-end" }}>
                    <span className="t-caption fg-tertiary">HF · ENCRYPTED</span>
                    <span className="t-num fg-active" style={{ marginTop: 2 }}>{l.hf.toFixed(2)}</span>
                  </div>
                </div>
                <div className="bar"><div className="bar-fill" style={{ width: `${Math.min(100, (l.outstanding / (l.bucket * 3)) * 100)}%` }}/></div>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className="t-caption fg-tertiary">{l.apr.toFixed(1)}% APR · borrowed {SL_FMT.ago(l.borrowedAt)}</span>
                  <span className="t-caption fg-tertiary">bucket {l.bucket} SOL</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Privacy claim summary panel */}
      <PrivacyDisclosurePanel
        mode={mode}
        hidden={[
          "Which deposit funded which note",
          "Which note backs which loan",
          "Borrower wallet identity",
          "Disbursement destinations",
          mode !== "full" ? "Most identity links remain hidden" : "Repayment transfer graph",
        ]}
        observable={[
          "Number of active loans (2)",
          "Bucketed loan amounts",
          "Aggregate solvency (threshold-decrypted)",
          mode === "degraded" ? "Repayment amount on-chain" : "Approximate batch timing",
          mode === "emergency" ? "User wallet appears as signer" : "Pool Merkle root updates",
        ]}
        responsibility={[
          "Back up the encrypted note vault",
          "Use a trusted network (Tor/VPN)",
          "Sweep stealth addresses carefully",
        ]}
        context={`Live · ${mode === "full" ? "all rails operational" : mode === "degraded" ? "1 rail offline" : "governance-vote rescue"}`}
      />
    </div>
  );
};

const SummaryCard = ({ label, value, unit, sub, highlight, lock }) => (
  <div className="card" style={{ position: "relative", overflow: "hidden", ...(highlight ? { borderColor: "color-mix(in srgb, var(--privacy-active) 40%, transparent)" } : {}) }}>
    <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
      <span className="t-micro fg-tertiary">{label}</span>
      {lock && <Icon name="lock" size={12} color="var(--privacy-active)"/>}
    </div>
    <div className="row gap-8" style={{ alignItems: "baseline" }}>
      <span className="t-num-l fg-primary">{value}</span>
      <span className="t-caption fg-tertiary">{unit}</span>
    </div>
    {sub && <div className="t-caption fg-tertiary" style={{ marginTop: 8 }}>{sub}</div>}
    {highlight && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 2, background: "var(--privacy-active)" }}/>}
  </div>
);
window.PositionsScreen = PositionsScreen;
