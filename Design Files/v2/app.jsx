/* global React, Icon, TopBar, SideNav, ModeBanner, Dashboard, EarnScreen, BorrowScreen, HistoryScreen,
   TweaksPanel, useTweaks, TweakRadio, TweakSection */
const { useState: useApp } = React;

const App = () => {
  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    "screen": "dashboard",
    "mode": "full"
  }/*EDITMODE-END*/;
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const { screen, mode } = tweaks;
  const navigate = (k) => setTweak("screen", k);

  return (
    <div className="app" data-screen-label={`shieldedSOL · ${screen}`}>
      <TopBar onOpenAccount={() => {}}/>
      <ModeBanner mode={mode}/>
      <SideNav active={screen} onNav={navigate}/>
      <main className="main">
        {screen === "dashboard" && <Dashboard onNav={navigate}/>}
        {screen === "earn"      && <EarnScreen/>}
        {screen === "borrow"    && <BorrowScreen/>}
        {screen === "history"   && <HistoryScreen/>}
        {screen === "settings"  && <SettingsPlaceholder/>}
      </main>

      <TweaksPanel title="Preview controls" defaultPosition={{ right: 24, bottom: 24 }}>
        <TweakSection title="Network state" subtitle="Try how the app behaves when something is off">
          <TweakRadio label="Mode" value={mode} options={[
            { value: "full", label: "Normal" },
            { value: "degraded", label: "Limited" },
            { value: "emergency", label: "Maintenance" },
          ]} onChange={v => setTweak("mode", v)}/>
        </TweakSection>
        <TweakSection title="Jump to screen">
          <TweakRadio label="Screen" value={screen} options={[
            { value: "dashboard", label: "Dashboard" },
            { value: "earn",      label: "Earn" },
            { value: "borrow",    label: "Borrow" },
            { value: "history",   label: "Activity" },
            { value: "settings",  label: "Settings" },
          ]} onChange={v => setTweak("screen", v)}/>
        </TweakSection>
      </TweaksPanel>
    </div>
  );
};

const SettingsPlaceholder = () => (
  <div className="col gap-32 fade-up" style={{ maxWidth: 720 }}>
    <div className="col gap-6">
      <span className="t-cap">Settings</span>
      <h1 className="t-h1 fg-1">Account</h1>
    </div>
    <div className="card col gap-16">
      <div className="row between">
        <div className="col"><span className="t-body fg-1">Currency</span><span className="t-cap">USD</span></div>
        <button className="btn btn-quiet btn-sm">Change</button>
      </div>
      <div className="div-h"/>
      <div className="row between">
        <div className="col"><span className="t-body fg-1">Hide balances</span><span className="t-cap">Mask all amounts in this app</span></div>
        <button className="btn btn-quiet btn-sm"><Icon name="eye-off" size={12}/> Off</button>
      </div>
      <div className="div-h"/>
      <div className="row between">
        <div className="col"><span className="t-body fg-1">Auto-rotate viewing key</span><span className="t-cap">Generate a fresh viewing key every 30 days</span></div>
        <button className="btn btn-quiet btn-sm">Off</button>
      </div>
    </div>
  </div>
);

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
