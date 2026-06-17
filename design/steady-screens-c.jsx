// ─────────────────────────────────────────────────────────────
// STEADY — Screens C: Progress · Profile
// ─────────────────────────────────────────────────────────────

// ── Weight line chart (SVG) ──
function WeightChart() {
  const W = 322, H = 168, padL = 6, padR = 6, padT = 14, padB = 26;
  const data = DATA.weight;
  const ws = data.map(d => d.w);
  const min = Math.min(...ws) - 0.3, max = Math.max(...ws) + 0.3;
  const x = i => padL + (i / (data.length - 1)) * (W - padL - padR);
  const y = w => padT + (1 - (w - min) / (max - min)) * (H - padT - padB);
  const pts = data.map((d, i) => [x(i), y(d.w)]);
  // smooth path
  let path = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i-1], [cx, cy] = pts[i];
    const mx = (px + cx) / 2;
    path += ` C ${mx} ${py}, ${mx} ${cy}, ${cx} ${cy}`;
  }
  const area = path + ` L ${pts[pts.length-1][0]} ${H-padB} L ${pts[0][0]} ${H-padB} Z`;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      <defs>
        <linearGradient id="wfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(242,84,45,0.20)" />
          <stop offset="100%" stopColor="rgba(242,84,45,0)" />
        </linearGradient>
      </defs>
      {[0,1,2,3].map(i => { const gy = padT + i*((H-padT-padB)/3);
        return <line key={i} x1={padL} y1={gy} x2={W-padR} y2={gy} stroke="var(--surface)" strokeWidth="1" />; })}
      <path d={area} fill="url(#wfill)" />
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
      {pts.map((p, i) => i === pts.length-1
        ? <circle key={i} cx={p[0]} cy={p[1]} r="5.5" fill="var(--accent)" stroke="#fff" strokeWidth="2.5" />
        : <circle key={i} cx={p[0]} cy={p[1]} r="2.5" fill="var(--accent)" opacity="0.5" />)}
      {data.map((d, i) => (i % 2 === 0 || i === data.length-1) &&
        <text key={i} x={x(i)} y={H-8} fontSize="11" fill="var(--muted)" textAnchor="middle" fontFamily="Inter">{d.d.replace('Jun ','')}</text>)}
      <text x={x(0)} y={y(83.1)-9} fontSize="11" fill="var(--text2)" textAnchor="start" fontFamily="Inter" fontWeight="600">83.1</text>
      <text x={x(6)} y={y(82.4)+16} fontSize="11" fill="var(--accent)" textAnchor="end" fontFamily="Inter" fontWeight="700">82.4</text>
    </svg>
  );
}

// ── status → label + color for a report day ──
const DAY_ST = {
  ok:     { label: 'On goal', col: 'var(--success)' },
  over:   { label: 'Over',    col: 'var(--carbs)' },
  today:  { label: 'Today',   col: 'var(--accent)' },
  miss:   { label: 'Missed',  col: 'var(--error)' },
  future: { label: '—',       col: 'var(--muted)' },
};

// ── One day's full report row (calories bar + macros) ──
function DayReport({ d, goal, last }) {
  const st = DAY_ST[d.st] || DAY_ST.ok;
  const logged = d.kcal != null && d.st !== 'miss' && d.st !== 'future';
  const maxC = 2200;
  const macros = [['P', d.P, goal.P, 'var(--protein)'], ['C', d.C, goal.C, 'var(--carbs)'], ['F', d.F, goal.F, 'var(--fat)']];
  return (
    <div style={{ padding: '13px 0', borderBottom: last ? 'none' : '1px solid var(--surface)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 9 }}>
        <span style={{ fontSize: 14.5, fontWeight: 700, color: d.st === 'future' ? 'var(--muted)' : 'var(--text)' }}>{d.d}</span>
        <span className="tnum" style={{ fontSize: 12.5, color: 'var(--muted)' }}>Jun {d.n}</span>
        <span style={{ flex: 1 }} />
        {logged
          ? <span className="tnum" style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text)' }}>
              {d.kcal.toLocaleString()} <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--text2)' }}>kcal</span></span>
          : <span style={{ fontSize: 12.5, fontWeight: 600, color: st.col }}>{st.label}</span>}
      </div>
      {/* calorie bar */}
      <div style={{ height: 8, borderRadius: 4, background: 'var(--surface)', overflow: 'hidden' }}>
        {logged && <div style={{ height: '100%', width: Math.min(d.kcal / maxC * 100, 100) + '%',
          background: st.col, borderRadius: 4, transition: 'width .4s' }} />}
      </div>
      {/* macro counts */}
      {logged && (
        <div style={{ display: 'flex', gap: 7, marginTop: 9, flexWrap: 'wrap' }}>
          {macros.map(([l, v, g, c]) => (
            <span key={l} className="tnum" style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
              height: 22, padding: '0 9px', borderRadius: 7, background: c + '1A', color: c, fontSize: 12, fontWeight: 700 }}>
              <span style={{ opacity: 0.75 }}>{l}</span>{v}g
            </span>
          ))}
          {d.st !== 'today' && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 22, padding: '0 9px',
              borderRadius: 7, fontSize: 11.5, fontWeight: 600, color: st.col, marginLeft: 'auto' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.col }} />{st.label}</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Weekly average macro bar ──
function MacroBar({ label, v, g, c, unit = 'g' }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{label}</span>
        <span className="tnum" style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 600 }}>{v.toLocaleString()} / {g.toLocaleString()}{unit} avg</span>
      </div>
      <div style={{ height: 9, borderRadius: 5, background: 'var(--surface)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: Math.min(v / g * 100, 100) + '%', background: c, borderRadius: 5, transition: 'width .4s' }} />
      </div>
    </div>
  );
}

