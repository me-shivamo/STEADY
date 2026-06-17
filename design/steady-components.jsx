// ─────────────────────────────────────────────────────────────
// STEADY — shared data, icons, and reusable components
// ─────────────────────────────────────────────────────────────

const FOOD = {
  oatmeal: 'https://images.unsplash.com/photo-1517673400267-0251440c45dc?w=800',
  chicken: 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=800',
  yogurt: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=800',
  bowl: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800',
  pasta: 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=800',
};

const DATA = {
  user: { name: 'Shivam', goal: 'Lose weight', cur: 82.4, target: 76.0, kcal: 1850,
          P: 150, C: 200, F: 60, water: 2.5, streak: 7, longest: 23 },
  today: { eaten: 1240, remaining: 610, P: 78, C: 140, F: 45, water: 1.2 },
  weight: [
    { d: 'Jun 6', w: 83.1 }, { d: 'Jun 7', w: 82.9 }, { d: 'Jun 8', w: 82.9 },
    { d: 'Jun 9', w: 82.7 }, { d: 'Jun 10', w: 82.6 }, { d: 'Jun 11', w: 82.5 },
    { d: 'Jun 12', w: 82.4 },
  ],
  cals: [
    { d: 'Jun 6', c: 1780, st: 'ok' }, { d: 'Jun 7', c: 1820, st: 'ok' },
    { d: 'Jun 8', c: 0, st: 'miss' }, { d: 'Jun 9', c: 1830, st: 'ok' },
    { d: 'Jun 10', c: 1780, st: 'ok' }, { d: 'Jun 11', c: 1920, st: 'over' },
    { d: 'Jun 12', c: 1240, st: 'today' },
  ],
  // Full calendar weeks with per-day calories + macros (Mon–Sun)
  weeks: [
    { id: 'this', label: 'This week', range: 'Jun 9 – 15', days: [
      { d: 'Mon', n: 9,  kcal: 1830, P: 132, C: 178, F: 55, st: 'ok' },
      { d: 'Tue', n: 10, kcal: 1780, P: 128, C: 172, F: 52, st: 'ok' },
      { d: 'Wed', n: 11, kcal: 1920, P: 118, C: 225, F: 64, st: 'over' },
      { d: 'Thu', n: 12, kcal: 1240, P: 78,  C: 178, F: 27, st: 'today' },
      { d: 'Fri', n: 13, st: 'future' },
      { d: 'Sat', n: 14, st: 'future' },
      { d: 'Sun', n: 15, st: 'future' },
    ] },
    { id: 'last', label: 'Last week', range: 'Jun 2 – 8', days: [
      { d: 'Mon', n: 2, kcal: 1810, P: 140, C: 175, F: 53, st: 'ok' },
      { d: 'Tue', n: 3, kcal: 1790, P: 135, C: 170, F: 51, st: 'ok' },
      { d: 'Wed', n: 4, kcal: 2050, P: 120, C: 240, F: 70, st: 'over' },
      { d: 'Thu', n: 5, kcal: 1760, P: 145, C: 165, F: 50, st: 'ok' },
      { d: 'Fri', n: 6, kcal: 1780, P: 138, C: 172, F: 52, st: 'ok' },
      { d: 'Sat', n: 7, kcal: 1980, P: 110, C: 235, F: 66, st: 'over' },
      { d: 'Sun', n: 8, kcal: 0, st: 'miss' },
    ] },
  ],
};

