/* global React, Icon, PrivacyDisclosurePanel, StepperRow, SL_DATA */
const { useState: useDState } = React;

const DepositScreen = ({ mode, vaultBacked, onRequireBackup }) => {
  const [picked, setPicked] = useDState(1.0);
  const [submitted, setSubmitted] = useDState(false);
  const [stepIdx, setStepIdx] = useDState(0);

  React.useEffect(() => {
    if (!submitted) return;
    let cancelled = false;
    const run = async () => {
      for (let i = 1; i <= 3; i++) {
        await new Promise(r => setTimeout(r, 1100));
        if (cancelled) return;
        setStepIdx(i);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [submitted]);

  const bucket = SL_DATA.buckets.find(b => b.v === picked);
  const ctaDisabled = !vaultBacked || mode === "emergency";

  return (
    <div className="col gap-32 fade-up">
      <ScreenHeader
        eyebrow="Operation · 01"
        title="Deposit."
        sub="Add SOL to a shielded pool. The protocol holds your funds; a private note in your vault proves they're yours."
      />

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)", gap: 24 }}>
        {/* LEFT: denominations + relay */}
        <div className="col gap-24">
          <div>
            <div className="row gap-8" style={{ marginBottom: 12, justifyContent: "space-between" }}>
              <span className="t-micro fg-tertiary">Denomination</span>
              <span className="t-caption fg-tertiary">Fixed denominations preserve the anonymity set</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
              {SL_DATA.buckets.map((b) => (
                <button key={b.v}
                  className="tile"
                  data-selected={picked === b.v}
                  data-disabled={b.depth < 4}
                  onClick={() => b.depth >= 4 && setPicked(b.v)}
                >
                  <span className="t-num-l fg-primary">{b.v < 1 ? b.v : b.v}</span>
                  <span className="t-caption fg-tertiary">SOL</span>
                  <div className="bar" style={{ marginTop: 4 }}>
                    <div className="bar-fill" data-warn={b.depth < 12} data-danger={b.depth < 5} style={{ width: `${Math.min(100, (b.depth/64)*100)}%` }}/>
                  </div>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <span className="t-num-s fg-secondary">{b.depth}</span>
                    <span className="t-caption fg-tertiary">{b.flushMin ? `~${b.flushMin}m` : "wait"}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="card-hairline" style={{ padding: 18 }}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
              <span className="t-micro fg-tertiary">Relay endpoint</span>
              <span className="row gap-6"><span className="pill-dot" style={{ background: mode === "emergency" ? "var(--danger)" : mode === "degraded" ? "var(--privacy-degraded)" : "var(--success)" }}/><span className="t-caption fg-secondary">{mode === "emergency" ? "Bypassed" : "Healthy"}</span></span>
            </div>
            <div className="row gap-16" style={{ flexWrap: "wrap" }}>
              <KV label="Provider" value="IKA dWallet"/>
              <KV label="Median latency" value="1.4s"/>
              <KV label="MPC quorum" value="6 / 9"/>
              <KV label="Slot" value="312_410_991"/>
            </div>
          </div>

          {bucket.depth < 12 && (
            <div className="card-hairline" style={{ padding: 14, borderColor: "color-mix(in srgb, var(--privacy-degraded) 40%, transparent)" }}>
              <div className="row gap-12">
                <Icon name="info" size={16} color="var(--privacy-degraded)"/>
                <span className="t-body fg-secondary">
                  This bucket has thin depth ({bucket.depth} active). Consider a smaller denomination
                  or wait for the next flush in <span className="fg-primary">~{bucket.flushMin}m</span> for a stronger anonymity set.
                </span>
              </div>
            </div>
          )}

          {!vaultBacked && (
            <div className="card-hairline" style={{ padding: 14, borderColor: "color-mix(in srgb, var(--danger) 40%, transparent)" }}>
              <div className="row gap-12">
                <Icon name="warning" size={16} color="var(--danger)"/>
                <div className="col">
                  <span className="t-body fg-primary">Set up your note vault first.</span>
                  <span className="t-caption fg-tertiary">Without it, deposits are unrecoverable.</span>
                </div>
                <div style={{ flex: 1 }}/>
                <button className="btn btn-sm btn-primary" onClick={onRequireBackup}>Set up vault</button>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: privacy + transaction preview */}
        <div className="col gap-16">
          <PrivacyDisclosurePanel
            mode={mode}
            hidden={[
              "Wallet → pool funding link",
              "Spend timing across batch",
              "Note contents (secret, nullifier)",
            ]}
            observable={[
              "New commitment in pool",
              `Bucket = ${picked} SOL`,
              "Slot of batch flush",
            ]}
            responsibility={[
              "Back up note vault",
              "Use trusted network",
            ]}
            context="Updates as you change inputs"
          />

          <div className="card-hairline" style={{ padding: 18 }}>
            <div className="t-micro fg-tertiary" style={{ marginBottom: 14 }}>Transaction preview</div>
            <StepperRow
              active={submitted ? stepIdx : 0}
              steps={[
                "Build commitment locally",
                "Fund relay via IKA dWallet",
                "Batch into PER epoch (TDX enclave)",
                "Pool Merkle root updates",
              ]}
            />
            <div className="divider" style={{ margin: "16px 0" }}/>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="t-caption fg-tertiary">Network fee · est.</span>
              <span className="t-num fg-secondary">0.00012 SOL</span>
            </div>
            <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
              <span className="t-caption fg-tertiary">Earliest flush</span>
              <span className="t-num fg-secondary">~{bucket.flushMin || 30}m</span>
            </div>
            <button
              className={`btn btn-block btn-lg ${submitted ? "" : "btn-primary"} ${!vaultBacked ? "btn-warning-stripe" : ""}`}
              style={{ marginTop: 18 }}
              disabled={ctaDisabled || submitted}
              onClick={() => setSubmitted(true)}
            >
              {submitted ? `Submitting… step ${stepIdx + 1}/4` : `Deposit ${picked} SOL`}
            </button>
            {!vaultBacked && <div className="t-caption fg-tertiary" style={{ marginTop: 8, textAlign: "center" }}>Set up note vault to continue</div>}
            {mode === "emergency" && <div className="t-caption fg-danger" style={{ marginTop: 8, textAlign: "center" }}>New deposits paused in Emergency mode</div>}
          </div>
        </div>
      </div>
    </div>
  );
};

const KV = ({ label, value }) => (
  <div className="col" style={{ minWidth: 100 }}>
    <span className="t-caption fg-tertiary">{label.toUpperCase()}</span>
    <span className="t-num fg-primary" style={{ marginTop: 2 }}>{value}</span>
  </div>
);

window.DepositScreen = DepositScreen;