// Screen 9 — Progress (detailed weekly report)
function ProgressScreen({ go }) {
  const [wk, setWk] = React.useState(0); // 0 = this week, 1 = last week
  const week = DATA.weeks[wk];
  const goal = DATA.user;
  const days = week.days;
  const elapsed = days.filter(d => d.st !== 'future');
  const logged = days.filter(d => d.kcal != null && d.st !== 'miss' && d.st !== 'future');
  const onGoal = days.filter(d => d.st === 'ok' || d.st === 'today').length;
  const missed = days.filter(d => d.st === 'miss').length;
  const avg = k => logged.length ? Math.round(logged.reduce((a, d) => a + (d[k] || 0), 0) / logged.length) : 0;
  const avgKcal = avg('kcal'), avgP = avg('P'), avgC = avg('C'), avgF = avg('F');

  const summary = [
    { v: avgKcal.toLocaleString(), l: 'Avg cal / day' },
    { v: onGoal + '/' + elapsed.length, l: 'Days on goal' },
    { v: logged.length + '/' + elapsed.length, l: 'Days logged' },
  ];

  return (
    <Screen>
      <div style={{ padding: '0 16px 6px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => go('profile')} style={{ width: 40, height: 40, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface)', color: 'var(--text)' }}>{Icon.back()}</button>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>Weekly report</h1>
      </div>

      <Scroll style={{ padding: '8px 20px 0' }} pb={24}>
        {/* week navigator */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--card)', borderRadius: 14, boxShadow: 'var(--card-shadow)', padding: '8px 8px', marginBottom: 16 }}>
          <button onClick={() => setWk(w => Math.min(w + 1, DATA.weeks.length - 1))} disabled={wk >= DATA.weeks.length - 1}
            style={{ width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: wk >= DATA.weeks.length - 1 ? 'var(--border)' : 'var(--accent)' }}>{Icon.chevL(wk >= DATA.weeks.length - 1 ? 'var(--border)' : 'var(--accent)')}</button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--text)' }}>{week.label}</div>
            <div className="tnum" style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>{week.range}</div>
          </div>
          <button onClick={() => setWk(w => Math.max(w - 1, 0))} disabled={wk <= 0}
            style={{ width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: wk <= 0 ? 'var(--border)' : 'var(--accent)' }}>{Icon.chevR(wk <= 0 ? 'var(--border)' : 'var(--accent)')}</button>
        </div>

        {/* summary stats */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
          {summary.map((s, i) => (
            <div key={i} style={{ flex: 1, background: 'var(--card)', borderRadius: 12, boxShadow: 'var(--card-shadow)',
              padding: '14px 6px', textAlign: 'center' }}>
              <div className="tnum" style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)' }}>{s.v}</div>
              <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4, lineHeight: 1.25 }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* daily breakdown */}
        <SectionLabel>Daily breakdown</SectionLabel>
        <div style={{ background: 'var(--card)', borderRadius: 16, boxShadow: 'var(--card-shadow)', padding: '4px 16px', marginBottom: 22 }}>
          {days.map((d, i) => <DayReport key={i} d={d} goal={goal} last={i === days.length - 1} />)}
        </div>

        {/* weekly averages */}
        <SectionLabel>Weekly averages</SectionLabel>
        <div style={{ background: 'var(--card)', borderRadius: 16, boxShadow: 'var(--card-shadow)', padding: 20, marginBottom: 22 }}>
          <MacroBar label="Calories" v={avgKcal} g={goal.kcal} c="var(--accent)" unit="" />
          <MacroBar label="Protein" v={avgP} g={goal.P} c="var(--protein)" />
          <MacroBar label="Carbs" v={avgC} g={goal.C} c="var(--carbs)" />
          <MacroBar label="Fat" v={avgF} g={goal.F} c="var(--fat)" />
          <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', marginTop: 4, padding: '12px 12px 0', borderTop: '1px solid var(--surface)' }}>
            <span style={{ display: 'flex', color: 'var(--accent)', flexShrink: 0, marginTop: 1 }}>{Icon.spark(true)}</span>
            <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5, margin: 0 }}>
              {avgP < goal.P
                ? "You're hitting carbs consistently but averaging below your protein goal. Adding a protein source to breakfast would close the gap. 💪"
                : "Strong, balanced week — calories and macros are tracking right where they should be. Keep it up! 🌟"}
            </p>
          </div>
        </div>

        {/* weight trend */}
        <SectionLabel>Weight trend</SectionLabel>
        <div style={{ background: 'var(--card)', borderRadius: 16, boxShadow: 'var(--card-shadow)', padding: '16px 12px 8px', marginBottom: 4 }}>
          <WeightChart />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 6px 4px' }}>
            <div style={{ display: 'flex', gap: 18 }}>
              <Stat label="Start" value="83.1" unit="kg" />
              <Stat label="Now" value="82.4" unit="kg" accent />
            </div>
            <div className="tnum" style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--success)', whiteSpace: 'nowrap' }}>Lost 0.7 kg 🎉</div>
          </div>
        </div>
      </Scroll>

      {/* log weight FAB */}
      <div style={{ position: 'sticky', bottom: 0, height: 0, zIndex: 10 }}>
        <button style={{ position: 'absolute', right: 20, bottom: 30, width: 56, height: 56, borderRadius: '50%',
          background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 20px rgba(242,84,45,0.4)' }}>{Icon.plus('#fff', 26)}</button>
      </div>
    </Screen>
  );
}

