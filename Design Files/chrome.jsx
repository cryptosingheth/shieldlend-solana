/* global React, Icon */
// ShieldLend — Shared chrome components
const { useState, useEffect, useRef } = React;

/* ============================================================
   ModeIndicatorPill
   ============================================================ */
const ModeIndicatorPill = ({ mode, onClick }) => {
  const cfg = {
    full:      { cls: "pill-active",    label: "FULL PRIVACY" },
    degraded:  { cls: "pill-degraded",  label: "DEGRADED" },
    emergency: { cls: "pill-emergency", label: "EMERGENCY" },
  }[mode];
  return (
    <button className={`pill ${cfg.cls}`} onClick={onClick} title="Open Protocol Status">
      <span className="pill-dot" />
      {cfg.label}
    </button>
  );
};
window.ModeIndicatorPill = ModeIndicatorPill;

/* ============================================================
   NoteBackupChip
   ============================================================ */
const NoteBackupChip = ({ state, onClick }) => {
  const cfg = {
    backed:  { cls: "pill-neutral",  label: "BACKED UP", icon: "shield-check" },
    stale:   { cls: "pill-degraded", label: "BACKUP STALE", icon: "warning" },
    missing: { cls: "pill-danger",   label: "NOT BACKED UP", icon: "warning" },
  }[state];
  return (
    <button className={`pill ${cfg.cls}`} onClick={onClick}>
      <Icon name={cfg.icon} size={12} />
      {cfg.label}
    </button>
  );
};
window.NoteBackupChip = NoteBackupChip;

/* ============================================================
   PrivacyDisclosurePanel
   ============================================================ */
const PrivacyDisclosurePanel = ({ mode, hidden, observable, responsibility, context }) => {
  return (
    <div className="disclosure-panel" data-mode={mode}>
      <div className="disclosure-header">
        <div className="row gap-8">
          <Icon name="shield" size={14} color="var(--privacy-active)" />
          <span className="t-micro fg-secondary">Privacy contract</span>
        </div>
        <Icon name="info" size={14} color="var(--fg-tertiary)" />
      </div>
      <div className="disclosure-grid">
        <div className="disclosure-col" data-kind="hidden">
          <div className="t-micro fg-tertiary col-label" style={{ marginBottom: 10 }}>Hidden</div>
          {hidden.map((b,i) => <div key={i} className="disclosure-bullet">{b}</div>)}
        </div>
        <div className="disclosure-col" data-kind="observable">
          <div className="t-micro fg-tertiary col-label" style={{ marginBottom: 10 }}>Observable</div>
          {observable.map((b,i) => <div key={i} className="disclosure-bullet">{b}</div>)}
        </div>
        <div className="disclosure-col" data-kind="responsibility">
          <div className="t-micro col-label" style={{ marginBottom: 10 }}>Your responsibility</div>
          {responsibility.map((b,i) => <div key={i} className="disclosure-bullet" style={{ color: "hsl(195 30% 18%)" }}>{b}</div>)}
        </div>
      </div>
      <div className="disclosure-footer">
        <div className="row gap-8">
          <span className={`pill-dot`} style={{
            background: mode === "full" ? "var(--privacy-active)" : mode === "degraded" ? "var(--privacy-degraded)" : "var(--danger)",
          }}/>
          <span className="t-micro fg-secondary">
            Mode · {mode === "full" ? "Full Privacy" : mode === "degraded" ? "Degraded" : "Emergency"}
          </span>
        </div>
        <span className="t-caption fg-tertiary">{context}</span>
      </div>
    </div>
  );
};
window.PrivacyDisclosurePanel = PrivacyDisclosurePanel;

/* ============================================================
   ModeDegradationBanner
   ============================================================ */
const RAIL_COPY = {
  pay:     ["MagicBlock Private Payments", "Private Payments is offline. Repayment amount privacy is unavailable.", "You can still repay; the amount will be visible on-chain.", "Privacy claim reduced from Full to Degraded — identity remains hidden."],
  umbra:   ["Umbra", "Umbra stealth address service is offline. New withdrawals must use a manually generated address.", "Existing withdrawals are unaffected.", "Privacy reduced — destination address graph is no longer protected for this withdrawal."],
  ika:     ["IKA dWallet", "IKA dWallet network is unreachable. Borrowing is disabled because liquidation pre-authorization cannot be issued.", "Existing loans, repayments, and withdrawals remain available.", "This is intentional safety, not a degradation."],
  encrypt: ["Encrypt FHE oracle", "Encrypted oracle is stale (4 epochs). Borrowing and liquidation are paused.", "Repayment, withdrawal, and deposit remain available.", "Existing positions are safe."],
  per:     ["MagicBlock PER", "Private Epoch Rotation is offline. Deposits will route directly through the relay; flush timing becomes public.", "Anonymity set still includes ring of 16, but cross-batch unlinkability is degraded.", "Privacy claim reduced to Degraded."],
  zk:      ["ZK verifier", "Verifier program is in a maintenance window. All transactions are paused for ~5 minutes.", "Read-only access (history, status) remains.", "Estimated restore: 5m."],
};

