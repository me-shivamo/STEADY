// Unit tests for src/utils/tdee.ts
// Traces TEST_SCENARIOS.md §2.1–2.3. Scenario IDs are referenced in test
// names so a failure can be looked up directly in that document.

import { calculateAge, calculateTDEE, estimateWeeksToGoal, TDEEInput } from '../../src/utils/tdee';

describe('calculateTDEE', () => {
  // §2.1.1 — typical adult male, moderately active, lose_weight
  it('2.1.1 computes BMR (male formula) x activity multiplier, minus 500, with a 30/40/30 split', () => {
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
    // calorieGoal: max(1200, round(2759 - 500)) = 2259
    const result = calculateTDEE(input);

    expect(result.tdee).toBe(2759);
    expect(result.calorieGoal).toBe(2259);
    // 30% protein, 40% carbs, 30% fat
    expect(result.proteinG).toBe(Math.round((2259 * 0.3) / 4));
    expect(result.carbsG).toBe(Math.round((2259 * 0.4) / 4));
    expect(result.fatG).toBe(Math.round((2259 * 0.3) / 9));
  });

  // §2.1.2 — typical adult female, sedentary, maintain
  it('2.1.2 computes BMR (female formula) x sedentary multiplier, +0 adjustment, 25/50/25 split', () => {
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
    // calorieGoal: max(1200, round(1656 + 0)) = 1656
    const result = calculateTDEE(input);

    expect(result.tdee).toBe(1656);
    expect(result.calorieGoal).toBe(1656);
    expect(result.proteinG).toBe(Math.round((1656 * 0.25) / 4));
    expect(result.carbsG).toBe(Math.round((1656 * 0.5) / 4));
    expect(result.fatG).toBe(Math.round((1656 * 0.25) / 9));
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

  // §2.1.5 — every goal's calorie adjustment AND macro split
  it.each([
    ['lose_weight', -500, [0.3, 0.4, 0.3]],
    ['gain_weight', 300, [0.25, 0.5, 0.25]],
    ['maintain', 0, [0.25, 0.5, 0.25]],
    ['build_muscle', 200, [0.35, 0.4, 0.25]],
  ] as const)('2.1.5 applies the %s adjustment (%s kcal) with its own macro split', (goal, adjustment, splits) => {
    const input: TDEEInput = {
      weight_kg: 75,
      height_cm: 175,
      age: 30,
      sex: 'male',
      activity_level: 'moderately_active',
      goal,
    };

    const result = calculateTDEE(input);
    const expectedGoal = Math.max(1200, result.tdee + adjustment);

    expect(result.calorieGoal).toBe(expectedGoal);
    const [p, c, f] = splits;
    expect(result.proteinG).toBe(Math.round((expectedGoal * p) / 4));
    expect(result.carbsG).toBe(Math.round((expectedGoal * c) / 4));
    expect(result.fatG).toBe(Math.round((expectedGoal * f) / 9));
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
      // 3 independent Math.round() calls means up to ~3 kcal of combined rounding drift
      expect(Math.abs(reconstructed - result.calorieGoal)).toBeLessThanOrEqual(3);
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
});

describe('calculateAge', () => {
  // Freeze "today" so these tests don't depend on the day this suite happens to run.
  const REAL_DATE = Date;
  function mockToday(isoDate: string) {
    const fixed = new REAL_DATE(isoDate);
    // @ts-expect-error — intentionally replacing the global Date constructor for this test only
    global.Date = class extends REAL_DATE {
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