function Stat({ label, value, unit, accent }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 2 }}>{label}</div>
      <div className="tnum" style={{ fontSize: 18, fontWeight: 700, color: accent ? 'var(--accent)' : 'var(--text)' }}>
        {value}<span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)' }}> {unit}</span></div>
    </div>
  );
}

// Screen 10 — Profile / Me
function ProfileScreen({ go }) {
  const menu = [
    { icon: '📊', label: 'Progress Charts', to: 'progress' },
    { icon: '💪', label: 'Body Measurements' },
    { icon: '🥗', label: 'My Foods', badge: 'Learned 12 foods' },
    { icon: '⚙️', label: 'Settings' },
    { icon: '🔔', label: 'Reminders' },
  ];
  return (
    <Screen>
      <Scroll style={{ padding: '0 20px' }} pb={20}>
        {/* header card */}
        <div style={{ background: 'var(--card)', borderRadius: 20, boxShadow: 'var(--card-shadow-lg)', padding: 20,
          display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--surface)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)',
            fontSize: 28, fontWeight: 700, flexShrink: 0 }}>S</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>Shivam</div>
            <div className="tnum" style={{ fontSize: 14, color: 'var(--text2)', margin: '3px 0 8px' }}>Losing weight · 1,850 kcal/day</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 26, padding: '0 10px',
                borderRadius: 20, background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' }}>🔥 7 day streak</span>
              <span style={{ fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap' }}>Best: 23 days</span>
            </div>
          </div>
        </div>

        {/* quick stats */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          {[{v:'1,780',l:'Avg cal/day'},{v:'6/7',l:'Days logged'},{v:'5/7',l:'On goal'}].map((s,i) => (
            <div key={i} style={{ flex: 1, background: 'var(--card)', borderRadius: 12, boxShadow: 'var(--card-shadow)',
              padding: '14px 8px', textAlign: 'center' }}>
              <div className="tnum" style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)' }}>{s.v}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 3 }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* menu */}
        <div style={{ background: 'var(--card)', borderRadius: 16, boxShadow: 'var(--card-shadow)', overflow: 'hidden' }}>
          {menu.map((m, i) => (
            <button key={i} onClick={() => m.to && go(m.to)} style={{ width: '100%', height: 56, display: 'flex', alignItems: 'center',
              gap: 14, padding: '0 16px', borderBottom: '1px solid var(--surface)', textAlign: 'left' }}>
              <span style={{ fontSize: 20, width: 24, textAlign: 'center' }}>{m.icon}</span>
              <span style={{ flex: 1, fontSize: 15.5, fontWeight: 500, color: 'var(--text)' }}>{m.label}</span>
              {m.badge && <span style={{ height: 24, padding: '0 10px', borderRadius: 20, background: 'var(--accent-soft)',
                color: 'var(--accent)', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center' }}>{m.badge}</span>}
              {!m.badge && Icon.chevR('var(--muted)')}
            </button>
          ))}
          {/* premium */}
          <button style={{ width: '100%', height: 60, display: 'flex', alignItems: 'center', gap: 14, padding: '0 16px',
            background: 'var(--accent-soft)', borderBottom: '1px solid var(--surface)', textAlign: 'left' }}>
            <span style={{ fontSize: 20, width: 24, textAlign: 'center' }}>⭐</span>
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: 15.5, fontWeight: 700, color: 'var(--accent)' }}>Go Premium</span>
              <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>Unlock everything</span>
            </span>
            {Icon.chevR('var(--accent)')}
          </button>
          <button style={{ width: '100%', height: 56, display: 'flex', alignItems: 'center', gap: 14, padding: '0 16px', textAlign: 'left' }}>
            <span style={{ fontSize: 20, width: 24, textAlign: 'center' }}>🚪</span>
            <span style={{ flex: 1, fontSize: 15.5, fontWeight: 600, color: 'var(--error)' }}>Sign Out</span>
          </button>
        </div>
      </Scroll>
    </Screen>
  );
}

Object.assign(window, { ProgressScreen, ProfileScreen });
