/* global React, Icon, SL_DATA */
const { useState: useSState } = React;

const StatusSlideover = ({ open, onClose, mode }) => {
  if (!open) return null;
  const rails = SL_DATA.rails(mode);
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "color-mix(in srgb, hsl(195 30% 4%) 60%, transparent)", backdropFilter: "blur(4px)", zIndex: 90 }}/>
      <aside style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 480, background: "var(--surface-1)",
        borderLeft: "1px solid color-mix(in srgb, var(--fg-quaternary) 50%, transparent)",
        boxShadow: "-24px 0 60px color-mix(in srgb, hsl(195 30% 4%) 40%, transparent)",
        zIndex: 91, padding: 28, overflow: "auto", animation: "slideIn 220ms cubic-bezier(0.2, 0.8, 0.2, 1)",
      }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 22 }}>
          <div className="col gap-4">
            <span className="t-micro fg-tertiary">Protocol Status</span>
            <span className="t-heading-l fg-primary">All rails</span>
          </div>
          <button onClick={onClose} className="btn btn-sm btn-ghost"><Icon name="x" size={14}/></button>
        </div>
        <div className="t-body fg-secondary" style={{ marginBottom: 18, lineHeight: 1.6 }}>
          shieldedSOL composes six external systems. Each can degrade independently. We name what's down and what still works — never silently.
        </div>
        <div className="col gap-10">
          {rails.map(r => <RailCard key={r.name} {...r}/>)}
        </div>
        <div className="card-hairline" style={{ padding: 14, marginTop: 18 }}>
          <div className="t-micro fg-tertiary" style={{ marginBottom: 8 }}>Mode summary</div>
          <div className="t-body fg-secondary" style={{ lineHeight: 1.55 }}>
            {mode === "full" && "All rails operational. Borrow, deposit, and private repay are unlocked."}
            {mode === "degraded" && "Private repayments are routed via the public relay. Identity is still hidden; amounts are visible."}
            {mode === "emergency" && "Governance pause. New deposits and borrows are halted. Withdrawals continue via the rescue contract; FutureSign consent stands."}
          </div>
        </div>
      </aside>
      <style>{`@keyframes slideIn { from { transform: translateX(24px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>
    </>
  );
};

const RailCard = ({ name, role, status, latency, version }) => {
  const COL = { up: "var(--success)", degraded: "var(--privacy-degraded)", down: "var(--danger)" };
  return (
    <div className="card-hairline" style={{ padding: 14 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
        <span className="t-num fg-primary">{name}</span>
        <span className="row gap-6">
          <span className="pill-dot" style={{ background: COL[status] }}/>
          <span className="t-caption" style={{ color: COL[status], textTransform: "uppercase", letterSpacing: 1 }}>{status}</span>
        </span>
      </div>
      <div className="t-caption fg-tertiary" style={{ marginBottom: 8 }}>{role}</div>
      <div className="row gap-16">
        <span className="t-num-s fg-secondary">latency · {latency}</span>
        <span className="t-num-s fg-tertiary">{version}</span>
      </div>
    </div>
  );
};

window.StatusSlideover = StatusSlideover;
