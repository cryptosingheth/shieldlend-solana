/* global React */
// ShieldedSOL v2 — line icons (1.5 stroke). Minimal, modern set.

const Icon = ({ name, size = 16, color = "currentColor", strokeWidth = 1.6 }) => {
  const s = size;
  const props = { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth, strokeLinecap: "round", strokeLinejoin: "round" };
  const P = {
    home:    <path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"/>,
    deposit: <g><path d="M12 4v12"/><path d="m6 11 6 6 6-6"/><path d="M4 20h16"/></g>,
    withdraw:<g><path d="M12 20V8"/><path d="m6 13 6-6 6 6"/><path d="M4 4h16"/></g>,
    borrow:  <g><circle cx="12" cy="12" r="8"/><path d="M9 12h6"/><path d="M12 9v6"/></g>,
    repay:   <g><circle cx="12" cy="12" r="8"/><path d="M9 12h6"/></g>,
    history: <g><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 8v4l3 2"/></g>,
    earn:    <g><path d="M12 2v20"/><path d="M16 6a4 4 0 0 0-8 0c0 5 8 5 8 9a4 4 0 0 1-8 0"/></g>,
    market:  <g><path d="M3 21V8"/><path d="M9 21V4"/><path d="M15 21V11"/><path d="M21 21V6"/></g>,
    settings:<g><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></g>,
    shield:  <path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6z"/>,
    lock:    <g><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 1 1 8 0v4"/></g>,
    eye:     <g><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12"/><circle cx="12" cy="12" r="3"/></g>,
    "eye-off": <g><path d="M3 3l18 18"/><path d="M10.6 6.1A11 11 0 0 1 12 6c6 0 10 6 10 6a14.1 14.1 0 0 1-3.6 4"/><path d="M6.6 6.6A14 14 0 0 0 2 12s4 6 10 6a10 10 0 0 0 4-.8"/><path d="M14 14a3 3 0 0 1-4-4"/></g>,
    info:    <g><circle cx="12" cy="12" r="9"/><path d="M12 16v-4"/><path d="M12 8h.01"/></g>,
    warning: <g><path d="M12 3 2 21h20z"/><path d="M12 10v5"/><path d="M12 18h.01"/></g>,
    check:   <path d="m4 12 5 5L20 6"/>,
    x:       <g><path d="m6 6 12 12"/><path d="m18 6-12 12"/></g>,
    chev:    <path d="m9 6 6 6-6 6"/>,
    "chev-d":<path d="m6 9 6 6 6-6"/>,
    plus:    <g><path d="M12 5v14"/><path d="M5 12h14"/></g>,
    minus:   <path d="M5 12h14"/>,
    copy:    <g><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></g>,
    external:<g><path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/><path d="M14 4h6v6"/><path d="m20 4-9 9"/></g>,
    refresh: <g><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></g>,
    arrow:   <g><path d="M5 12h14"/><path d="m13 5 7 7-7 7"/></g>,
    sparkle: <g><path d="M12 3v3"/><path d="M12 18v3"/><path d="M5 12H2"/><path d="M22 12h-3"/><path d="m18 6-2 2"/><path d="m8 16-2 2"/><path d="m18 18-2-2"/><path d="m8 8-2-2"/></g>,
    key:     <g><circle cx="8" cy="15" r="4"/><path d="m11 12 9-9"/><path d="m17 6 3 3"/><path d="m14 9 3 3"/></g>,
    user:    <g><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 1 1 16 0"/></g>,
    bolt:    <path d="M13 2 4 14h7l-1 8 9-12h-7z"/>,
    qr:      <g><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3z"/><path d="M19 19h2v2h-2z"/><path d="M14 19h2v2h-2z"/></g>,
    receipt: <g><path d="M5 3h14v18l-3-2-3 2-3-2-3 2-2-1V3z"/><path d="M9 8h6"/><path d="M9 12h6"/><path d="M9 16h4"/></g>,
    bell:    <g><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 21a2 2 0 0 0 4 0"/></g>,
    search:  <g><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></g>,
    sun:     <g><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.9 4.9 1.4 1.4"/><path d="m17.7 17.7 1.4 1.4"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m4.9 19.1 1.4-1.4"/><path d="m17.7 6.3 1.4-1.4"/></g>,
  };
  return <svg {...props}>{P[name] || null}</svg>;
};

window.Icon = Icon;
