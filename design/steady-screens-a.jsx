// ─────────────────────────────────────────────────────────────
// STEADY — Screens A: Welcome · Sign Up · Onboarding (Goal + Reveal)
// ─────────────────────────────────────────────────────────────

// Screen 1 — Welcome / Splash
function WelcomeScreen({ go }) {
  return (
    <Screen pad={false} scroll={false} bg="#1D1D1F">
      <img src={FOOD.oatmeal} alt="" crossOrigin="anonymous" style={{ position: 'absolute', inset: 0, width: '100%',
        height: '100%', objectFit: 'cover' }} />
      <div style={{ position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0.05) 30%, rgba(0,0,0,0.55) 72%, rgba(0,0,0,0.92) 100%)' }} />
      {/* logo block ~35% */}
      <div style={{ position: 'absolute', top: '31%', left: 0, right: 0, textAlign: 'center',
        animation: 'steadyFade .8s' }}>
        <svg width="56" height="56" viewBox="0 0 56 56" style={{ marginBottom: 14 }}>
          <path d="M8 36a20 20 0 1140 0" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
          <circle cx="48" cy="36" r="3.4" fill="var(--accent-pressed)" />
        </svg>
        <div style={{ color: '#fff', fontSize: 34, fontWeight: 800, letterSpacing: 3 }}>STEADY</div>
        <div style={{ color: 'rgba(255,255,255,0.92)', fontSize: 17, fontWeight: 400,
          marginTop: 12, lineHeight: 1.5 }}>Know what you eat.<br />Own how you feel.</div>
      </div>
      {/* bottom buttons */}
      <div style={{ position: 'absolute', left: 20, right: 20, bottom: 46,
        display: 'flex', flexDirection: 'column', gap: 12, animation: 'steadyFade .8s' }}>
        <Btn onClick={() => go('signup')}>Get Started</Btn>
        <Btn variant="ghostLight" onClick={() => go('home')} style={{ height: 52, fontWeight: 600, fontSize: 16 }}>
          I already have an account
        </Btn>
      </div>
    </Screen>
  );
}

// ── reusable input ──
function Field({ label, type = 'text', value, onChange, trailing }) {
  return (
    <div style={{ position: 'relative' }}>
      <input type={type} placeholder={label} value={value} onChange={onChange}
        style={{ width: '100%', height: 56, borderRadius: 12, background: 'var(--surface)',
          border: '1px solid var(--border)', padding: '0 16px', paddingRight: trailing ? 48 : 16,
          fontSize: 15, color: 'var(--text)', outline: 'none' }} />
      {trailing && <div style={{ position: 'absolute', right: 14, top: 0, height: 56,
        display: 'flex', alignItems: 'center', color: 'var(--muted)' }}>{trailing}</div>}
    </div>
  );
}

// Screen 2 — Sign Up
function SignUpScreen({ go }) {
  const [name, setName] = React.useState('Shivam');
  const [email, setEmail] = React.useState('shivam@email.com');
  const [pw, setPw] = React.useState('mealprep2026');
  const [show, setShow] = React.useState(false);
  return (
    <Screen>
      <Scroll style={{ padding: '0 20px' }}>
        <button onClick={() => go('welcome')} style={{ width: 40, height: 40, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface)',
          color: 'var(--text)', marginBottom: 18 }}>{Icon.back()}</button>
        <h1 style={{ fontSize: 26, fontWeight: 600, color: 'var(--text)', letterSpacing: -0.3 }}>Create your account</h1>
        <p style={{ fontSize: 16, color: 'var(--text2)', marginTop: 6 }}>It only takes a minute.</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 24 }}>
          <Field label="Full name" value={name} onChange={e => setName(e.target.value)} />
          <Field label="Email address" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          <Field label="Password" type={show ? 'text' : 'password'} value={pw} onChange={e => setPw(e.target.value)}
            trailing={<button onClick={() => setShow(s => !s)} style={{ color: 'var(--muted)', display: 'flex' }}>{Icon.eye(show)}</button>} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '22px 0' }}>
          <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap' }}>or continue with</span>
          <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Btn variant="outline" onClick={() => go('onb1')} style={{ height: 52, fontSize: 16, fontWeight: 600 }}>
            {Icon.apple()} Continue with Apple
          </Btn>
          <Btn variant="outline" onClick={() => go('onb1')} style={{ height: 52, fontSize: 16, fontWeight: 600 }}>
            {Icon.google()} Continue with Google
          </Btn>
        </div>

        <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', margin: '22px 4px 18px', lineHeight: 1.6 }}>
          By creating an account you agree to our <span style={{ color: 'var(--accent)', textDecoration: 'underline' }}>Terms</span> & <span style={{ color: 'var(--accent)', textDecoration: 'underline' }}>Privacy Policy</span>
        </p>
        <Btn onClick={() => go('onb1')}>Create Account</Btn>
      </Scroll>
    </Screen>
  );
}