// ── Icons (stroke = currentColor) ───────────────────────────
const Icon = {
  home: (f) => <svg width="26" height="26" viewBox="0 0 24 24" fill={f?'currentColor':'none'} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 001 1h12a1 1 0 001-1V9.5" fill={f?'currentColor':'none'}/></svg>,
  book: (f) => <svg width="26" height="26" viewBox="0 0 24 24" fill={f?'currentColor':'none'} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4.5A1.5 1.5 0 015.5 3H19a1 1 0 011 1v15a1 1 0 01-1 1H5.5A1.5 1.5 0 014 18.5z"/><path d="M4 17.5A1.5 1.5 0 015.5 16H20"/></svg>,
  spark: (f) => <svg width="26" height="26" viewBox="0 0 24 24" fill={f?'currentColor':'none'} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" fill={f?'currentColor':'none'}/><path d="M18.5 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" fill={f?'currentColor':'none'}/></svg>,
  user: (f) => <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.6" fill={f?'currentColor':'none'}/><path d="M4.5 20c.8-3.8 4-6 7.5-6s6.7 2.2 7.5 6" fill={f?'currentColor':'none'}/></svg>,
  camera: (c='currentColor') => <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5A1.5 1.5 0 014.5 7h2L8 4.8A1 1 0 018.9 4.3h6.2a1 1 0 01.9.5L17 7h2.5A1.5 1.5 0 0121 8.5v9A1.5 1.5 0 0119.5 19h-15A1.5 1.5 0 013 17.5z"/><circle cx="12" cy="13" r="3.4"/></svg>,
  bell: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9a6 6 0 0112 0c0 5 1.5 6 1.5 6h-15S6 14 6 9z"/><path d="M10 19a2 2 0 004 0"/></svg>,
  menu: (c='currentColor') => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>,
  bookmark: (c='currentColor', f=false) => <svg width="22" height="22" viewBox="0 0 24 24" fill={f?c:'none'} stroke={c} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4.5A1.5 1.5 0 017.5 3h9A1.5 1.5 0 0118 4.5V21l-6-4-6 4z"/></svg>,
  image: (c='currentColor') => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="8.5" cy="10" r="1.7"/><path d="M21 15.5l-5-5L5 19.5"/></svg>,
  chart: (f) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20V10M10 20V4M16 20v-6M22 20H2"/></svg>,
  back: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7"/></svg>,
  chevR: (c='currentColor') => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7"/></svg>,
  chevL: (c='currentColor') => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7"/></svg>,
  check: (c='currentColor') => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12.5l5 5L20 6.5"/></svg>,
  eye: (open) => open
    ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>
    : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7c2 0 3.7.6 5.2 1.5M22 12s-3.5 7-10 7c-2 0-3.7-.6-5.2-1.5"/><path d="M9.5 9.6a3 3 0 004.2 4.2M4 4l16 16"/></svg>,
  send: (c='var(--accent)') => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13M12 6l6 6-6 6"/></svg>,
  plus: (c='#fff', s=24) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>,
  close: (c='#fff') => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>,
  flash: (c='#fff') => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L4 14h6l-1 8 9-12h-6z"/></svg>,
  flip: (c='#fff') => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8a8 8 0 0114-3l1.5 1.5M21 16a8 8 0 01-14 3L5.5 17.5"/><path d="M18 4v3h-3M6 20v-3h3"/></svg>,
  apple: () => <svg width="18" height="20" viewBox="0 0 18 20" fill="#1D1D1F"><path d="M14.7 10.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9s-1.8-.8-3-.8c-1.5 0-3 .9-3.7 2.3-1.6 2.8-.4 6.9 1.1 9.2.8 1.1 1.6 2.3 2.8 2.3 1.1 0 1.5-.7 2.9-.7s1.7.7 2.9.7 2-1.1 2.7-2.2c.9-1.2 1.2-2.5 1.2-2.5s-2.4-.9-2.4-3.6zM12.4 3.8c.6-.8 1-1.8.9-2.8-.9 0-2 .6-2.6 1.3-.6.7-1.1 1.7-.9 2.7 1 .1 2-.5 2.6-1.2z"/></svg>,
  google: () => <svg width="18" height="18" viewBox="0 0 18 18"><path d="M17.6 9.2c0-.6-.1-1.3-.2-1.9H9v3.6h4.8c-.2 1.1-.8 2.1-1.8 2.7v2.3h2.9c1.7-1.6 2.7-3.9 2.7-6.7z" fill="#4285F4"/><path d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.3c-.8.5-1.8.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H.9v2.3C2.4 15.9 5.5 18 9 18z" fill="#34A853"/><path d="M3.9 10.7c-.2-.5-.3-1.1-.3-1.7s.1-1.2.3-1.7V5H.9C.3 6.2 0 7.5 0 9s.3 2.8.9 4l3-2.3z" fill="#FBBC05"/><path d="M9 3.6c1.3 0 2.5.5 3.5 1.4l2.6-2.6C13.5.9 11.4 0 9 0 5.5 0 2.4 2.1.9 5l3 2.3C4.6 5.1 6.6 3.6 9 3.6z" fill="#EA4335"/></svg>,
  pencil: (c='currentColor') => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16.5 3.5l4 4L7 21H3v-4z"/></svg>,
  calChev: (c='currentColor') => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>,
  lock: (c='currentColor') => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V7.5a4 4 0 018 0v3"/></svg>,
  calendar: (f) => <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" fill={f?'currentColor':'none'}/><path d="M3.5 9.5h17" stroke={f?'var(--card)':'currentColor'}/><path d="M8 3v4M16 3v4" stroke="currentColor"/></svg>,
  trash: (c='currentColor') => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9.5 7V5a1 1 0 011-1h3a1 1 0 011 1v2M6.5 7l.8 12a1 1 0 001 .9h7.4a1 1 0 001-.9L18.5 7"/></svg>,
  grip: (c='currentColor') => <svg width="16" height="16" viewBox="0 0 24 24" fill={c}><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>,
  swap: (c='currentColor') => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h13l-3-3M20 16H7l3 3"/></svg>,
};

