// ─────────────────────────────────────────────────────────────
// STEADY — App shell: navigation, device frame, tab bar, tweaks
// ─────────────────────────────────────────────────────────────

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": ["#C4503A", "#A8402E", "#F2E8E5"],
  "dinnerLogged": false
}/*EDITMODE-END*/;

const TAB_SCREENS = { profile: 'profile' };
const DARK_SCREENS = { welcome: true, camera: true };

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [screen, setScreen] = React.useState('welcome');

  const go = React.useCallback((s) => setScreen(s), []);

  // expose nav to the external rail
  React.useEffect(() => { window.__steadyNav = go; }, [go]);
  React.useEffect(() => { if (window.__railSetActive) window.__railSetActive(screen); }, [screen]);

  // capture helper: html-to-image renders overflow:auto blank, so freeze scroll
  // containers to overflow:hidden for screenshots/verification (live app stays scrollable).
  React.useEffect(() => {
    window.__freezeScroll = (on = true) => {
      window.__frz = on;
      const apply = () => {
        if (!window.__frz) return;
        [...document.querySelectorAll('#root *')].forEach(el => {
          el.style.setProperty('animation', 'none', 'important');
          el.style.setProperty('transition', 'none', 'important');
          const o = getComputedStyle(el).overflowY;
          if (o === 'auto' || o === 'scroll') el.style.setProperty('overflow', 'hidden', 'important');
        });
      };
      if (on) {
        apply();
        if (!window.__frzObs) {
          window.__frzObs = new MutationObserver(() => requestAnimationFrame(apply));
          window.__frzObs.observe(document.getElementById('root'), { childList: true, subtree: true });
        }
      } else if (window.__frzObs) {
        window.__frzObs.disconnect(); window.__frzObs = null;
      }
    };
  }, []);

  // apply accent tweak to CSS variables
  React.useEffect(() => {
    const a = t.accent || TWEAK_DEFAULTS.accent;
    const root = document.documentElement;
    root.style.setProperty('--accent', a[0]);
    root.style.setProperty('--accent-pressed', a[1]);
    root.style.setProperty('--accent-soft', a[2]);
  }, [t.accent]);

  const dark = !!DARK_SCREENS[screen];
  const tabId = TAB_SCREENS[screen];
  const showTab = !!tabId;
  const contentH = DEVICE_H - (showTab ? TAB_H : 0);

  const render = () => {
    switch (screen) {
      case 'welcome': return <WelcomeScreen go={go} />;
      case 'signup': return <SignUpScreen go={go} />;
      case 'onb1': return <OnbGoalScreen go={go} />;
      case 'onb6': return <OnbRevealScreen go={go} />;
      case 'home': return <HomeScreen go={go} tw={t} />;
      case 'camera': return <CameraScreen go={go} />;
      case 'progress': return <ProgressScreen go={go} />;
      case 'profile': return <ProfileScreen go={go} />;
      default: return <WelcomeScreen go={go} />;
    }
  };

  const accentOptions = [
    ['#C4503A', '#A8402E', '#F2E8E5'], // terracotta (default)
    ['#3A8C68', '#2E7055', '#E2F0EA'], // sage green
    ['#4A62A8', '#3A5090', '#E5EAF5'], // slate blue
    ['#885AAA', '#6E4890', '#EEE6F5'], // muted violet
  ];

  return (
    <React.Fragment>
      <IOSDevice dark={dark}>
        <div style={{ height: DEVICE_H, position: 'relative' }}>
          <div key={screen} style={{ height: contentH, overflow: 'hidden', animation: 'steadyFade .3s' }}>
            {render()}
          </div>
          {showTab && <TabBar active={tabId} go={go} />}
        </div>
      </IOSDevice>

      <TweaksPanel>
        <TweakSection label="Brand accent" />
        <TweakColor label="Accent" value={t.accent} options={accentOptions}
          onChange={(v) => setTweak('accent', v)} />
        <TweakSection label="Demo state" />
        <TweakToggle label="Dinner logged" value={t.dinnerLogged}
          onChange={(v) => setTweak('dinnerLogged', v)} />
        <TweakButton label="Restart flow" onClick={() => go('welcome')} />
      </TweaksPanel>
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