const ModeDegradationBanner = ({ mode, rail = "pay", onDismiss, onOpenStatus }) => {
  if (mode === "full") return null;
  if (mode === "emergency") {
    return (
      <div className="banner slide-down" data-kind="emergency">
        <Icon name="alert" size={18} color="var(--danger)" />
        <div className="col" style={{ flex: 1 }}>
          <div className="t-micro" style={{ color: "var(--danger)" }}>Emergency mode</div>
          <div className="t-body fg-primary">
            Direct SOL release path is active by governance vote. Exposing wallet may be required for some operations.
            Repayment is encouraged; new borrows are disabled.
          </div>
        </div>
        <button className="btn btn-sm btn-ghost" onClick={onOpenStatus}>Read more</button>
      </div>
    );
  }
  const [name, claim, still, updated] = RAIL_COPY[rail] || RAIL_COPY.pay;
  return (
    <div className="banner slide-down">
      <Icon name="warning" size={18} color="var(--privacy-degraded)" />
      <div className="col" style={{ flex: 1 }}>
        <div className="row gap-12" style={{ marginBottom: 2 }}>
          <span className="t-micro" style={{ color: "var(--privacy-degraded)" }}>Rail offline</span>
          <span className="t-micro fg-tertiary">{name}</span>
        </div>
        <div className="t-body fg-primary">
          <strong style={{ fontWeight: 600 }}>{claim}</strong>{" "}
          <span className="fg-secondary">{still}</span>{" "}
          <span className="fg-secondary">{updated}</span>
        </div>
      </div>
      <button className="btn btn-sm btn-ghost" onClick={onOpenStatus}>Read more</button>
      {onDismiss && <button className="btn btn-sm btn-ghost" onClick={onDismiss} aria-label="Dismiss"><Icon name="x" size={14}/></button>}
    </div>
  );
};
window.ModeDegradationBanner = ModeDegradationBanner;

/* ============================================================
   WalletPill / NetworkSelector
   ============================================================ */
const NetworkSelector = () => (
  <div className="pill pill-neutral" style={{ cursor: "default" }}>
    <span className="pill-dot" style={{ background: "var(--success)" }}/>
    Solana · Devnet
    <Icon name="chevron-down" size={12} />
  </div>
);
window.NetworkSelector = NetworkSelector;

const WalletPill = ({ short = "7gB…kQz" }) => (
  <button className="pill pill-neutral">
    <Icon name="wallet" size={12} />
    {short}
  </button>
);
window.WalletPill = WalletPill;

/* ============================================================
   Note Status Badge (for note rows)
   ============================================================ */
const NoteStatusBadge = ({ status }) => {
  const cfg = {
    Active: { color: "var(--privacy-active)", label: "ACTIVE" },
    Locked: { color: "var(--privacy-degraded)", label: "LOCKED" },
    Spent:  { color: "var(--fg-tertiary)", label: "SPENT" },
  }[status];
  return (
    <span className="row gap-6" style={{ alignItems: "center" }}>
      <span className="pill-dot" style={{ background: cfg.color }}/>
      <span className="t-micro" style={{ color: cfg.color }}>{cfg.label}</span>
    </span>
  );
};
window.NoteStatusBadge = NoteStatusBadge;

/* ============================================================
   RingMeter — visualizes K out of 16
   ============================================================ */
const RingMeter = ({ ready = 16, total = 16 }) => (
  <span className="dot-meter" title={`Ring readiness: ${ready}/${total}`}>
    {Array.from({ length: total }).map((_, i) => (
      <span key={i} data-on={i < ready} />
    ))}
  </span>
);
window.RingMeter = RingMeter;

/* ============================================================
   StepperRow
   ============================================================ */
const StepperRow = ({ steps, active = 0 }) => (
  <div className="col gap-12">
    {steps.map((s, i) => {
      const state = i < active ? "done" : i === active ? "current" : "pending";
      const dotColor =
        state === "done" ? "var(--privacy-active)" :
        state === "current" ? "var(--privacy-active)" :
        "var(--fg-quaternary)";
      return (
        <div key={i} className="row gap-12">
          <span className="t-num-s fg-tertiary" style={{ minWidth: 16 }}>{i+1}</span>
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: state === "done" ? dotColor : "transparent",
            border: `1px solid ${dotColor}`,
            flexShrink: 0,
            ...(state === "current" ? { boxShadow: `0 0 0 4px color-mix(in srgb, ${dotColor} 20%, transparent)` } : {}),
          }}/>
          <span className={state === "pending" ? "t-body fg-tertiary" : "t-body fg-primary"}>{s}</span>
        </div>
      );
    })}
  </div>
);
window.StepperRow = StepperRow;