const STATUS_PAD = 56; // clears status bar + island
const DEVICE_H = 874;   // IOSDevice inner height
const TAB_H = 80;       // bottom tab bar height

// ── Screen shell ─ single scroll container, explicit-height (clone-safe) ──
function Screen({ children, bg = 'var(--bg)', pad = true, scroll = true, style = {} }) {
  return (
    <div className="noscroll" style={{
      height: '100%', width: '100%', background: bg, position: 'relative',
      overflowY: scroll ? 'auto' : 'hidden', overflowX: 'hidden',
      paddingTop: pad ? STATUS_PAD : 0, ...style,
    }}>{children}</div>
  );
}
// Scroll is now just a padded content wrapper (Screen owns the scroll).
function Scroll({ children, style = {}, pb = 28 }) {
  return <div style={{ paddingBottom: pb, ...style }}>{children}</div>;
}

// ── Buttons ─────────────────────────────────────────────────
function Btn({ children, onClick, variant = 'primary', style = {} }) {
  const base = { width: '100%', height: 56, borderRadius: 12, fontSize: 17, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, whiteSpace: 'nowrap',
    transition: 'transform .12s, filter .12s, background .12s', letterSpacing: 0.1 };
  const skins = {
    primary: { background: 'var(--accent)', color: '#fff', border: 'none', boxShadow: '0 2px 10px rgba(0,0,0,0.18)' },
    ghostLight: { background: 'transparent', color: '#fff', border: '1.5px solid rgba(255,255,255,0.7)' },
    outline: { background: 'var(--card)', color: 'var(--text)', border: '1.5px solid var(--border)' },
  };
  return (
    <button onClick={onClick}
      onMouseDown={e => e.currentTarget.style.transform = 'scale(0.975)'}
      onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
      style={{ ...base, ...skins[variant], ...style }}>{children}</button>
  );
}

