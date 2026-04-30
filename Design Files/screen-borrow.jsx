/* global React, Icon, PrivacyDisclosurePanel, NoteStatusBadge, RingMeter, SL_DATA, SL_FMT */
const { useState: useBState } = React;

const BorrowScreen = ({ mode }) => {
  const eligible = SL_DATA.notes.filter(n => n.status === "Active" && n.denom >= 1);
  const [collId, setCollId] = useBState(eligible[0]?.id);
  const coll = SL_DATA.notes.find(n => n.id === collId) || eligible[0];
  const buckets = [0.1, 0.5, 1.0, 2.0, 5.0];
  const [bucket, setBucket] = useBState(0.5);
  const [consent, setConsent] = useBState(false);
  const [consentExpanded, setExpanded] = useBState(false);

  const ltv = coll ? (bucket / coll.denom) * 100 : 0;
  const minRatioBps = 15000; // 150%
  const maxBorrow = coll ? coll.denom / 1.5 : 0;
  const ltvOk = ltv <= 66.7;
  const hf = ltvOk ? (1 / (ltv/100)) * 1.5 : 0;

  const ikaDown = mode === "emergency";
  const ctaDisabled = !consent || !ltvOk || ikaDown;

  return (
    <div className="col gap-32 fade-up">
      <ScreenHeader
        eyebrow="Operation · 03"
        title="Borrow."
        sub="Lock a shielded note as collateral. Borrow against it without revealing which note, which wallet, or where the loan goes."
      />

      {/* Row 1: Collateral selector */}
      <div className="card-hairline" style={{ padding: 0 }}>
        <div className="row" style={{ justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid color-mix(in srgb, var(--fg-quaternary) 40%, transparent)" }}>
          <span className="t-micro fg-tertiary">Collateral note</span>
          <span className="t-caption fg-tertiary">Min ratio 150% · selection stays local</span>
        </div>
        <div className="row" style={{ overflowX: "auto", padding: 14, gap: 10 }}>
          {eligible.map(n => (
            <button key={n.id} onClick={() => setCollId(n.id)} className="tile" data-selected={collId===n.id} style={{ minWidth: 200 }}>
              <NoteStatusBadge status={n.status}/>
              <div className="row gap-8" style={{ alignItems: "baseline" }}>
                <span className="t-num-l fg-primary">{n.denom}</span>
                <span className="t-caption fg-tertiary">SOL</span>
              </div>
              <span className="t-num-s fg-tertiary">{n.commitmentShort}</span>
              <RingMeter ready={n.ringReady}/>
            </button>
          ))}
        </div>
      </div>

      {/* Row 2: amount + HF */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr)", gap: 24 }}>
        <div className="col gap-20">
          <div>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
              <span className="t-micro fg-tertiary">Borrow bucket</span>
              <span className="t-caption fg-tertiary">Always-bucketed · keeps amount metadata low-fingerprint</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
              {buckets.map(b => {
                const tooMuch = b > maxBorrow;
                return (
                  <button key={b} className="tile" data-selected={bucket===b} data-disabled={tooMuch} onClick={() => !tooMuch && setBucket(b)}>
                    <span className="t-num-l fg-primary">{b}</span>
                    <span className="t-caption fg-tertiary">SOL @ 6.2%</span>
                    {tooMuch && <span className="t-caption fg-degraded">over LTV</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="card-hairline" style={{ padding: 18 }}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
              <span className="t-micro fg-tertiary">LTV · public ZK input</span>
              <span className="t-num fg-primary">{ltv.toFixed(1)}%</span>
            </div>
            <div className="bar" style={{ height: 8 }}>
              <div className="bar-fill" data-warn={ltv > 50} data-danger={!ltvOk} style={{ width: `${Math.min(100, ltv * 1.5)}%` }}/>
            </div>
            <div className="row" style={{ justifyContent: "space-between", marginTop: 10 }}>
              <span className="t-caption fg-tertiary">66.7% liquidation threshold</span>
              <span className="t-caption fg-tertiary">{ltv > 55 ? "tight — consider one bucket smaller" : "safe headroom for SOL volatility"}</span>
            </div>
          </div>
        </div>

        <div className="col gap-16">
          {/* Encrypted HF gauge */}
          <div className="card-hairline" style={{ padding: 22, position: "relative" }}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 18 }}>
              <span className="t-micro fg-tertiary">Health factor</span>
              <Icon name="lock" size={14} color="var(--privacy-active)"/>
            </div>
            <div style={{ position: "relative", display: "flex", justifyContent: "center", marginBottom: 12 }}>
              <svg width="200" height="120" viewBox="0 0 200 120">
                <defs>
                  <linearGradient id="hfGrad" x1="0" x2="1">
                    <stop offset="0" stopColor="var(--danger)"/>
                    <stop offset="0.4" stopColor="var(--privacy-degraded)"/>
                    <stop offset="0.7" stopColor="var(--privacy-active)"/>
                  </linearGradient>
                </defs>
                <path d="M 16 100 A 84 84 0 0 1 184 100" fill="none" stroke="var(--surface-2)" strokeWidth="10" strokeLinecap="round"/>
                <path d="M 16 100 A 84 84 0 0 1 184 100" fill="none" stroke="url(#hfGrad)" strokeWidth="10" strokeLinecap="round"
                  strokeDasharray={`${Math.min(264, hf * 70)} 1000`}/>
                <text x="100" y="86" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="36" fontWeight="500" fill="var(--fg-primary)" style={{ fontVariantNumeric: "tabular-nums" }}>{hf.toFixed(2)}</text>
                <text x="100" y="106" textAnchor="middle" fontFamily="var(--font-display)" fontSize="10" letterSpacing="2" fill="var(--fg-tertiary)">HF · ENCRYPTED</text>
              </svg>
            </div>
            <div className="t-caption fg-secondary" style={{ textAlign: "center" }}>
              Computed homomorphically on Encrypt FHE. Only you can decrypt the exact figure on-chain.
            </div>
          </div>

          <PrivacyDisclosurePanel
            mode={mode}
            hidden={[
              "Which note is collateral",
              "Borrower wallet",
              "Disbursement destination",
              "Exact collateral value",
            ]}
            observable={[
              "Loan exists (LoanAccount PDA)",
              `Bucket = ${bucket} SOL`,
              "LTV req = 150%",
              "Slot of disbursement",
            ]}
            responsibility={[
              "Sweep disbursement carefully",
              "Watch HF on next tab",
              "Top-up before breach",
            ]}
            context="Borrow contract"
          />
        </div>
      </div>

      {/* Row 3: outcome + FutureSign */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)", gap: 24 }}>
        <div className="card-hairline" style={{ padding: 22 }}>
          <span className="t-micro fg-tertiary">Outcome</span>
          <div className="t-display-m fg-primary" style={{ marginTop: 8 }}>Disburse {bucket} SOL</div>
          <div className="t-body fg-secondary" style={{ marginTop: 4 }}>→ Stealth-{Math.floor(Math.random()*9)+1} · single-use Umbra address</div>
          <div className="divider" style={{ margin: "18px 0" }}/>
          <div className="row gap-24">
            <KV2 label="Projected APR" value={`${6.2.toFixed(1)}%`}/>
            <KV2 label="Interest 24h" value={`+${(bucket * 0.062 / 365).toFixed(5)} SOL`}/>
            <KV2 label="Collateral locked" value={`${coll?.denom} SOL`}/>
            <KV2 label="Liquidation @" value={`${(coll?.denom * 0.667).toFixed(2)} SOL value`}/>
          </div>
        </div>

        <div className="card-hairline" style={{ padding: 22 }}>
          <div className="row gap-8" style={{ marginBottom: 10 }}>
            <Icon name="key" size={14} color="var(--privacy-active)"/>
            <span className="t-micro fg-tertiary">FutureSign · pre-authorize liquidation</span>
          </div>
          {!consentExpanded ? (
            <>
              <p className="t-body fg-secondary" style={{ margin: "8px 0 14px" }}>
                IKA FutureSign requires you to pre-sign one specific liquidation condition before borrowing. No operator can liquidate you without this and the encrypted health factor.
              </p>
              <button className="btn btn-ghost btn-sm" onClick={() => setExpanded(true)}>Read consent text <Icon name="chevron-right" size={12}/></button>
            </>
          ) : (
            <>
              <p className="t-body fg-secondary" style={{ margin: "8px 0 12px", lineHeight: 1.6 }}>
                <strong className="fg-primary">You are pre-signing one condition.</strong> If your loan's encrypted health factor breaches the liquidation threshold across two consecutive epochs and an authorized keeper requests reveal, IKA may execute the consented liquidation on your behalf. You are not signing now to liquidate; you are signing now so a liquidation is possible later, enforced by threshold cryptography rather than an operator. You can revoke this pre-authorization any time before a breach event by repaying or topping up collateral.
              </p>
              <label className="check">
                <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/>
                <span className="check-box"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m4 12 5 5L20 6"/></svg></span>
                <span className="t-body fg-primary">I have read and consent to this single condition.</span>
              </label>
            </>
          )}

          <button
            className="btn btn-block btn-lg btn-primary"
            style={{ marginTop: 18 }}
            disabled={ctaDisabled}
          >
            Borrow {bucket} SOL
          </button>
          {ikaDown && <div className="t-caption fg-danger" style={{ marginTop: 8, textAlign: "center" }}>IKA dWallet unavailable — borrowing disabled (safety)</div>}
          {!ikaDown && !consent && <div className="t-caption fg-tertiary" style={{ marginTop: 8, textAlign: "center" }}>Consent required · oracle fresh · LTV {ltvOk ? "OK" : "over"}</div>}
        </div>
      </div>
    </div>
  );
};

const KV2 = ({ label, value }) => (
  <div className="col">
    <span className="t-caption fg-tertiary">{label.toUpperCase()}</span>
    <span className="t-num fg-primary" style={{ marginTop: 4 }}>{value}</span>
  </div>
);

window.BorrowScreen = BorrowScreen;