// Screen 3 — Onboarding step 1: Goal
function OnbGoalScreen({ go }) {
  const [sel, setSel] = React.useState('lose');
  const goals = [
    { id: 'lose', emoji: '🔥', label: 'Lose weight' },
    { id: 'gain', emoji: '📈', label: 'Gain weight' },
    { id: 'maintain', emoji: '⚖️', label: 'Maintain weight' },
    { id: 'muscle', emoji: '💪', label: 'Build muscle' },
  ];
  return (
    <Screen>
      <div style={{ padding: '6px 20px 16px' }}><ProgressDots total={6} current={1} /></div>
      <Scroll style={{ padding: '8px 20px 0' }}>
        <div style={{ display: 'flex', gap: 9, alignItems: 'flex-end', marginBottom: 4 }}>
          <SteadyAvatar size={36} />
          <div style={{ maxWidth: '80%', padding: '12px 15px', borderRadius: 18, borderBottomLeftRadius: 5,
            background: 'var(--surface)', color: 'var(--text)', fontSize: 15, lineHeight: 1.45 }}>
            Hey! I'm STEADY 👋 I'll help you track food, hit your goals, and understand your body better. What's your main goal?
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 45, marginBottom: 24 }}>STEADY</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {goals.map(g => {
            const on = sel === g.id;
            return (
              <button key={g.id} onClick={() => setSel(g.id)} style={{ display: 'flex', alignItems: 'center',
                gap: 14, height: 64, padding: '0 16px', borderRadius: 14, textAlign: 'left',
                background: on ? 'var(--accent-soft)' : 'var(--card)', border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                transition: 'all .18s', boxShadow: on ? '0 4px 12px rgba(0,0,0,0.10)' : 'none' }}>
                <span style={{ fontSize: 24 }}>{g.emoji}</span>
                <span style={{ flex: 1, fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{g.label}</span>
                {on ? <span style={{ color: 'var(--accent)', display: 'flex' }}>{Icon.check('var(--accent)')}</span>
                    : <span style={{ color: 'var(--muted)', display: 'flex' }}>{Icon.chevR('var(--muted)')}</span>}
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: 20 }}>
          <Btn onClick={() => go('onb6')}>Continue</Btn>
        </div>
      </Scroll>
    </Screen>
  );
}

// Screen 4 — Onboarding step 6: Calorie reveal
function OnbRevealScreen({ go }) {
  const macros = [
    { v: DATA.user.P, label: 'Protein', c: 'var(--protein)' },
    { v: DATA.user.C, label: 'Carbs', c: 'var(--carbs)' },
    { v: DATA.user.F, label: 'Fat', c: 'var(--fat)' },
  ];
  return (
    <Screen>
      <div style={{ padding: '6px 20px 16px' }}><ProgressDots total={6} current={6} /></div>
      <Scroll style={{ padding: '8px 20px 0' }}>
        <div style={{ display: 'flex', gap: 9, alignItems: 'flex-end', marginBottom: 24 }}>
          <SteadyAvatar size={36} />
          <div style={{ padding: '12px 15px', borderRadius: 18, borderBottomLeftRadius: 5,
            background: 'var(--surface)', color: 'var(--text)', fontSize: 15, fontWeight: 500 }}>
            Here's your personalized daily plan 🎯
          </div>
        </div>

        <div style={{ background: 'var(--card)', borderRadius: 20, boxShadow: 'var(--card-shadow-lg)',
          padding: '30px 22px 22px', animation: 'steadyPop .55s' }}>
          <div className="tnum" style={{ fontSize: 64, fontWeight: 800, color: 'var(--accent)',
            textAlign: 'center', lineHeight: 1 }}>1,850</div>
          <div style={{ fontSize: 18, color: 'var(--text2)', textAlign: 'center', marginTop: 6 }}>kcal / day</div>

          <div style={{ height: 1, background: 'var(--surface)', margin: '22px 0' }} />

          <div style={{ display: 'flex' }}>
            {macros.map(m => (
              <div key={m.label} style={{ flex: 1, textAlign: 'center' }}>
                <div className="tnum" style={{ fontSize: 20, fontWeight: 700, color: m.c }}>{m.v}g</div>
                <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 3 }}>{m.label}</div>
              </div>
            ))}
          </div>

          <div style={{ height: 1, background: 'var(--surface)', margin: '22px 0' }} />

          <div style={{ fontSize: 14, color: 'var(--text2)', textAlign: 'center', lineHeight: 1.4 }}>
            At this pace you'll reach your goal in <strong style={{ color: 'var(--text)' }}>~14 weeks</strong> 🗓
          </div>
          <div style={{ textAlign: 'right', marginTop: 12 }}>
            <span style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'underline' }}>Edit target</span>
          </div>
        </div>
      </Scroll>
      <div style={{ position: 'sticky', bottom: 0, padding: '12px 20px 30px', background: 'var(--bg)' }}>
        <Btn onClick={() => go('home')}>Let's start! →</Btn>
      </div>
    </Screen>
  );
}

Object.assign(window, { WelcomeScreen, SignUpScreen, OnbGoalScreen, OnbRevealScreen });