// ── Avatar ──────────────────────────────────────────────────
function SteadyAvatar({ size = 36 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(160deg, #FF8A4B, #F2542D)', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 800, fontSize: size * 0.42, boxShadow: '0 2px 8px rgba(242,84,45,0.40)' }}>S</div>
  );
}

// ── Macro chip ──────────────────────────────────────────────
function MacroChip({ kind, value }) {
  const map = {
    kcal: { bg: 'var(--accent-soft)', fg: 'var(--accent)', label: value + ' kcal' },
    P: { bg: 'var(--protein-soft)', fg: 'var(--protein)', label: 'P ' + value + 'g' },
    C: { bg: 'var(--carbs-soft)', fg: 'var(--carbs)', label: 'C ' + value + 'g' },
    F: { bg: 'var(--fat-soft)', fg: 'var(--fat)', label: 'F ' + value + 'g' },
  };
  const m = map[kind];
  return (
    <span className="tnum" style={{ display: 'inline-flex', alignItems: 'center', height: 28,
      padding: '0 11px', borderRadius: 20, background: m.bg, color: m.fg,
      fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{m.label}</span>
  );
}

// ── Calorie ring ────────────────────────────────────────────
function CalorieRing({ eaten, goal, size = 116, stroke = 11, big = 26, animate = true }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(eaten / goal, 1);
  const off = circ * (1 - pct);
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <defs>
          <linearGradient id="calRingGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FF9F4B" />
            <stop offset="100%" stopColor="#F2542D" />
          </linearGradient>
        </defs>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--surface)" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="url(#calRingGrad)" strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={circ}
          strokeDashoffset={off}
          style={animate ? { '--ring-circ': circ, '--ring-off': off,
            animation: 'steadyRingDraw 1.1s cubic-bezier(.4,0,.2,1)' } : {}} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center' }}>
        <div className="tnum" style={{ fontSize: big, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{eaten.toLocaleString()}</div>
        <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 3, fontWeight: 500 }}>eaten</div>
      </div>
    </div>
  );
}

// ── Macro progress rows ─────────────────────────────────────
function MacroRows({ P, C, F }) {
  const rows = [
    { dot: 'var(--protein)', label: 'Protein', v: P, g: DATA.user.P },
    { dot: 'var(--carbs)', label: 'Carbs', v: C, g: DATA.user.C },
    { dot: 'var(--fat)', label: 'Fat', v: F, g: DATA.user.F },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
      {rows.map(r => (
        <div key={r.label}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.dot, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 500, flex: 1 }}>{r.label}</span>
            <span className="tnum" style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.v} / {r.g}g</span>
          </div>
          <div style={{ height: 5, borderRadius: 3, background: 'var(--surface)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: Math.min(r.v/r.g*100,100) + '%', background: r.dot, borderRadius: 3 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Section label ───────────────────────────────────────────
function SectionLabel({ children, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0 12px' }}>
      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: 'var(--text2)',
        textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{children}</span>
      <span style={{ flex: 1, height: 1, background: 'var(--border)', opacity: 0.55 }} />
      {action}
    </div>
  );
}

// ── Meal card ───────────────────────────────────────────────
function MealCard({ photo, meal, time, caption, macros, compact = false, onClick }) {
  return (
    <div onClick={onClick} style={{ background: 'var(--card)', borderRadius: 16, overflow: 'hidden',
      boxShadow: 'var(--card-shadow)', cursor: onClick ? 'pointer' : 'default',
      animation: 'steadyFade .5s' }}>
      {photo && (
        <div style={{ position: 'relative', width: '100%', height: compact ? 96 : 150, overflow: 'hidden' }}>
          <img src={photo} alt={meal} crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(253,246,236,0.08)' }} />
          {compact && (
            <span className="tnum" style={{ position: 'absolute', right: 10, bottom: 10, height: 28, display: 'inline-flex',
              alignItems: 'center', padding: '0 11px', borderRadius: 20, background: 'rgba(255,243,235,0.94)',
              color: 'var(--accent)', fontSize: 12.5, fontWeight: 700 }}>{macros[0].value} kcal</span>
          )}
        </div>
      )}
      <div style={{ padding: compact ? '11px 14px' : 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>{meal}</span>
          <span style={{ fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{time}</span>
        </div>
        {!compact && caption && (
          <div style={{ fontSize: 14, fontStyle: 'italic', color: 'var(--text2)', margin: '6px 0 11px' }}>{caption}</div>
        )}
        {!compact && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {macros.map((m, i) => <MacroChip key={i} kind={m.kind} value={m.value} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Unified home feed (logs + coach chat, chronological) ────
function buildFeed(dinner, extra = []) {
  const base = [
    { type: 'coach', t: '8:02 am', body: "Good morning! ☀️ What did you have for breakfast?" },
    { type: 'log', t: '8:12 am', meal: 'Breakfast', name: 'Oatmeal with Banana', qty: '240 g',
      photo: FOOD.oatmeal, kcal: 420, C: 78, P: 12, F: 9 },
    { type: 'me', t: '12:30 pm', body: "What should I eat to hit my protein goal today?" },
    { type: 'coach', t: '12:31 pm', body: "You're at 12g protein so far. A grilled chicken breast adds ~42g and still fits your calorie budget 🎯" },
    { type: 'log', t: '12:34 pm', meal: 'Lunch', name: 'Grilled Chicken', qty: '150 g',
      photo: FOOD.chicken, kcal: 480, C: 52, P: 42, F: 10 },
    { type: 'log', t: '3:45 pm', meal: 'Snack', name: 'Greek Yogurt & Berries', qty: '170 g',
      photo: FOOD.yogurt, kcal: 340, C: 48, P: 24, F: 8 },
    { type: 'coach', t: '3:47 pm', body: "Great protein day so far 💪 You've got 610 kcal left — enough for a solid dinner." },
  ];
  if (dinner) base.push(
    { type: 'log', t: '7:20 pm', meal: 'Dinner', name: 'Chicken Stir Fry', qty: '320 g',
      photo: FOOD.pasta, kcal: 540, C: 35, P: 38, F: 16 },
    { type: 'coach', t: '7:21 pm', body: "Nicely balanced plate 🥘 You finished the day right on target." },
  );
  return [...base, ...extra];
}

const MEAL_TINT = {
  Breakfast: '#FF9F1C', Lunch: '#2FB67A', Snack: '#2F6FED', Dinner: '#9B51E0',
};

// Previously-logged / saved foods for the bookmark sheet
const SAVED = [
  { name: 'Oatmeal with Banana', qty: '240 g', photo: FOOD.oatmeal, meal: 'Breakfast', kcal: 420, C: 78, P: 12, F: 9 },
  { name: 'Grilled Chicken', qty: '150 g', photo: FOOD.chicken, meal: 'Lunch', kcal: 480, C: 52, P: 42, F: 10 },
  { name: 'Greek Yogurt & Berries', qty: '170 g', photo: FOOD.yogurt, meal: 'Snack', kcal: 340, C: 48, P: 24, F: 8 },
  { name: 'Chicken Stir Fry', qty: '320 g', photo: FOOD.pasta, meal: 'Dinner', kcal: 540, C: 35, P: 38, F: 16 },
  { name: 'Protein Smoothie', qty: '300 ml', photo: FOOD.bowl, meal: 'Snack', kcal: 260, C: 30, P: 25, F: 5 },
];

// ── Date metadata for the home day-picker (key = 'Jun N') ───
const TODAY_KEY = 'Jun 12';
const DAY_META = {
  'Jun 12': { wd: 'Thursday',  label: 'June 12' },
  'Jun 11': { wd: 'Wednesday', label: 'June 11' },
  'Jun 10': { wd: 'Tuesday',   label: 'June 10' },
  'Jun 9':  { wd: 'Monday',    label: 'June 9' },
};

// ── Saved per-day feeds (logs + coach conversations) ────────
// 'Jun 12' (today) is built live by buildFeed(); past days are stored here.
const DAY_FEEDS = {
  'Jun 11': [
    { type: 'coach', t: '8:05 am', body: "Morning! \u2600\ufe0f Ready to log breakfast?" },
    { type: 'log', t: '8:22 am', meal: 'Breakfast', name: 'Avocado Toast', qty: '180 g', photo: FOOD.bowl, kcal: 460, C: 60, P: 18, F: 16 },
    { type: 'me', t: '1:05 pm', body: "Ate out for lunch \u2014 a big pasta." },
    { type: 'coach', t: '1:06 pm', body: "No problem \ud83d\ude42 I'll log a generous portion. That puts you near budget, so let's keep dinner a little lighter." },
    { type: 'log', t: '1:12 pm', meal: 'Lunch', name: 'Pasta Primavera', qty: '350 g', photo: FOOD.pasta, kcal: 740, C: 95, P: 40, F: 22 },
    { type: 'log', t: '7:34 pm', meal: 'Dinner', name: 'Chicken & Greens', qty: '300 g', photo: FOOD.chicken, kcal: 720, C: 70, P: 60, F: 26 },
    { type: 'coach', t: '7:35 pm', body: "That's 1,920 kcal \u2014 a touch over your 1,850 goal, but a strong protein day. Tomorrow's a fresh start \ud83d\udcaa" },
  ],
  'Jun 10': [
    { type: 'coach', t: '8:10 am', body: "Good morning! What's for breakfast today?" },
    { type: 'log', t: '8:18 am', meal: 'Breakfast', name: 'Oatmeal with Banana', qty: '240 g', photo: FOOD.oatmeal, kcal: 420, C: 50, P: 28, F: 12 },
    { type: 'log', t: '12:40 pm', meal: 'Lunch', name: 'Grilled Chicken Bowl', qty: '320 g', photo: FOOD.chicken, kcal: 560, C: 58, P: 48, F: 18 },
    { type: 'me', t: '4:00 pm', body: "Feeling snacky \u2014 what's a good option?" },
    { type: 'coach', t: '4:01 pm', body: "A Greek yogurt keeps you on track \u2014 high protein, ~320 kcal, and you'll still have room for dinner \ud83c\udfaf" },
    { type: 'log', t: '4:05 pm', meal: 'Snack', name: 'Greek Yogurt & Berries', qty: '170 g', photo: FOOD.yogurt, kcal: 320, C: 20, P: 18, F: 8 },
    { type: 'log', t: '7:25 pm', meal: 'Dinner', name: 'Chicken Stir Fry', qty: '300 g', photo: FOOD.pasta, kcal: 480, C: 44, P: 34, F: 14 },
    { type: 'coach', t: '7:26 pm', body: "Perfect \u2014 1,780 kcal, right on goal. Great consistency! \ud83c\udf1f" },
  ],
  'Jun 9': [
    { type: 'coach', t: '8:00 am', body: "New week, fresh start! \u2600\ufe0f Let's log breakfast." },
    { type: 'log', t: '8:15 am', meal: 'Breakfast', name: 'Veggie Omelette', qty: '220 g', photo: FOOD.bowl, kcal: 450, C: 55, P: 30, F: 13 },
    { type: 'log', t: '12:30 pm', meal: 'Lunch', name: 'Grilled Chicken', qty: '200 g', photo: FOOD.chicken, kcal: 600, C: 62, P: 50, F: 20 },
    { type: 'log', t: '3:30 pm', meal: 'Snack', name: 'Protein Smoothie', qty: '300 ml', photo: FOOD.bowl, kcal: 240, C: 16, P: 14, F: 6 },
    { type: 'me', t: '7:00 pm', body: "What should dinner be to finish on goal?" },
    { type: 'coach', t: '7:01 pm', body: "You've got ~540 kcal left. A chicken stir fry fits perfectly and tops up your protein \ud83c\udfaf" },
    { type: 'log', t: '7:20 pm', meal: 'Dinner', name: 'Chicken Stir Fry', qty: '320 g', photo: FOOD.pasta, kcal: 540, C: 45, P: 38, F: 16 },
    { type: 'coach', t: '7:21 pm', body: "1,830 kcal \u2014 bang on goal. Strong start to the week! \ud83d\udcaa" },
  ],
};

// ── Rich food-log card (reference-style 4-macro breakdown) ──
function LogCard({ e, onEdit }) {
  const cols = [
    { label: 'Calories', val: e.kcal, unit: '', pct: Math.round(e.kcal / DATA.user.kcal * 100), c: 'var(--accent)' },
    { label: 'Carbs', val: e.C, unit: 'g', pct: Math.round(e.C / DATA.user.C * 100), c: 'var(--carbs)' },
    { label: 'Protein', val: e.P, unit: 'g', pct: Math.round(e.P / DATA.user.P * 100), c: 'var(--protein)' },
    { label: 'Fat', val: e.F, unit: 'g', pct: Math.round(e.F / DATA.user.F * 100), c: 'var(--fat)' },
  ];
  return (
    <div style={{ background: 'var(--card)', borderRadius: 16, boxShadow: 'var(--card-shadow)',
      overflow: 'hidden', animation: 'steadyFade .45s' }}>
      {/* title row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px 12px' }}>
        {e.photo && <img src={e.photo} alt="" crossOrigin="anonymous"
          style={{ width: 46, height: 46, borderRadius: 11, objectFit: 'cover', flexShrink: 0 }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15.5, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {e.name} <span style={{ color: 'var(--muted)', fontWeight: 500 }}>({e.qty})</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', height: 19, padding: '0 8px',
              borderRadius: 6, background: (MEAL_TINT[e.meal] || 'var(--accent)') + '22',
              color: MEAL_TINT[e.meal] || 'var(--accent)', fontSize: 11, fontWeight: 700,
              letterSpacing: 0.2, whiteSpace: 'nowrap' }}>{e.meal}</span>
            <span style={{ fontSize: 12.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{e.t}</span>
          </div>
        </div>
        <button onClick={onEdit} style={{ width: 30, height: 30, borderRadius: 8, display: 'flex',
          alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', flexShrink: 0 }}>
          {Icon.pencil('var(--muted)')}
        </button>
      </div>
      <div style={{ height: 1, background: 'var(--surface)' }} />
      {/* macro grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', columnGap: 10, padding: '12px 14px 14px' }}>
        {cols.map((c, i) => (
          <div key={i}>
            <div style={{ fontSize: 11.5, color: 'var(--text2)', fontWeight: 500 }}>{c.label}</div>
            <div className="tnum" style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', margin: '2px 0 7px' }}>
              {c.val}{c.unit}</div>
            <div style={{ height: 4, borderRadius: 2, background: 'var(--surface)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: Math.min(c.pct, 100) + '%', background: c.c, borderRadius: 2 }} />
            </div>
            <div className="tnum" style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 4 }}>{c.pct}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Feed chat bubble (coach / me) ───────────────────────────
function FeedChat({ e }) {
  const me = e.type === 'me';
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end',
      flexDirection: me ? 'row-reverse' : 'row', animation: 'steadyFade .4s' }}>
      {!me && <SteadyAvatar size={30} />}
      <div style={{ maxWidth: '82%', padding: '10px 13px', borderRadius: 16, fontSize: 14.5, lineHeight: 1.42,
        background: me ? 'var(--accent-soft)' : 'var(--card)', color: 'var(--text)',
        boxShadow: me ? 'none' : 'var(--card-shadow)',
        border: me ? '1px solid var(--accent-pressed)' : 'none',
        borderBottomRightRadius: me ? 4 : 16, borderBottomLeftRadius: me ? 16 : 4 }}>{e.body}</div>
    </div>
  );
}

// ── Tab bar ─────────────────────────────────────────────────
function TabBar({ active, go }) {
  const tabs = [
    { id: 'home', label: 'Home', icon: Icon.home },
    { id: 'camera', label: '', icon: null },
    { id: 'progress', label: 'Progress', icon: Icon.chart },
    { id: 'profile', label: 'Me', icon: Icon.user },
  ];
  return (
    <div style={{ position: 'relative', height: TAB_H, boxSizing: 'border-box', background: 'var(--card)',
      borderTop: '1px solid #E5E5EA', paddingBottom: 22, paddingTop: 8 }}>
      {/* center camera FAB */}
      <button onClick={() => go('camera')} style={{ position: 'absolute', top: -22, left: '50%',
        transform: 'translateX(-50%)', width: 58, height: 58, borderRadius: '50%',
        background: 'linear-gradient(160deg, #FF8A4B, #F2542D)', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 8px 20px rgba(242,84,45,0.45)', border: '3px solid var(--card)' }}>
        {Icon.camera('#fff')}
      </button>
      <div style={{ display: 'flex', alignItems: 'flex-start', padding: '0 6px' }}>
        {tabs.map(t => {
          if (!t.icon) return <div key="c" style={{ flex: 1 }} />;
          const on = active === t.id;
          return (
            <button key={t.id} onClick={() => go(t.id)} style={{ flex: 1, display: 'flex',
              flexDirection: 'column', alignItems: 'center', gap: 3,
              color: on ? 'var(--accent)' : 'var(--muted)', padding: '2px 0' }}>
              {t.icon(on)}
              <span style={{ fontSize: 10.5, fontWeight: on ? 700 : 500 }}>{t.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Progress dots ───────────────────────────────────────────
function ProgressDots({ total, current }) {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', height: 16 }}>
      {Array.from({ length: total }).map((_, i) => {
        const done = i < current;
        return <span key={i} style={{ width: done ? 9 : 8, height: done ? 9 : 8, borderRadius: '50%',
          background: done ? 'var(--accent)' : 'transparent',
          border: done ? 'none' : '1.5px solid var(--accent-pressed)', transition: 'all .3s' }} />;
      })}
    </div>
  );
}

// ── Chat bubble ─────────────────────────────────────────────
function Bubble({ from, children }) {
  const me = from === 'me';
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end',
      flexDirection: me ? 'row-reverse' : 'row', maxWidth: '100%', animation: 'steadyFade .4s' }}>
      {!me && <SteadyAvatar size={32} />}
      <div style={{ maxWidth: '80%', padding: '11px 14px', borderRadius: 18,
        background: me ? 'var(--accent-soft)' : 'var(--surface)',
        border: me ? '1px solid var(--accent-pressed)' : 'none',
        color: 'var(--text)', fontSize: 15, lineHeight: 1.42,
        borderBottomRightRadius: me ? 5 : 18, borderBottomLeftRadius: me ? 18 : 5 }}>{children}</div>
    </div>
  );
}

Object.assign(window, {
  FOOD, DATA, Icon, STATUS_PAD, DEVICE_H, TAB_H, Screen, Scroll, Btn, SteadyAvatar, MacroChip,
  CalorieRing, MacroRows, SectionLabel, MealCard, TabBar, ProgressDots, Bubble,
  buildFeed, LogCard, FeedChat, MEAL_TINT, SAVED, DAY_META, DAY_FEEDS, TODAY_KEY,
});
