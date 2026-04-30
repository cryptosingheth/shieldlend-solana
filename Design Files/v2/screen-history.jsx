/* global React, Icon, SS_DATA, SS_FMT */
const { useState: useHS } = React;

const HistoryScreen = () => {
  const [filter, setFilter] = useHS("all");
  const [selected, setSelected] = useHS(null);
  const [showKeys, setShowKeys] = useHS(false);
  const events = filter === "all" ? SS_DATA.history : SS_DATA.history.filter(h => h.kind === filter);

  return (
    <div className="col gap-32 fade-up">
      <div className="row between" style={{ alignItems: "flex-end" }}>
        <div className="col gap-6">
          <span className="t-cap">Activity</span>
          <h1 className="t-h1 fg-1">Your private ledger.</h1>
          <p className="t-body-l" style={{ maxWidth: 560 }}>Only you can see this list. Tap any item for the receipt and the keys you can share to prove it happened.</p>
        </div>
        <button className="btn btn-quiet btn-sm" onClick={() => setShowKeys(true)}><Icon name="key" size={13}/> Sharing keys</button>
      </div>

      <div className="row gap-8" style={{ flexWrap: "wrap" }}>
        {[["all","All"],["deposit","Deposits"],["withdraw","Withdrawals"],["borrow","Borrows"],["repay","Repayments"]].map(([k,l]) => (
          <button key={k} className="btn btn-sm btn-pill" style={{ background: filter===k ? "var(--surface-3)" : "var(--surface-1)", border: "1px solid var(--hairline-soft)", color: filter===k ? "var(--fg-1)" : "var(--fg-3)" }} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>

      <div className="card" style={{ padding: 0 }}>
        {events.map((h, i) => (
          <button key={h.id} onClick={() => setSelected(h)} className="row gap-14" style={{ width: "100%", padding: "16px 22px", borderBottom: i < events.length - 1 ? "1px solid var(--hairline-soft)" : "none", textAlign: "left", transition: "background 140ms" }} onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            <ActIcon kind={h.kind}/>
            <div className="col" style={{ flex: 1 }}>
              <span className="t-body fg-1">{h.note}</span>
              <span className="t-cap">{h.t}</span>
            </div>
            <span className="t-body fg-1 t-num">{h.kind === "withdraw" || h.kind === "borrow" ? "−" : "+"}{h.amount.toFixed(2)} SOL</span>
            <span className="chip" data-tone="seal"><Icon name="shield" size={10}/> Shielded</span>
            <Icon name="chev" size={12} color="var(--fg-4)"/>
          </button>
        ))}
      </div>

      {selected && <ReceiptDrawer event={selected} onClose={() => setSelected(null)}/>}
      {showKeys && <KeysDrawer onClose={() => setShowKeys(false)}/>}
    </div>
  );
};

const ActIcon = ({ kind }) => {
  const M = {
    deposit:  { icon: "deposit",  tone: "var(--brand)" },
    withdraw: { icon: "withdraw", tone: "var(--fg-2)" },
    borrow:   { icon: "borrow",   tone: "var(--warn)" },
    repay:    { icon: "repay",    tone: "var(--good)" },
  };
  const m = M[kind] || M.deposit;
  return (
    <span style={{ width: 36, height: 36, borderRadius: 999, background: "var(--surface-1)", border: "1px solid var(--hairline-soft)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: m.tone }}>
      <Icon name={m.icon} size={15}/>
    </span>
  );
};

const ReceiptDrawer = ({ event, onClose }) => {
  const [revealed, setRevealed] = useHS(false);
  return (
    <Drawer onClose={onClose} title="Receipt">
      <div className="col gap-20">
        <div>
          <span className="t-cap">Action</span>
          <div className="t-h2 fg-1" style={{ marginTop: 4, textTransform: "capitalize" }}>{event.note}</div>
          <span className="t-body fg-3">{event.t}</span>
        </div>

        <div className="card-quiet col gap-12" style={{ padding: 18 }}>
          <KV k="Amount" v={`${(event.kind === "withdraw" || event.kind === "borrow" ? "−" : "+") + event.amount.toFixed(2)} SOL`}/>
          <KV k="Status" v={<span className="row gap-6"><span className="dot" style={{ color: "var(--good)" }}/><span className="fg-good">Confirmed</span></span>}/>
          <KV k="Privacy" v={<span className="row gap-6"><Icon name="shield" size={11} color="var(--seal)"/><span className="fg-seal">Shielded</span></span>}/>
        </div>

        <div>
          <div className="row between" style={{ marginBottom: 8 }}>
            <span className="t-cap">Verifiable receipt</span>
            <span className="chip"><Icon name="lock" size={10}/> Local only</span>
          </div>
          <div className="card-quiet col gap-10" style={{ padding: 16 }}>
            <KV k="Receipt ID" v={<span className="t-mono fg-2">rcp_{event.id}_a8f2…91c</span>}/>
            <KV k="Inclusion proof" v={<span className="t-mono fg-2">0x9c…d7a3</span>}/>
            <KV k="Reference" v={
              <button className="reveal" onClick={() => setRevealed(!revealed)}>
                {revealed
                  ? <span className="t-mono">{SS_DATA.keys.nullifier}</span>
                  : <span className="reveal-mask">•••• •••• ••••</span>}
                <Icon name={revealed ? "eye-off" : "eye"} size={12}/>
              </button>
            }/>
          </div>
          <div className="t-cap" style={{ marginTop: 8, lineHeight: 1.5 }}>
            Share this receipt to prove the transaction happened, without revealing your wallet or balance.
          </div>
        </div>

        <div className="row gap-10">
          <button className="btn btn-quiet btn-sm"><Icon name="copy" size={12}/> Copy receipt</button>
          <button className="btn btn-quiet btn-sm"><Icon name="external" size={12}/> Export proof</button>
        </div>
      </div>
    </Drawer>
  );
};

const KeysDrawer = ({ onClose }) => {
  const [showSpending, setShowSpending] = useHS(false);
  const [showViewing, setShowViewing] = useHS(false);
  return (
    <Drawer onClose={onClose} title="Sharing keys">
      <div className="col gap-20">
        <p className="t-body fg-2" style={{ lineHeight: 1.55 }}>
          You hold two keys for this account. They live on your device and are never sent anywhere automatically.
        </p>

        <div className="card-quiet col gap-10" style={{ padding: 18 }}>
          <div className="row between">
            <div className="col">
              <span className="t-h3 fg-1">Viewing key</span>
              <span className="t-cap">Read-only · safe to share with auditors or accountants</span>
            </div>
            <Icon name="eye" size={16} color="var(--seal)"/>
          </div>
          <button className="reveal" onClick={() => setShowViewing(!showViewing)}>
            {showViewing
              ? <span className="t-mono">{SS_DATA.keys.viewing}</span>
              : <span className="reveal-mask">•••• •••• •••• •••</span>}
            <Icon name={showViewing ? "eye-off" : "eye"} size={12}/>
          </button>
          <div className="row gap-8">
            <button className="btn btn-sm btn-quiet"><Icon name="copy" size={12}/> Copy</button>
            <button className="btn btn-sm btn-quiet"><Icon name="qr" size={12}/> Show QR</button>
            <button className="btn btn-sm btn-quiet"><Icon name="refresh" size={12}/> Rotate</button>
          </div>
        </div>

        <div className="card-quiet col gap-10" style={{ padding: 18, borderColor: "hsla(2 84% 64% / 0.25)" }}>
          <div className="row between">
            <div className="col">
              <span className="t-h3 fg-1">Spending key</span>
              <span className="t-cap fg-danger">Never share. Anyone with this key can move your funds.</span>
            </div>
            <Icon name="lock" size={16} color="var(--danger)"/>
          </div>
          <button className="reveal" onClick={() => setShowSpending(!showSpending)} style={{ borderColor: "hsla(2 84% 64% / 0.3)" }}>
            {showSpending
              ? <span className="t-mono">{SS_DATA.keys.spending}</span>
              : <span className="reveal-mask">•••• •••• •••• •••</span>}
            <Icon name={showSpending ? "eye-off" : "eye"} size={12}/>
          </button>
          <div className="row gap-8">
            <button className="btn btn-sm btn-quiet"><Icon name="copy" size={12}/> Copy to backup</button>
            <button className="btn btn-sm btn-quiet"><Icon name="key" size={12}/> Back up to device</button>
          </div>
        </div>

        <div className="card-quiet" style={{ padding: 14, background: "var(--seal-soft)", borderColor: "hsla(160 60% 60% / 0.25)" }}>
          <div className="row gap-10">
            <Icon name="info" size={14} color="var(--seal)"/>
            <span className="t-body fg-2" style={{ lineHeight: 1.5 }}>
              The viewing key gives someone read access to your shielded balance and history — useful for tax software or an audit. They cannot move funds.
            </span>
          </div>
        </div>
      </div>
    </Drawer>
  );
};

const KV = ({ k, v }) => (
  <div className="row between">
    <span className="t-body fg-3">{k}</span>
    <span className="t-body fg-1 t-num">{v}</span>
  </div>
);

const Drawer = ({ children, onClose, title }) => (
  <>
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "hsla(0 0% 0% / 0.5)", backdropFilter: "blur(6px)", zIndex: 90, animation: "fadeIn 180ms" }}/>
    <aside style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 460, background: "var(--bg-soft)", borderLeft: "1px solid var(--hairline-soft)", boxShadow: "-30px 0 80px hsla(0 0% 0% / 0.5)", zIndex: 91, padding: 28, overflow: "auto", animation: "slideIn 240ms cubic-bezier(0.2, 0.8, 0.2, 1)" }}>
      <div className="row between" style={{ marginBottom: 24 }}>
        <span className="t-h3 fg-1">{title}</span>
        <button className="btn btn-sm btn-ghost" onClick={onClose}><Icon name="x" size={14}/></button>
      </div>
      {children}
    </aside>
  </>
);

window.HistoryScreen = HistoryScreen;
