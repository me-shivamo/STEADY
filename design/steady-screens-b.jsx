// ─────────────────────────────────────────────────────────────
// STEADY — Screens B: Home dashboard · Camera
// ─────────────────────────────────────────────────────────────

// Screen 5 — Home / Dashboard (unified feed: logs + coach chat)
function HomeScreen({ go, tw }) {
  const [dinner, setDinner] = React.useState(tw.dinnerLogged);
  React.useEffect(() => setDinner(tw.dinnerLogged), [tw.dinnerLogged]);
  const [mode, setMode] = React.useState('all'); // 'logs' | 'all'
  const [extra, setExtra] = React.useState([]);
  const [text, setText] = React.useState('');
  const [drawer, setDrawer] = React.useState(false);
  const [sheet, setSheet] = React.useState(false);
  const [date, setDate] = React.useState(TODAY_KEY);
  const [picker, setPicker] = React.useState(false);
  const feedRef = React.useRef(null);

  const isToday = date === TODAY_KEY;
  const meta = DAY_META[date] || DAY_META[TODAY_KEY];
  const feed = isToday ? buildFeed(dinner, extra) : (DAY_FEEDS[date] || []);
  React.useEffect(() => { const el = feedRef.current; if (el) el.scrollTop = 0; }, [date]);
  const logs = feed.filter(e => e.type === 'log');
  const totals = logs.reduce((a, e) => ({ kcal: a.kcal + e.kcal, P: a.P + e.P, C: a.C + e.C, F: a.F + e.F }),
    { kcal: 0, P: 0, C: 0, F: 0 });
  const remaining = DATA.user.kcal - totals.kcal;
  const shown = mode === 'logs' ? logs : feed;

  const scrollEnd = () => setTimeout(() => { const el = feedRef.current; if (el) el.scrollTop = el.scrollHeight; }, 80);

  const send = () => {
    const v = text.trim(); if (!v) return;
    setText(''); setMode('all');
    setExtra(x => [...x, { type: 'me', t: 'now', body: v }]);
    setTimeout(() => setExtra(x => [...x, { type: 'coach', t: 'now',
      body: "Got it — I've noted that. You have " + remaining.toLocaleString() + " kcal left for today 👍" }]), 600);
    scrollEnd();
  };

  const addSaved = (f) => {
    setSheet(false);
    setExtra(x => [...x, { type: 'log', t: 'now', meal: f.meal, name: f.name, qty: f.qty,
      photo: f.photo, kcal: f.kcal, C: f.C, P: f.P, F: f.F }]);
    scrollEnd();
  };

  // header height: STATUS_PAD (56) + top bar (52) = 108; composer: 68
  const feedH = DEVICE_H - STATUS_PAD - 52 - 68;

  return (
    <Screen scroll={false} style={{ display: 'block', position: 'relative' }}>

      {/* ── top bar: hamburger | date (tappable) | streak ── */}
      <div style={{ height: 52, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={() => setDrawer(true)} style={{ width: 38, height: 38, borderRadius: 10, marginLeft: -4,
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)' }}>
          {Icon.menu('var(--text2)')}
        </button>

        <button onClick={() => setPicker(true)} style={{ flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'flex-start', padding: 0, background: 'transparent', gap: 1 }}>
          <span style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 500, letterSpacing: 0.2 }}>{meta.wd}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', letterSpacing: -0.2, lineHeight: 1 }}>{meta.label}</span>
            <span style={{ display: 'flex', color: 'var(--muted)', transform: 'translateY(1px)' }}>{Icon.calChev('var(--muted)')}</span>
          </span>
        </button>

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 28, padding: '0 10px',
          borderRadius: 20, background: 'var(--surface)', color: 'var(--text2)', fontSize: 13, fontWeight: 600 }}>
          🔥 {DATA.user.streak}
        </div>
      </div>

      {/* ── scrollable feed ── */}
      <div ref={feedRef} className="noscroll" style={{ height: feedH, overflowY: 'auto', padding: '0 16px 16px' }}>

        {/* calorie summary card */}
        <div style={{ background: 'var(--card)', borderRadius: 18, boxShadow: 'var(--card-shadow-lg)',
          padding: '18px 20px', display: 'flex', gap: 18, alignItems: 'center', marginBottom: 14 }}>
          <CalorieRing eaten={totals.kcal} goal={DATA.user.kcal} size={108} stroke={10} big={24} />
          <div style={{ flex: 1 }}>
            <div className="tnum" style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
              {remaining >= 0
                ? <>{remaining.toLocaleString()} <span style={{ color: 'var(--text2)', fontWeight: 400, fontSize: 13 }}>remaining</span></>
                : <>{Math.abs(remaining).toLocaleString()} <span style={{ color: 'var(--carbs)', fontWeight: 400, fontSize: 13 }}>over goal</span></>}
            </div>
            <MacroRows P={totals.P} C={totals.C} F={totals.F} />
          </div>
        </div>

        {/* feed mode toggle — slim, low-weight */}
        <div style={{ display: 'flex', background: 'var(--surface)', borderRadius: 10, padding: 3, marginBottom: 12 }}>
          {[['logs', 'Food log'], ['all', '✦ Log + Coach']].map(([id, label]) => {
            const on = mode === id;
            return (
              <button key={id} onClick={() => setMode(id)} style={{ flex: 1, height: 30, borderRadius: 7,
                fontSize: 12.5, fontWeight: on ? 600 : 500,
                color: on ? 'var(--text)' : 'var(--muted)',
                background: on ? 'var(--card)' : 'transparent',
                boxShadow: on ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all .15s' }}>
                {label}
              </button>
            );
          })}
        </div>

        {/* unified timeline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shown.map((e, i) => e.type === 'log'
            ? <LogCard key={i} e={e} onEdit={() => {}} />
            : <FeedChat key={i} e={e} />)}

          {isToday && !dinner && (
            <button onClick={() => setDinner(true)} style={{ height: 52, borderRadius: 14,
              border: '1.5px dashed var(--border)', background: 'transparent', display: 'flex',
              alignItems: 'center', justifyContent: 'center', gap: 7,
              color: 'var(--muted)', fontSize: 14, fontWeight: 500 }}>
              {Icon.plus('var(--muted)', 16)} Log dinner
            </button>
          )}
        </div>
      </div>

      {/* ── composer / read-only footer ── */}
      {isToday ? (
        <div style={{ height: 68, boxSizing: 'border-box', background: 'var(--card)',
          borderTop: '1px solid var(--border)', padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* saved foods — small, secondary icon */}
          <button onClick={() => setSheet(true)} style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
            {Icon.bookmark('var(--muted)')}
          </button>
          {/* text input */}
          <input value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
            placeholder="Log food or ask STEADY…"
            style={{ flex: 1, height: 42, borderRadius: 21, background: 'var(--surface)',
              border: 'none', padding: '0 16px', fontSize: 14, color: 'var(--text)', outline: 'none', minWidth: 0 }} />
          {/* camera — primary action */}
          <button onClick={() => go('camera')} style={{ width: 42, height: 42, flexShrink: 0, borderRadius: '50%',
            background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.18)' }}>
            {Icon.camera('#fff')}
          </button>
        </div>
      ) : (
        <div style={{ height: 68, boxSizing: 'border-box', background: 'var(--card)',
          borderTop: '1px solid var(--border)', padding: '10px 16px',
          display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ display: 'flex', color: 'var(--muted)' }}>{Icon.lock('var(--muted)')}</span>
          <span style={{ flex: 1, fontSize: 13.5, color: 'var(--text2)' }}>
            Viewing <strong style={{ color: 'var(--text)' }}>{meta.label}</strong> · read-only
          </span>
          <button onClick={() => setDate(TODAY_KEY)} style={{ height: 36, padding: '0 14px', borderRadius: 18, flexShrink: 0,
            background: 'var(--accent)', color: '#fff', fontSize: 13.5, fontWeight: 600 }}>Today</button>
        </div>
      )}

      {/* overlays */}
      <NavDrawer open={drawer} close={() => setDrawer(false)} go={go} active="home" />
      <BookmarkSheet open={sheet} close={() => setSheet(false)} onAdd={addSaved} />
      <DatePicker open={picker} close={() => setPicker(false)} value={date} onPick={(d) => setDate(d)} />
    </Screen>
  );
}

// ── Slide-in navigation drawer ───────────────────────────────
function NavDrawer({ open, close, go, active }) {
  const items = [
    { id: 'home',     label: 'Home',     icon: Icon.home },
    { id: 'progress', label: 'Progress', icon: Icon.chart },
    { id: 'profile',  label: 'Me',       icon: Icon.user },
  ];
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 60, pointerEvents: open ? 'auto' : 'none' }}>
      {/* scrim */}
      <div onClick={close} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.42)',
        opacity: open ? 1 : 0, transition: 'opacity .28s' }} />
      {/* panel */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 296, background: 'var(--bg)',
        boxShadow: '8px 0 30px rgba(0,0,0,0.22)', transform: open ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform .3s cubic-bezier(.4,0,.2,1)', display: 'flex', flexDirection: 'column',
        paddingTop: STATUS_PAD + 8 }}>
        {/* profile header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '4px 22px 20px' }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--surface)', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', fontSize: 22, fontWeight: 700 }}>S</div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>Shivam</div>
            <div className="tnum" style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>1,850 kcal/day · 🔥 7</div>
          </div>
        </div>
        <div style={{ height: 1, background: 'var(--border)', opacity: 0.6, margin: '0 22px 12px' }} />
        {/* nav items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
          {items.map(it => {
            const on = active === it.id;
            return (
              <button key={it.id} onClick={() => { close(); if (!on) setTimeout(() => go(it.id), 180); }}
                style={{ display: 'flex', alignItems: 'center', gap: 14, height: 52, padding: '0 14px', borderRadius: 12,
                  background: on ? 'var(--accent-soft)' : 'transparent', color: on ? 'var(--accent)' : 'var(--text)', textAlign: 'left' }}>
                <span style={{ display: 'flex', color: on ? 'var(--accent)' : 'var(--text2)' }}>{it.icon(on)}</span>
                <span style={{ fontSize: 16, fontWeight: on ? 700 : 600 }}>{it.label}</span>
              </button>
            );
          })}
        </div>
        <div style={{ flex: 1 }} />
        <button style={{ display: 'flex', alignItems: 'center', gap: 14, height: 52, margin: '0 14px 22px',
          padding: '0 14px', borderRadius: 12, color: 'var(--text2)', textAlign: 'left' }}>
          <span style={{ width: 24, textAlign: 'center', fontSize: 18 }}>⚙️</span>
          <span style={{ fontSize: 16, fontWeight: 600 }}>Settings</span>
        </button>
      </div>
    </div>
  );
}

// ── Bottom sheet: saved / previously-logged foods (bookmark) ─
function BookmarkSheet({ open, close, onAdd }) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 60, pointerEvents: open ? 'auto' : 'none' }}>
      <div onClick={close} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.42)',
        opacity: open ? 1 : 0, transition: 'opacity .28s' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: 'var(--bg)',
        borderTopLeftRadius: 24, borderTopRightRadius: 24, boxShadow: '0 -8px 30px rgba(0,0,0,0.22)',
        transform: open ? 'translateY(0)' : 'translateY(100%)', transition: 'transform .32s cubic-bezier(.4,0,.2,1)',
        maxHeight: '74%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <span style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 22px 12px' }}>
          <span style={{ display: 'flex', color: 'var(--accent)' }}>{Icon.bookmark('var(--accent)', true)}</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Saved foods</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap' }}>Tap to log</span>
        </div>
        <div className="noscroll" style={{ overflowY: 'auto', padding: '0 16px 28px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {SAVED.map((f, i) => (
              <button key={i} onClick={() => onAdd(f)} style={{ display: 'flex', alignItems: 'center', gap: 13,
                padding: 10, borderRadius: 14, background: 'var(--card)', boxShadow: 'var(--card-shadow)', textAlign: 'left' }}>
                <img src={f.photo} alt="" crossOrigin="anonymous" style={{ width: 50, height: 50, borderRadius: 11, objectFit: 'cover', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap',
                    overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</div>
                  <div className="tnum" style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 2 }}>
                    {f.qty} · {f.kcal} kcal · P{f.P} C{f.C} F{f.F}</div>
                </div>
                <span style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, background: 'var(--accent-soft)',
                  color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Icon.plus('var(--accent)', 20)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Date picker: pick a past day to review its logs + chat ──
function DatePicker({ open, close, value, onPick }) {
  const week = DATA.weeks[0].days; // this week (Mon–Sun)
  const dotColor = { ok: 'var(--success)', over: 'var(--carbs)', miss: 'var(--error)' };
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 60, pointerEvents: open ? 'auto' : 'none' }}>
      <div onClick={close} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.42)',
        opacity: open ? 1 : 0, transition: 'opacity .28s' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: 'var(--bg)',
        borderTopLeftRadius: 24, borderTopRightRadius: 24, boxShadow: '0 -8px 30px rgba(0,0,0,0.22)',
        transform: open ? 'translateY(0)' : 'translateY(100%)', transition: 'transform .32s cubic-bezier(.4,0,.2,1)',
        display: 'flex', flexDirection: 'column', paddingBottom: 26 }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <span style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, padding: '8px 22px 4px' }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Jump to a day</span>
          <span style={{ flex: 1 }} />
          <span className="tnum" style={{ fontSize: 13.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{DATA.weeks[0].range}</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text2)', margin: '0 22px 14px', lineHeight: 1.45 }}>
          Review the meals and coach chat from any earlier day this week.
        </p>
        <div style={{ display: 'flex', padding: '0 12px' }}>
          {week.map((w, i) => {
            const key = 'Jun ' + w.n;
            const future = w.st === 'future';
            const today = w.st === 'today';
            const on = value === key;
            return (
              <button key={i} disabled={future} onClick={() => { onPick(key); close(); }}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
                  padding: '8px 0', borderRadius: 14, background: on ? 'var(--accent-soft)' : 'transparent',
                  opacity: future ? 0.32 : 1, cursor: future ? 'default' : 'pointer' }}>
                <span style={{ fontSize: 12, color: on ? 'var(--accent)' : 'var(--muted)', fontWeight: 600 }}>{w.d}</span>
                <span className="tnum" style={{ width: 34, height: 34, borderRadius: '50%', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', fontSize: 15.5,
                  fontWeight: (on || today) ? 700 : 600,
                  background: on ? 'var(--accent)' : today ? 'var(--card)' : 'transparent',
                  border: today && !on ? '1.5px solid var(--accent-pressed)' : 'none',
                  color: on ? '#fff' : today ? 'var(--accent)' : 'var(--text)' }}>{w.n}</span>
                <span style={{ width: 6, height: 6, borderRadius: '50%',
                  background: (w.st && w.st !== 'today' && w.st !== 'future') ? dotColor[w.st] : 'transparent' }} />
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 14, fontSize: 11.5, color: 'var(--muted)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success)' }} /> On goal</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--carbs)' }} /> Over</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--error)' }} /> Missed</span>
        </div>
      </div>
    </div>
  );
}

// Screen 6 — Camera
function CameraScreen({ go }) {
  const [flash, setFlash] = React.useState(false);
  const [shot, setShot] = React.useState(false);
  return (
    <Screen pad={false} scroll={false} bg="#171210">
      {/* viewfinder backdrop */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        <img src={FOOD.bowl} alt="" crossOrigin="anonymous" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover', filter: 'brightness(.62) saturate(1.05)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 80% at 50% 45%, transparent 40%, rgba(0,0,0,0.55) 100%)' }} />
      </div>

      {/* top controls */}
      <div style={{ position: 'absolute', top: 60, left: 20, right: 20, display: 'flex', justifyContent: 'space-between', zIndex: 5 }}>
        <button onClick={() => go('home')} style={{ width: 44, height: 44, borderRadius: '50%',
          background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Icon.close('#fff')}</button>
        <button onClick={() => setFlash(f => !f)} style={{ width: 44, height: 44, borderRadius: '50%',
          background: flash ? 'rgba(255,255,255,0.95)' : 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Icon.flash(flash ? 'var(--accent)' : '#fff')}</button>
      </div>

      {/* framing box */}
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-58%)',
        width: 264, height: 264, borderRadius: 28, border: '1.5px dashed rgba(255,255,255,0.85)', zIndex: 4 }}>
        {[[0,0],[1,0],[0,1],[1,1]].map(([x,y],i)=>(
          <span key={i} style={{ position:'absolute', width:26, height:26,
            [x?'right':'left']:-2, [y?'bottom':'top']:-2,
            borderTop: y?'none':'3px solid #fff', borderBottom: y?'3px solid #fff':'none',
            borderLeft: x?'none':'3px solid #fff', borderRight: x?'3px solid #fff':'none',
            [`border${y?'Bottom':'Top'}${x?'Right':'Left'}Radius`]: 12 }} />
        ))}
      </div>
      <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, transform: 'translateY(96px)',
        textAlign: 'center', color: 'rgba(255,255,255,0.92)', fontSize: 15, fontWeight: 500, zIndex: 4,
        textShadow: '0 1px 6px rgba(0,0,0,0.5)' }}>
        {shot ? 'Analyzing your meal…' : 'Point at your meal'}
      </div>

      {/* bottom controls */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingBottom: 48, paddingTop: 40,
        background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.6))', zIndex: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 56 }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', overflow: 'hidden', border: '2px solid #fff' }}>
            <img src={FOOD.yogurt} alt="" crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <button onClick={() => { setShot(true); setTimeout(() => go('home'), 900); }}
            style={{ width: 76, height: 76, borderRadius: '50%', border: '4px solid #fff', background: 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ width: 58, height: 58, borderRadius: '50%', background: '#fff', transition: 'transform .15s',
              transform: shot ? 'scale(0.85)' : 'scale(1)' }} />
          </button>
          <button style={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Icon.flip('#fff')}</button>
        </div>
      </div>
    </Screen>
  );
}

Object.assign(window, { HomeScreen, CameraScreen });
