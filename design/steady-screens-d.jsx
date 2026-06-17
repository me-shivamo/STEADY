// ─────────────────────────────────────────────────────────────
// STEADY — Screens D: Meal Plan  [v2 — coming soon]
//
// Full implementation deferred to v2. The screen is reachable
// but shows a placeholder so the router never crashes.
// ─────────────────────────────────────────────────────────────

function MealPlanScreen({ go }) {
  return (
    <Screen style={{ display: 'flex', flexDirection: 'column' }}>
      {/* top bar */}
      <div style={{ padding: '0 16px 8px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => go('home')} style={{ width: 38, height: 38, borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)' }}>
          {Icon.back()}
        </button>
        <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>Meal Plan</span>
      </div>

      {/* placeholder body */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: '0 36px', textAlign: 'center', gap: 18 }}>

        {/* icon */}
        <div style={{ width: 72, height: 72, borderRadius: 22, background: 'var(--surface)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34 }}>
          🗓
        </div>

        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
            Meal planning — coming soon
          </div>
          <div style={{ fontSize: 14.5, color: 'var(--text2)', lineHeight: 1.55 }}>
            Plan your week ahead, organise meals by location, and let AI fill the gaps.
            Launching in <strong style={{ color: 'var(--text)' }}>v2</strong>.
          </div>
        </div>

        <button onClick={() => go('home')} style={{ height: 46, padding: '0 28px', borderRadius: 23,
          background: 'var(--accent)', color: '#fff', fontSize: 15, fontWeight: 600,
          boxShadow: '0 2px 8px rgba(0,0,0,0.16)' }}>
          Back to home
        </button>
      </div>
    </Screen>
  );
}

// Stub exports so any lingering references don't throw.
const PLAN_CATALOG = [];
const PLACES = [];
const SLOTS = ['Breakfast', 'Lunch', 'Snack', 'Dinner'];
const PLAN_WEEK = { label: '', range: '', days: [] };

Object.assign(window, { MealPlanScreen, PLAN_CATALOG, PLACES, SLOTS, PLAN_WEEK });
