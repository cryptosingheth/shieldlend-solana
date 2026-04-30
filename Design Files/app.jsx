/* global React, Icon, NoteBackupChip, ModeIndicatorPill, ModeDegradationBanner, OnboardingFlow,
   PositionsScreen, DepositScreen, WithdrawScreen, BorrowScreen, RepayScreen, HistoryScreen,
   StatusSlideover, TweaksPanel, useTweaks, TweakRadio, TweakToggle, TweakSection */
const { useState: useAppState } = React;

const NAV = [
  { k: "positions", label: "Positions", icon: "home", op: "00" },
  { k: "deposit",   label: "Deposit",   icon: "deposit", op: "01" },
  { k: "withdraw",  label: "Withdraw",  icon: "withdraw", op: "02" },
  { k: "borrow",    label: "Borrow",    icon: "borrow", op: "03" },
  { k: "repay",     label: "Repay",     icon: "repay", op: "04" },
  { k: "history",   label: "History",   icon: "history", op: "05" },
];

const App = () => {
  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    "mode": "full",
    "vaultBacked": true,
    "showOnboarding": false,
    "screen": "positions"
  }/*EDITMODE-END*/;

  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const { mode, vaultBacked, showOnboarding, screen } = tweaks;
  const [statusOpen, setStatusOpen] = useAppState(false);

  const navigate = (k) => setTweak("screen", k);

  return (
    <div className="app-shell" data-mode={mode} data-screen-label={`shieldedSOL · ${screen}`}>
      <div className="grain"/>

      {/* Top bar */}
      <header className="topbar">
        <div className="row gap-32" style={{ alignItems: "center" }}>
          <div className="row gap-10" style={{ alignItems: "center" }}>
            <Logomark/>
            <div className="col">
              <span className="t-num fg-primary" style={{ fontSize: 13, letterSpacing: "0.01em" }}>shieldedSOL</span>
              <span className="t-caption fg-tertiary" style={{ fontSize: 9, letterSpacing: "1.5px" }}>SHIELDED LENDING · v0.4 BETA</span>
            </div>
          </div>
          <div className="topbar-divider"/>
          <span className="t-caption fg-tertiary">SLOT 312_410_991 · EPOCH 4178</span>
        </div>
        <div className="row gap-12" style={{ alignItems: "center" }}>
          <NoteBackupChip state={vaultBacked ? "backed" : "missing"} onClick={() => setTweak("vaultBacked", !vaultBacked)}/>
          <ModeIndicatorPill mode={mode} onClick={() => setStatusOpen(true)}/>
          <button className="btn btn-sm btn-ghost" onClick={() => setStatusOpen(true)}>
            <Icon name="info" size={12}/> Status
          </button>
          <div className="topbar-divider"/>
          <button className="btn btn-sm btn-ghost"><Icon name="user" size={12}/> 7gB…kQz</button>
        </div>
      </header>

      <ModeDegradationBanner mode={mode}/>

      {/* Sidebar */}
      <nav className="sidebar">
          <div className="t-micro fg-tertiary" style={{ marginBottom: 14, padding: "0 14px" }}>OPERATIONS</div>
          <div className="col gap-2">
            {NAV.map(n => (
              <button key={n.k} className="nav-item" data-active={screen === n.k} onClick={() => navigate(n.k)}>
                <span className="nav-op t-num-s">{n.op}</span>
                <Icon name={n.icon} size={14}/>
                <span className="t-body">{n.label}</span>
              </button>
            ))}
          </div>
          <div style={{ flex: 1 }}/>
          <div className="card-hairline" style={{ padding: 12, margin: "12px 8px" }}>
            <div className="t-micro fg-tertiary" style={{ marginBottom: 6 }}>Anonymity set</div>
            <div className="row gap-8" style={{ alignItems: "baseline" }}>
              <span className="t-num-l fg-primary">318</span>
              <span className="t-caption fg-tertiary">depositors</span>
            </div>
            <div className="bar" style={{ marginTop: 8 }}><div className="bar-fill" style={{ width: "78%" }}/></div>
            <div className="t-caption fg-tertiary" style={{ marginTop: 6 }}>Healthy · target 64+</div>
          </div>
        </nav>

        {/* Main */}
        <main className="main">
          {screen === "positions" && <PositionsScreen mode={mode} onNav={navigate}/>}
          {screen === "deposit"   && <DepositScreen mode={mode} vaultBacked={vaultBacked} onRequireBackup={() => setTweak("vaultBacked", true)}/>}
          {screen === "withdraw"  && <WithdrawScreen mode={mode}/>}
          {screen === "borrow"    && <BorrowScreen mode={mode}/>}
          {screen === "repay"     && <RepayScreen mode={mode}/>}
          {screen === "history"   && <HistoryScreen mode={mode}/>}
        </main>

      {showOnboarding && <OnboardingFlow onComplete={() => setTweak("showOnboarding", false)}/>}

      <StatusSlideover open={statusOpen} onClose={() => setStatusOpen(false)} mode={mode}/>

      <TweaksPanel title="Tweaks · shieldedSOL" defaultPosition={{ right: 24, bottom: 24 }}>
        <TweakSection title="Protocol mode" subtitle="Switch network state to see how the UI changes">
          <TweakRadio label="Mode" value={mode} options={[
            { value: "full", label: "Full" },
            { value: "degraded", label: "Degraded" },
            { value: "emergency", label: "Emergency" },
          ]} onChange={v => setTweak("mode", v)}/>
        </TweakSection>
        <TweakSection title="Account state">
          <TweakToggle label="Note vault backed up" value={vaultBacked} onChange={v => setTweak("vaultBacked", v)}/>
          <TweakToggle label="Show onboarding flow" value={showOnboarding} onChange={v => setTweak("showOnboarding", v)}/>
        </TweakSection>
        <TweakSection title="Jump to screen">
          <TweakRadio label="Screen" value={screen} options={[
            { value: "positions", label: "Positions" },
            { value: "deposit", label: "Deposit" },
            { value: "withdraw", label: "Withdraw" },
            { value: "borrow", label: "Borrow" },
            { value: "repay", label: "Repay" },
            { value: "history", label: "History" },
          ]} onChange={v => setTweak("screen", v)}/>
        </TweakSection>
      </TweaksPanel>
    </div>
  );
};

const Logomark = () => (
  <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
    <path d="M16 2 L28 9 L28 20 C28 25 22.6 29 16 30 C9.4 29 4 25 4 20 L4 9 Z" stroke="var(--privacy-active)" strokeWidth="1.5" fill="color-mix(in srgb, var(--privacy-active) 12%, transparent)"/>
    <circle cx="16" cy="15" r="3" fill="var(--privacy-active)"/>
    <path d="M11 19 Q16 22 21 19" stroke="var(--privacy-active)" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
  </svg>
);

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
