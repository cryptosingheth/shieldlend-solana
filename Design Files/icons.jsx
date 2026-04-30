/* global React */
// Inline icon set — Phosphor-style line icons, weight ~1.6

const Icon = ({ name, size = 16, color = "currentColor", strokeWidth = 1.6, ...rest }) => {
  const s = size;
  const sw = strokeWidth;
  const common = { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: sw, strokeLinecap: "round", strokeLinejoin: "round", ...rest };
  switch (name) {
    case "shield":
      return (<svg {...common}><path d="M12 3 4 6v6c0 4.5 3.2 8.4 8 9 4.8-.6 8-4.5 8-9V6l-8-3Z"/></svg>);
    case "shield-check":
      return (<svg {...common}><path d="M12 3 4 6v6c0 4.5 3.2 8.4 8 9 4.8-.6 8-4.5 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/></svg>);
    case "key":
      return (<svg {...common}><circle cx="8" cy="14" r="3.5"/><path d="m11 12 8-8"/><path d="m17 6 2 2"/><path d="m15 8 2 2"/></svg>);
    case "vault":
      return (<svg {...common}><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="12" r="3.5"/><path d="M12 8.5v.5M12 15v.5M8.5 12h.5M15 12h.5"/></svg>);
    case "lock":
      return (<svg {...common}><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>);
    case "unlock":
      return (<svg {...common}><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.8-1"/></svg>);
    case "eye":
      return (<svg {...common}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>);
    case "eye-off":
      return (<svg {...common}><path d="M3 3l18 18"/><path d="M10.6 6.1A10 10 0 0 1 12 6c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 7.6A17 17 0 0 0 2 12s3.6 7 10 7c1.5 0 2.8-.3 4-.8"/><path d="M9.6 9.6a3 3 0 0 0 4.2 4.2"/></svg>);
    case "wallet":
      return (<svg {...common}><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><circle cx="17" cy="14.5" r="1.2" fill={color}/></svg>);
    case "deposit":
      return (<svg {...common}><path d="M12 4v12"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/></svg>);
    case "withdraw":
      return (<svg {...common}><path d="M12 20V8"/><path d="m7 13 5-5 5 5"/><path d="M5 4h14"/></svg>);
    case "borrow":
      return (<svg {...common}><circle cx="12" cy="12" r="9"/><path d="M9 12h6"/><path d="M12 9v6"/></svg>);
    case "repay":
      return (<svg {...common}><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>);
    case "history":
      return (<svg {...common}><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/></svg>);
    case "positions":
      return (<svg {...common}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>);
    case "status":
      return (<svg {...common}><path d="M3 12h4l2-7 4 14 2-7h6"/></svg>);
    case "settings":
      return (<svg {...common}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9A1.7 1.7 0 0 0 10 3.1V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>);
    case "chevron-down":
      return (<svg {...common}><path d="m6 9 6 6 6-6"/></svg>);
    case "chevron-right":
      return (<svg {...common}><path d="m9 6 6 6-6 6"/></svg>);
    case "chevron-left":
      return (<svg {...common}><path d="m15 6-6 6 6 6"/></svg>);
    case "x":
      return (<svg {...common}><path d="M18 6 6 18M6 6l12 12"/></svg>);
    case "check":
      return (<svg {...common}><path d="m4 12 5 5L20 6"/></svg>);
    case "info":
      return (<svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/></svg>);
    case "warning":
      return (<svg {...common}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17v.01"/></svg>);
    case "alert":
      return (<svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16v.01"/></svg>);
    case "qr":
      return (<svg {...common}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3z"/><path d="M20 14v3M14 20h7"/></svg>);
    case "copy":
      return (<svg {...common}><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>);
    case "refresh":
      return (<svg {...common}><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/></svg>);
    case "filter":
      return (<svg {...common}><path d="M4 4h16l-6 8v6l-4 2v-8L4 4Z"/></svg>);
    case "search":
      return (<svg {...common}><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>);
    case "export":
      return (<svg {...common}><path d="M12 4v12"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/></svg>);
    case "menu":
      return (<svg {...common}><path d="M4 6h16M4 12h16M4 18h16"/></svg>);
    case "panel-left":
      return (<svg {...common}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></svg>);
    case "ring":
      return (<svg {...common}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/></svg>);
    case "dot":
      return (<svg {...common}><circle cx="12" cy="12" r="4" fill={color}/></svg>);
    case "spark":
      return (<svg {...common}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/></svg>);
    case "external":
      return (<svg {...common}><path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M20 14v6H4V4h6"/></svg>);
    case "moon":
      return (<svg {...common}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>);
    case "minimize":
      return (<svg {...common}><path d="M5 12h14"/></svg>);
    case "plus":
      return (<svg {...common}><path d="M12 5v14M5 12h14"/></svg>);
    default:
      return null;
  }
};
window.Icon = Icon;
