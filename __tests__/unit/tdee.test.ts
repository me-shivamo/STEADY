// Unit tests for src/utils/tdee.ts
// Traces TEST_SCENARIOS.md §2.1–2.3. Scenario IDs are referenced in test
// names so a failure can be looked up directly in that document.

import { calculateAge, calculateTDEE, estimateWeeksToGoal, roundToNearest10, TDEEInput } from '../../src/utils/tdee';

describe('calculateTDEE', () => {
  // §2.1.1 — typical adult male, moderately active, lose_weight
  it('2.1.1 computes BMR (male formula) x activity multiplier, minus 500, with g/kg protein + a 55/45 carb/fat split of the rest', () => {
    const input: TDEEInput = {
      weight_kg: 80,
      height_cm: 180,
      age: 30,
      sex: 'male',
      activity_level: 'moderately_active',
      goal: 'lose_weight',
    };

    // Mifflin-St Jeor (male): 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5 = 1780
    // TDEE: round(1780 * 1.55) = round(2759) = 2759
    // Precise calorieGoal (pre-display-rounding): max(1200, round(2759 - 500)) = 2259
    // protein: round(2.0 g/kg * 80) = 160g -> 640 kcal
    // remaining: 2259 - 640 = 1619, split 55% carbs / 45% fat
    // Final returned values are then rounded to the nearest 10 for display
    // (e.g. 2259 -> 2260) — see roundToNearest10 in tdee.ts.
    const result = calculateTDEE(input);

    expect(result.tdee).toBe(2759); // tdee itself is NOT display-rounded
    expect(result.calorieGoal).toBe(roundToNearest10(2259));
    const proteinG = Math.round(2.0 * 80);
    const remaining = 2259 - proteinG * 4;
    expect(result.proteinG).toBe(roundToNearest10(proteinG));
    expect(result.carbsG).toBe(roundToNearest10(Math.round((remaining * 0.55) / 4)));
    expect(result.fatG).toBe(roundToNearest10(Math.round((remaining * 0.45) / 9)));
  });

  // §2.1.2 — typical adult female, sedentary, maintain
  it('2.1.2 computes BMR (female formula) x sedentary multiplier, +0 adjustment, g/kg protein + 65/35 carb/fat split of the rest', () => {
    const input: TDEEInput = {
      weight_kg: 65,
      height_cm: 165,
      age: 28,
      sex: 'female',
      activity_level: 'sedentary',
      goal: 'maintain',
    };

    // BMR (female): 10*65 + 6.25*165 - 5*28 - 161 = 650 + 1031.25 - 140 - 161 = 1380.25
    // TDEE: round(1380.25 * 1.2) = round(1656.3) = 1656
    // Precise calorieGoal: max(1200, round(1656 + 0)) = 1656
    // protein: round(1.6 g/kg * 65) = 104g -> 416 kcal; remaining 1240, 65/35 carb/fat
    const result = calculateTDEE(input);

    expect(result.tdee).toBe(1656);
    expect(result.calorieGoal).toBe(roundToNearest10(1656));
    const proteinG = Math.round(1.6 * 65);
    const remaining = 1656 - proteinG * 4;
    expect(result.proteinG).toBe(roundToNearest10(proteinG));
    expect(result.carbsG).toBe(roundToNearest10(Math.round((remaining * 0.65) / 4)));
    expect(result.fatG).toBe(roundToNearest10(Math.round((remaining * 0.35) / 9)));
  });

  // §2.1.3 — sex: 'other' must average the male/female formulas, not use a third formula
  it("2.1.3 uses the AVERAGE of male and female BMR formulas when sex is 'other'", () => {
    const shared = { weight_kg: 70, height_cm: 170, age: 25, activity_level: 'sedentary' as const, goal: 'maintain' as const };

    const male = calculateTDEE({ ...shared, sex: 'male' });
    const female = calculateTDEE({ ...shared, sex: 'female' });
    const other = calculateTDEE({ ...shared, sex: 'other' });

    // tdee is round(bmr * multiplier); averaging BEFORE rounding means other.tdee
    // should equal round(avgBmr * multiplier), which we recompute independently
    // here rather than averaging the two already-rounded tdee values (that would
    // be a different, subtly wrong assertion).
    const bmrMale = 10 * 70 + 6.25 * 170 - 5 * 25 + 5;
    const bmrFemale = 10 * 70 + 6.25 * 170 - 5 * 25 - 161;
    const expectedTdee = Math.round(((bmrMale + bmrFemale) / 2) * 1.2);

    expect(other.tdee).toBe(expectedTdee);
    // Sanity: 'other' must land strictly between male and female, not equal either
    expect(other.tdee).toBeLessThan(male.tdee);
    expect(other.tdee).toBeGreaterThan(female.tdee);
  });

  // §2.1.4 — every activity_level multiplier
  it.each([
    ['sedentary', 1.2],
    ['lightly_active', 1.375],
    ['moderately_active', 1.55],
    ['very_active', 1.725],
    ['super_active', 1.9],
  ] as const)('2.1.4 applies the %s multiplier (%s)', (activity_level, multiplier) => {
    const bmr = 10 * 75 + 6.25 * 175 - 5 * 30 + 5; // male formula, fixed profile
    const input: TDEEInput = {
      weight_kg: 75,
      height_cm: 175,
      age: 30,
      sex: 'male',
      activity_level,
      goal: 'maintain',
    };

    const result = calculateTDEE(input);
    expect(result.tdee).toBe(Math.round(bmr * multiplier));
  });

  // §2.1.5 — every goal's calorie adjustment, g/kg protein target, and carb/fat split of the rest
  it.each([
    ['lose_weight', -500, 2.0, [0.55, 0.45]],
    ['gain_weight', 300, 1.8, [0.65, 0.35]],
    ['maintain', 0, 1.6, [0.65, 0.35]],
    ['build_muscle', 200, 2.0, [0.60, 0.40]],
  ] as const)('2.1.5 applies the %s adjustment (%s kcal) with %s g/kg protein and its own carb/fat split of the rest', (goal, adjustment, proteinPerKg, carbFatSplit) => {
    const weightKg = 75;
    const input: TDEEInput = {
      weight_kg: weightKg,
      height_cm: 175,
      age: 30,
      sex: 'male',
      activity_level: 'moderately_active',
      goal,
    };

    const result = calculateTDEE(input);
    const expectedGoal = Math.max(1200, result.tdee + adjustment);

    expect(result.calorieGoal).toBe(roundToNearest10(expectedGoal));
    const [carbPct, fatPct] = carbFatSplit;
    const proteinG = Math.round(proteinPerKg * weightKg);
    const remaining = expectedGoal - proteinG * 4;
    expect(result.proteinG).toBe(roundToNearest10(proteinG));
    expect(result.carbsG).toBe(roundToNearest10(Math.round((remaining * carbPct) / 4)));
    expect(result.fatG).toBe(roundToNearest10(Math.round((remaining * fatPct) / 9)));
  });

  // §2.1.6 — the 1200 kcal floor must actually engage, not just exist as a comment
  it('2.1.6 floors calorieGoal at 1200 for a very low BMR profile on lose_weight', () => {
    // Deliberately extreme: low weight/height, high age -> low BMR, then -500 more.
    const input: TDEEInput = {
      weight_kg: 40,
      height_cm: 140,
      age: 80,
      sex: 'female',
      activity_level: 'sedentary',
      goal: 'lose_weight',
    };

    const result = calculateTDEE(input);

    // BMR (female): 10*40 + 6.25*140 - 5*80 - 161 = 400 + 875 - 400 - 161 = 714
    // TDEE: round(714 * 1.2) = 857
    // Without the floor: 857 - 500 = 357, which is below 1200 -> floor must kick in.
    expect(result.tdee).toBeLessThan(1200); // confirms this input genuinely exercises the floor
    expect(result.calorieGoal).toBe(1200);
  });

  // §2.1.7 — macro grams must reconcile back to ~calorieGoal (catches a wrong kcal/gram constant)
  it.each(['lose_weight', 'gain_weight', 'maintain', 'build_muscle'] as const)(
    '2.1.7 macro grams for %s reconcile to within rounding of calorieGoal',
    (goal) => {
      const result = calculateTDEE({
        weight_kg: 80,
        height_cm: 180,
        age: 35,
        sex: 'male',
        activity_level: 'very_active',
        goal,
      });

      const reconstructed = result.proteinG * 4 + result.carbsG * 4 + result.fatG * 9;
      // All 4 returned numbers (proteinG, carbsG, fatG, calorieGoal) are now
      // independently rounded to the nearest 10 for display (roundToNearest10
      // in tdee.ts) on top of the underlying gram-level Math.round() calls —
      // so this is checking "does display rounding stay in a sane ballpark,"
      // not tdee.ts's true calculation precision (which reconciles far more
      // tightly — see the ~6 kcal bound this replaced). Worst-case bound:
      // protein/carbs each ±5g*4=20, fat ±5g*9=45, calorieGoal itself ±5,
      // for a theoretical max around 90; 60 gives real headroom above what's
      // actually observed (up to ~50 across these 4 goals) while still
      // catching a genuinely wrong calories-per-gram constant (that would
      // blow way past this).
      expect(Math.abs(reconstructed - result.calorieGoal)).toBeLessThanOrEqual(60);
    }
  );

  // §2.1.8 — malformed input (no guards exist in the function today) — document actual behavior
  it('2.1.8 documents current (unguarded) behavior for negative weight/height', () => {
    const result = calculateTDEE({
      weight_kg: -10,
      height_cm: -50,
      age: 30,
      sex: 'male',
      activity_level: 'sedentary',
      goal: 'maintain',
    });

    // No NaN — the formula is arithmetically well-defined even for negative inputs,
    // it just produces a nonsensical (very negative, then floored) calorie goal.
    // This test locks in that "nonsensical but non-crashing" behavior so that if
    // input validation is added later, this test is forced to change deliberately.
    expect(Number.isNaN(result.calorieGoal)).toBe(false);
    expect(result.calorieGoal).toBe(1200); // floor engages since raw tdee is deeply negative
  });

  // §2.1.9 — protein must scale with bodyweight (the bug the g/kg rewrite fixed:
  // the old percentage-of-calories split drifted outside 1.6-2.2 g/kg at the
  // weight extremes even though it looked reasonable for an "average" build)
  it.each([50, 80, 100])('2.1.9 protein for gain_weight scales linearly with bodyweight (%skg)', (weightKg) => {
    const result = calculateTDEE({
      weight_kg: weightKg,
      height_cm: 175,
      age: 30,
      sex: 'male',
      activity_level: 'moderately_active',
      goal: 'gain_weight',
    });
    expect(result.proteinG).toBe(roundToNearest10(Math.round(1.8 * weightKg)));
    // The display-rounded value can drift slightly outside the strict
    // 1.6-2.2 g/kg research band at small weights (e.g. 50kg: precise 90g ->
    // displayed 90g is fine, but a case landing near a 10g boundary could
    // tip just outside) — widen the check by the rounding's own ±5 margin
    // rather than asserting the cosmetic number itself sits in-band.
    const gPerKg = result.proteinG / weightKg;
    expect(gPerKg).toBeGreaterThanOrEqual(1.6 - 5 / weightKg);
    expect(gPerKg).toBeLessThanOrEqual(2.2 + 5 / weightKg);
  });

  // §2.1.10-2.1.14 — deadline-aware pace (computeGoalAdjustment)
  // Shared profile: 65kg, 177.8cm (5'10"), 24yo male, moderately active.
  const DEADLINE_PROFILE = {
    weight_kg: 65,
    height_cm: 177.8,
    age: 24,
    sex: 'male' as const,
    activity_level: 'moderately_active' as const,
  };

  function isoDaysFromNow(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  it('2.1.10 a realistic deadline (within the safe cap) uses the deadline-derived adjustment, no capping note', () => {
    // 65kg -> 70kg (5kg) over 120 days: 5*7700/120 ≈ 321 kcal/day surplus,
    // comfortably under the 500 kcal/day safe cap.
    const result = calculateTDEE({
      ...DEADLINE_PROFILE,
      goal: 'gain_weight',
      goal_weight_kg: 70,
      deadline_date: isoDaysFromNow(120),
    });

    const tdee = result.tdee;
    const expectedAdjustment = (5 * 7700) / 120;
    expect(result.calorieGoal).toBe(roundToNearest10(Math.max(1200, Math.round(tdee + expectedAdjustment))));
    expect(result.deadlinePace).toBeNull();
    expect(result.weeksToGoal).not.toBeNull();
  });

  it('2.1.11 [REGRESSION] "gain 5kg in 1 month" caps the surplus at 500 kcal/day and surfaces the honest deadline-required number', () => {
    // This is the exact TESTING.md bug scenario ("I choose to gain the
    // weight... in one month?"), now handled instead of silently producing
    // whatever the fixed +300 table happened to give.
    const result = calculateTDEE({
      ...DEADLINE_PROFILE,
      goal: 'gain_weight',
      goal_weight_kg: 70,
      deadline_date: isoDaysFromNow(30),
    });

    // Actual plan is capped at +500 kcal/day, NOT the ~1242 kcal/day the
    // 1-month deadline would mathematically require.
    expect(result.calorieGoal).toBe(roundToNearest10(Math.max(1200, Math.round(result.tdee + 500))));

    // The uncapped truth is surfaced separately, not hidden.
    expect(result.deadlinePace).not.toBeNull();
    const requiredMagnitude = (5 * 7700) / 30;
    // requiredDailyAdjustment is NOT display-rounded (it's an internal-ish
    // diagnostic value, not something shown standalone in the UI) — only
    // requiredCalorieGoal, the number actually rendered, gets rounded.
    expect(result.deadlinePace!.requiredDailyAdjustment).toBeCloseTo(requiredMagnitude, 1);
    expect(result.deadlinePace!.requiredCalorieGoal).toBe(roundToNearest10(Math.round(result.tdee + requiredMagnitude)));
    expect(result.deadlinePace!.requiredCalorieGoal).toBeGreaterThan(result.calorieGoal);
    expect(result.deadlinePace!.safeWeeksToGoal).not.toBeNull();
  });

  it('2.1.12 loss deficit is capped at 1% of bodyweight/week, scaled per-user (not a flat kcal number)', () => {
    // 65kg -> 55kg (10kg loss) in 30 days would need an extreme deficit;
    // confirm the actual plan never exceeds the 1%-bodyweight/week cap
    // (0.65kg/week for a 65kg person -> 715 kcal/day).
    const result = calculateTDEE({
      ...DEADLINE_PROFILE,
      goal: 'lose_weight',
      goal_weight_kg: 55,
      deadline_date: isoDaysFromNow(30),
    });

    const safeCapKcal = (65 * 0.01 * 7700) / 7; // ≈ 715
    const actualDeficit = result.tdee - result.calorieGoal;
    expect(actualDeficit).toBeLessThanOrEqual(Math.round(safeCapKcal) + 1); // +1 rounding slack
    expect(result.deadlinePace).not.toBeNull();
  });

  it('2.1.13 direction mismatch (lose_weight but goal_weight_kg >= current) falls back to the fixed table', () => {
    const result = calculateTDEE({
      ...DEADLINE_PROFILE,
      goal: 'lose_weight',
      goal_weight_kg: 70, // heavier than current 65kg — wrong direction for "lose"
      deadline_date: isoDaysFromNow(60),
    });

    expect(result.calorieGoal).toBe(roundToNearest10(Math.max(1200, Math.round(result.tdee - 500))));
    expect(result.deadlinePace).toBeNull();
  });

  it('2.1.14 a deadline in the past falls back to the fixed table instead of dividing by a non-positive day count', () => {
    const result = calculateTDEE({
      ...DEADLINE_PROFILE,
      goal: 'gain_weight',
      goal_weight_kg: 70,
      deadline_date: isoDaysFromNow(-10),
    });

    expect(result.calorieGoal).toBe(roundToNearest10(Math.max(1200, Math.round(result.tdee + 300))));
    expect(result.deadlinePace).toBeNull();
    expect(Number.isNaN(result.calorieGoal)).toBe(false);
  });

  it('2.1.15 build_muscle WITH goal_weight_kg/deadline_date uses the same deadline-aware logic as gain_weight (not special-cased out)', () => {
    const buildMuscleResult = calculateTDEE({
      ...DEADLINE_PROFILE,
      goal: 'build_muscle',
      goal_weight_kg: 70,
      deadline_date: isoDaysFromNow(30),
    });
    const gainWeightResult = calculateTDEE({
      ...DEADLINE_PROFILE,
      goal: 'gain_weight',
      goal_weight_kg: 70,
      deadline_date: isoDaysFromNow(30),
    });

    // Both goals hit the same 500 kcal/day safe cap under an identical
    // aggressive deadline — deadline-awareness is keyed on data presence,
    // not on which of these two goal types was picked.
    expect(buildMuscleResult.calorieGoal).toBe(gainWeightResult.calorieGoal);
    expect(buildMuscleResult.deadlinePace).not.toBeNull();

    // Without a deadline, build_muscle keeps its own distinct fixed
    // adjustment (+200) rather than gain_weight's (+300).
    const buildMuscleNoDeadline = calculateTDEE({ ...DEADLINE_PROFILE, goal: 'build_muscle' });
    expect(buildMuscleNoDeadline.calorieGoal).toBe(roundToNearest10(Math.max(1200, Math.round(buildMuscleNoDeadline.tdee + 200))));
  });
});

describe('calculateAge', () => {
  // Freeze "today" so these tests don't depend on the day this suite happens to run.
  const REAL_DATE = Date;
  function mockToday(isoDate: string) {
    const fixed = new REAL_DATE(isoDate);
    // @ts-expect-error — intentionally replacing the global Date constructor for this test only
    global.Date = class extends REAL_DATE {
      // @ts-expect-error — intentionally not calling super(); this constructor
      // always returns an override object instead, which JS permits but TS's
      // "derived classes must call super()" rule doesn't know how to allow.
      constructor(...args: unknown[]) {
        if (args.length === 0) return fixed;
        // @ts-expect-error — forwarding varargs to the real Date constructor
        return new REAL_DATE(...args);
      }
      static now() {
        return fixed.getTime();
      }
    };
  }
  afterEach(() => {
    global.Date = REAL_DATE;
  });

  // §2.2.1 — birthday already passed this year
  it('2.2.1 returns a simple year subtraction when the birthday already passed this year', () => {
    mockToday('2026-07-12'); // "today" per system context
    expect(calculateAge('2000-01-15')).toBe(26);
  });

  // §2.2.2 — birthday hasn't happened yet this year -> one less than naive subtraction
  it('2.2.2 subtracts one more year when the birthday has not occurred yet this year', () => {
    mockToday('2026-07-12');
    expect(calculateAge('2000-12-25')).toBe(25); // not 26
  });

  // §2.2.3 — birthday is exactly today
  it('2.2.3 does not subtract an extra year when today IS the birthday', () => {
    mockToday('2026-07-12');
    expect(calculateAge('2000-07-12')).toBe(26);
  });

  // §2.2.4 — DOB in the future (bad data) must not crash
  it('2.2.4 does not throw for a future date of birth (returns a negative age)', () => {
    mockToday('2026-07-12');
    expect(() => calculateAge('2030-01-01')).not.toThrow();
    expect(calculateAge('2030-01-01')).toBeLessThan(0);
  });
});

describe('estimateWeeksToGoal', () => {
  // §2.3.1 — maintain goal (dailyAdjustment 0) -> null
  it('2.3.1 returns null when dailyAdjustment is 0 (maintain goal)', () => {
    expect(estimateWeeksToGoal(70, 80, 0)).toBeNull();
  });

  // §2.3.2 — already within 0.5kg of goal -> null even with a nonzero adjustment
  it('2.3.2 returns null when current weight is already within 0.5kg of goal weight', () => {
    expect(estimateWeeksToGoal(70, 70.3, 300)).toBeNull();
    expect(estimateWeeksToGoal(70, 69.7, -500)).toBeNull();
  });

  // §2.3.3 — the exact regression case from TESTING.md's "~37 weeks" bug report.
  // The math is correct given a fixed +300 kcal/day surplus; this test locks in
  // TODAY's output so a future deadline-aware rework changes it on purpose.
  it('2.3.3 [REGRESSION] 65kg -> 75kg at +300 kcal/day surplus currently returns 37 weeks', () => {
    // 10kg * 7700 kcal/kg = 77000 kcal total / 300 kcal/day = 256.67 days / 7 = 36.67 -> round = 37
    expect(estimateWeeksToGoal(65, 75, 300)).toBe(37);
  });

  // §2.3.4 — same fixed-adjustment behavior in the deficit direction
  it('2.3.4 100kg -> 60kg at -500 kcal/day deficit', () => {
    // 40kg * 7700 = 308000 kcal / 500 = 616 days / 7 = 88 weeks
    expect(estimateWeeksToGoal(100, 60, -500)).toBe(88);
  });

  // §2.3.5 — dailyAdjustment very close to 0 (not exactly 0) must not blow up
  it('2.3.5 a tiny nonzero dailyAdjustment returns a large finite number, not Infinity/NaN', () => {
    const weeks = estimateWeeksToGoal(70, 80, 0.01);
    expect(weeks).not.toBeNull();
    expect(Number.isFinite(weeks as number)).toBe(true);
    expect(weeks as number).toBeGreaterThan(1_000_000); // deliberately huge, but finite
  });
});
