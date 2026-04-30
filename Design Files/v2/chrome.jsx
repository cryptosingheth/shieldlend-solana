/* global React, Icon, SS_DATA, SS_FMT */
const { useState } = React;

/* TopBar — minimal, fluent */
const TopBar = ({ onOpenAccount }) => (
  <header className="topbar">
    <div className="row gap-12" style={{ alignItems: "center" }}>
      <Logomark/>
      <span className="t-h3 fg-1" style={{ letterSpacing: "-0.01em" }}>shielded<span style={{ color: "var(--brand)" }}>SOL</span></span>
    </div>
    <div className="div-v" style={{ height: 22, marginLeft: 6, marginRight: 6 }}/>
    <span className="chip" data-tone="seal"><Icon name="shield" size={12}/> Private by default</span>
    <div style={{ flex: 1 }}/>
    <button className="btn btn-sm btn-ghost"><Icon name="search" size={14}/></button>
    <button className="btn btn-sm btn-ghost"><Icon name="bell" size={14}/></button>
    <div className="div-v" style={{ height: 22 }}/>
    <button className="btn btn-quiet btn-sm btn-pill" onClick={onOpenAccount}>
      <span className="asset" style={{ width: 18, height: 18, fontSize: 9 }}>U</span>
      <span className="t-mono" style={{ fontSize: 12 }}>{SS_DATA.user.address}</span>
      <Icon name="chev-d" size={12}/>
    </button>
  </header>
);

const Logomark = () => (
  <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
    <defs>
      <linearGradient id="lm" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stopColor="var(--brand)"/>
        <stop offset="1" stopColor="var(--brand-2)"/>
      </linearGradient>
    </defs>
    <path d="M16 3 5 8v9c0 6 4.6 10.5 11 12 6.4-1.5 11-6 11-12V8z" fill="url(#lm)" opacity="0.18"/>
    <path d="M16 3 5 8v9c0 6 4.6 10.5 11 12 6.4-1.5 11-6 11-12V8z" stroke="url(#lm)" strokeWidth="1.6" fill="none"/>
    <circle cx="16" cy="15" r="3" fill="url(#lm)"/>
  </svg>
);

/* Sidebar */
const SideNav = ({ active, onNav }) => {
  const items = [
    { k: "dashboard", icon: "home",     label: "Dashboard" },
    { k: "earn",      icon: "earn",     label: "Earn" },
    { k: "borrow",    icon: "borrow",   label: "Borrow" },
    { k: "history",   icon: "history",  label: "Activity" },
    { k: "settings",  icon: "settings", label: "Settings" },
  ];
  return (
    <nav className="sidenav">
      <div className="t-micro" style={{ padding: "4px 12px 10px" }}>Menu</div>
      <div className="col gap-2">
        {items.map(i => (
          <button key={i.k} className="nav-item" data-active={active === i.k} onClick={() => onNav(i.k)}>
            <span className="nav-icon"><Icon name={i.icon} size={16}/></span>
            <span>{i.label}</span>
          </button>
        ))}
      </div>
      <div style={{ flex: 1 }}/>
      <div className="card-quiet" style={{ padding: 14 }}>
        <div className="row gap-8" style={{ marginBottom: 8 }}>
          <Icon name="shield" size={14} color="var(--seal)"/>
          <span className="t-cap">Privacy</span>
        </div>
        <div className="t-body" style={{ color: "var(--fg-2)", lineHeight: 1.5 }}>
          Your balance, deposits and loans aren't linked to your wallet on-chain.
        </div>
      </div>
    </nav>
  );
};

/* Mode banner — used only for warn/danger */
const ModeBanner = ({ mode }) => {
  if (mode === "full") return null;
  if (mode === "degraded") return (
    <div className="mode-banner" data-tone="warn">
      <Icon name="warning" size={14}/>
      <span><strong>Some features are limited.</strong> New deposits are processing more slowly than usual.</span>
      <div style={{ flex: 1 }}/>
      <button className="btn btn-sm btn-ghost">Details</button>
    </div>
  );
  return (
    <div className="mode-banner" data-tone="danger">
      <Icon name="warning" size={14}/>
      <span><strong>Maintenance.</strong> New deposits and borrows are paused. Repay and withdraw remain available.</span>
      <div style={{ flex: 1 }}/>
      <button className="btn btn-sm btn-ghost">Status</button>
    </div>
  );
};

window.TopBar = TopBar;
window.SideNav = SideNav;
window.ModeBanner = ModeBanner;
window.Logomark = Logomark;
