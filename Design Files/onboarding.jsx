/* global React, Icon */
const { useState: useOState } = React;

const OnboardingFlow = ({ onComplete }) => {
  const [step, setStep] = useOState(0);
  const [vaultPath, setVaultPath] = useOState("");
  const [acked, setAcked] = useOState(false);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "var(--surface-0)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 80,
      padding: 40, animation: "fadeIn 240ms ease-out",
    }}>
      <div style={{ maxWidth: 560, width: "100%", background: "var(--surface-1)", border: "1px solid color-mix(in srgb, var(--fg-quaternary) 50%, transparent)", borderRadius: 4, overflow: "hidden", boxShadow: "0 40px 120px color-mix(in srgb, hsl(195 30% 4%) 70%, transparent)" }}>
        {/* Step rail */}
        <div className="row" style={{ padding: "16px 24px", borderBottom: "1px solid color-mix(in srgb, var(--fg-quaternary) 40%, transparent)", justifyContent: "space-between" }}>
          <div className="row gap-12">
            {[0,1,2].map(i => (
              <div key={i} className="row gap-6">
                <span style={{ width: 8, height: 8, borderRadius: 999, background: i <= step ? "var(--privacy-active)" : "var(--fg-quaternary)" }}/>
                <span className="t-num-s" style={{ color: i === step ? "var(--fg-primary)" : "var(--fg-tertiary)" }}>0{i+1}</span>
              </div>
            ))}
          </div>
          <span className="t-caption fg-tertiary">shieldedSOL · setup · v0.4</span>
        </div>

        <div style={{ padding: 36 }}>
          {step === 0 && (
            <div className="col gap-16">
              <span className="t-micro fg-tertiary">Welcome</span>
              <h1 className="t-display-m fg-primary" style={{ margin: 0 }}>shieldedSOL is private by default.</h1>
              <p className="t-body-l fg-secondary" style={{ margin: 0, lineHeight: 1.6 }}>
                Deposits, withdrawals, borrows, and repayments do not link to your wallet. The protocol holds your funds; encrypted notes prove they're yours.
              </p>
              <ul className="col gap-10" style={{ listStyle: "none", padding: 0, margin: "8px 0 0" }}>
                {[
                  ["lock","No operator can liquidate you without your pre-signed consent."],
                  ["eye-off","Loan health is computed on encrypted data. Only you can read it."],
                  ["info","If a rail goes down, we name what's down — never silent fallback."],
                ].map(([icon, text]) => (
                  <li key={icon} className="row gap-12" style={{ alignItems: "flex-start" }}>
                    <span style={{ width: 24, height: 24, borderRadius: 4, background: "color-mix(in srgb, var(--privacy-active) 14%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", marginTop: 2, flexShrink: 0 }}>
                      <Icon name={icon} size={14} color="var(--privacy-active)"/>
                    </span>
                    <span className="t-body fg-secondary">{text}</span>
                  </li>
                ))}
              </ul>
              <div className="row gap-12" style={{ marginTop: 12 }}>
                <button className="btn btn-primary" onClick={() => setStep(1)}>Continue <Icon name="chevron-right" size={12}/></button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="col gap-16">
              <span className="t-micro fg-tertiary">Step 02 · Note vault</span>
              <h1 className="t-display-m fg-primary" style={{ margin: 0 }}>Set up your encrypted note vault.</h1>
              <p className="t-body-l fg-secondary" style={{ margin: 0, lineHeight: 1.6 }}>
                Notes are the only proof that you own deposits. We store them locally, encrypted with a key derived from your wallet signature. Lose this and you cannot recover funds.
              </p>
              <div className="card-hairline" style={{ padding: 16, background: "color-mix(in srgb, var(--surface-2) 60%, var(--surface-1))" }}>
                <div className="t-micro fg-tertiary" style={{ marginBottom: 10 }}>Backup destinations · pick at least one</div>
                <div className="col gap-8">
                  {[
                    ["device","This device (default)","encrypted local storage"],
                    ["cloud","iCloud / Google Drive (encrypted)","auto-sync · key never uploads"],
                    ["paper","Paper backup (printable mnemonic)","cold storage · slow but durable"],
                  ].map(([k, label, sub]) => (
                    <label key={k} className="row gap-12" style={{ padding: "10px 12px", border: "1px solid color-mix(in srgb, var(--fg-quaternary) 40%, transparent)", borderRadius: 4, cursor: "pointer", background: vaultPath === k ? "color-mix(in srgb, var(--privacy-active-soft) 35%, var(--surface-1))" : "transparent" }}>
                      <input type="radio" name="vault" checked={vaultPath === k} onChange={() => setVaultPath(k)} style={{ accentColor: "var(--privacy-active)" }}/>
                      <div className="col" style={{ flex: 1 }}>
                        <span className="t-body fg-primary">{label}</span>
                        <span className="t-caption fg-tertiary">{sub}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div className="row gap-12" style={{ marginTop: 8 }}>
                <button className="btn btn-ghost" onClick={() => setStep(0)}>Back</button>
                <button className="btn btn-primary" disabled={!vaultPath} onClick={() => setStep(2)}>Continue <Icon name="chevron-right" size={12}/></button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="col gap-16">
              <span className="t-micro fg-tertiary">Step 03 · Acknowledgement</span>
              <h1 className="t-display-m fg-primary" style={{ margin: 0 }}>Read this once. We won't ask again.</h1>
              <p className="t-body-l fg-secondary" style={{ margin: 0, lineHeight: 1.6 }}>
                Privacy here is not a setting. It is a property enforced by cryptography. That has consequences.
              </p>
              <div className="card-hairline" style={{ padding: 18, lineHeight: 1.65 }}>
                <ul className="col gap-10" style={{ listStyle: "disc", paddingLeft: 20, margin: 0 }}>
                  <li className="t-body fg-secondary"><strong className="fg-primary">No support can recover lost notes.</strong> Back up your vault.</li>
                  <li className="t-body fg-secondary"><strong className="fg-primary">Sweep stealth addresses carefully.</strong> Forwarding withdrawn SOL to a KYC'd wallet undoes the privacy of that withdrawal.</li>
                  <li className="t-body fg-secondary"><strong className="fg-primary">Borrowing requires FutureSign consent.</strong> You pre-sign one specific liquidation condition before each borrow.</li>
                  <li className="t-body fg-secondary"><strong className="fg-primary">Rails can degrade.</strong> When that happens we tell you what's down and what still works.</li>
                </ul>
              </div>
              <label className="check" style={{ marginTop: 6 }}>
                <input type="checkbox" checked={acked} onChange={e => setAcked(e.target.checked)}/>
                <span className="check-box"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m4 12 5 5L20 6"/></svg></span>
                <span className="t-body fg-primary">I understand. Take me to my positions.</span>
              </label>
              <div className="row gap-12" style={{ marginTop: 4 }}>
                <button className="btn btn-ghost" onClick={() => setStep(1)}>Back</button>
                <button className="btn btn-primary" disabled={!acked} onClick={() => onComplete({ vaultPath })}>Enter shieldedSOL</button>
              </div>
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
    </div>
  );
};

window.OnboardingFlow = OnboardingFlow;
