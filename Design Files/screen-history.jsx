/* global React, Icon, SL_DATA, SL_FMT */
const { useState: useHState, useMemo: useHMemo } = React;

const HistoryScreen = ({ mode }) => {
  const [filters, setFilters] = useHState({ deposit: true, withdraw: true, borrow: true, repay: true, system: false });
  const [selected, setSelected] = useHState(new Set());
  const [packetOpen, setPacketOpen] = useHState(false);
  const [purpose, setPurpose] = useHState("audit");
  const [redact, setRedact] = useHState({ amounts: false, timestamps: false, counterparty: true });

  const events = useHMemo(() => SL_DATA.history.filter(e => filters[e.kind] !== false), [filters]);

  const toggle = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  return (
    <div className="col gap-32 fade-up">
      <ScreenHeader
        eyebrow="Operation · 05"
        title="History."
        sub="A private, local ledger of your activity. Build a disclosure packet only when you choose to."
        right={
          <div className="row gap-12">
            <button className="btn btn-ghost" disabled={selected.size === 0} onClick={() => setPacketOpen(true)}>
              <Icon name="export" size={14}/> Build packet ({selected.size})
            </button>
          </div>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "220px minmax(0, 1fr) minmax(0, 360px)", gap: 24 }}>
        {/* Filters */}
        <div className="col gap-16">
          <div className="card-hairline" style={{ padding: 14 }}>
            <div className="t-micro fg-tertiary" style={{ marginBottom: 10 }}>Filter by kind</div>
            <div className="col gap-4">
              {[
                ["deposit","Deposits"],["withdraw","Withdrawals"],["borrow","Borrows"],
                ["repay","Repayments"],["system","System events"]
              ].map(([k, label]) => (
                <label key={k} className="check">
                  <input type="checkbox" checked={!!filters[k]} onChange={e => setFilters({ ...filters, [k]: e.target.checked })}/>
                  <span className="check-box"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m4 12 5 5L20 6"/></svg></span>
                  <span className="t-body fg-secondary">{label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="card-hairline" style={{ padding: 14 }}>
            <div className="t-micro fg-tertiary" style={{ marginBottom: 8 }}>Local only</div>
            <p className="t-caption fg-secondary" style={{ margin: 0, lineHeight: 1.55 }}>
              History is reconstructed from your encrypted note vault. Nothing is uploaded. Closing this tab does not transmit anything.
            </p>
          </div>
        </div>

        {/* Feed */}
        <div className="card-hairline" style={{ padding: 0 }}>
          <div className="row" style={{ justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid color-mix(in srgb, var(--fg-quaternary) 40%, transparent)" }}>
            <span className="t-micro fg-tertiary">{events.length} events</span>
            <span className="t-caption fg-tertiary">Select rows to disclose</span>
          </div>
          <div className="col">
            {events.map(e => (
              <button key={e.id} onClick={() => toggle(e.id)} className="row" style={{
                padding: "13px 18px", gap: 14, borderBottom: "1px solid color-mix(in srgb, var(--fg-quaternary) 25%, transparent)",
                background: selected.has(e.id) ? "color-mix(in srgb, var(--privacy-active-soft) 30%, var(--surface-1))" : "transparent",
                textAlign: "left", border: "none", borderLeft: selected.has(e.id) ? "2px solid var(--privacy-active)" : "2px solid transparent",
                cursor: "pointer", width: "100%",
              }}>
                <span style={{ width: 14, height: 14, borderRadius: 2, border: `1.5px solid ${selected.has(e.id) ? "var(--privacy-active)" : "var(--fg-quaternary)"}`, background: selected.has(e.id) ? "var(--privacy-active)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {selected.has(e.id) && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="hsl(195 30% 8%)" strokeWidth="4"><path d="m4 12 5 5L20 6"/></svg>}
                </span>
                <span className="t-num-s fg-tertiary" style={{ minWidth: 78 }}>{SL_FMT.ago(e.t)}</span>
                <KindChip kind={e.kind}/>
                <span className="t-body fg-primary" style={{ flex: 1 }}>{e.title}</span>
                <span className="t-num-s fg-tertiary">{e.detail}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Packet builder */}
        <div className={`card-hairline col gap-12`} style={{ padding: 18, alignSelf: "flex-start" }}>
          <div className="row gap-8" style={{ marginBottom: 4 }}>
            <Icon name="export" size={14} color="var(--privacy-active)"/>
            <span className="t-micro fg-tertiary">Disclosure packet</span>
          </div>
          {selected.size === 0 ? (
            <p className="t-body fg-secondary" style={{ margin: 0, lineHeight: 1.55 }}>
              Select events on the left to build a packet. You'll choose recipient, purpose, and what to redact before generating a verifiable receipt.
            </p>
          ) : (
            <>
              <div className="t-num-s fg-tertiary">{selected.size} event{selected.size===1?"":"s"} selected</div>
              <label className="col gap-6" style={{ marginTop: 6 }}>
                <span className="t-caption fg-tertiary">PURPOSE</span>
                <select className="select" value={purpose} onChange={e => setPurpose(e.target.value)}>
                  <option value="audit">Audit trail</option>
                  <option value="solvency">Solvency proof</option>
                  <option value="tax">Tax report</option>
                  <option value="kyc">KYC re-attestation</option>
                </select>
              </label>
              <div className="col gap-6" style={{ marginTop: 6 }}>
                <span className="t-caption fg-tertiary">REDACT</span>
                {[
                  ["amounts","Exact amounts (keep buckets)"],
                  ["timestamps","Exact timestamps (keep epoch)"],
                  ["counterparty","Counterparty addresses"],
                ].map(([k, label]) => (
                  <label key={k} className="check">
                    <input type="checkbox" checked={!!redact[k]} onChange={e => setRedact({ ...redact, [k]: e.target.checked })}/>
                    <span className="check-box"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m4 12 5 5L20 6"/></svg></span>
                    <span className="t-body fg-secondary">{label}</span>
                  </label>
                ))}
              </div>
              <button className="btn btn-block btn-primary" style={{ marginTop: 8 }}>
                Generate signed packet
              </button>
              <div className="t-caption fg-tertiary" style={{ textAlign: "center" }}>
                Includes Merkle inclusion proofs · valid for 30 days · revocable
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const KindChip = ({ kind }) => {
  const COL = {
    deposit: ["var(--privacy-active)", "DEP"],
    withdraw: ["var(--privacy-active)", "OUT"],
    borrow: ["var(--privacy-degraded)", "BRW"],
    repay: ["var(--success)", "RPY"],
    system: ["var(--fg-tertiary)", "SYS"],
  };
  const [color, label] = COL[kind] || COL.system;
  return (
    <span className="row gap-6" style={{ padding: "2px 8px", borderRadius: 999, border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`, background: `color-mix(in srgb, ${color} 12%, transparent)`, minWidth: 56, justifyContent: "center" }}>
      <span className="t-num-s" style={{ color, fontWeight: 600, fontSize: 10, letterSpacing: "1px" }}>{label}</span>
    </span>
  );
};

window.HistoryScreen = HistoryScreen;
