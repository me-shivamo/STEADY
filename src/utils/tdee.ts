// Mifflin-St Jeor TDEE calculator.
// Takes the user's profile data collected during onboarding and returns
// their daily calorie goal plus macro breakdown in grams.

export interface TDEEInput {
  weight_kg: number;
  height_cm: number;
  age: number;
  sex: 'male' | 'female' | 'other';
  activity_level: 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active' | 'super_active';
  goal: 'lose_weight' | 'gain_weight' | 'maintain' | 'build_muscle';
  // Optional: when both are present, the daily calorie adjustment is derived
  // from the actual deadline (total kcal needed / days available) instead of
  // a fixed default — see computeGoalAdjustment() below. Missing either one
  // falls back to the fixed per-goal adjustment, same as before. Not used at
  // all for 'maintain' (no target weight applies).
  goal_weight_kg?: number | null;
  deadline_date?: string | null; // 'YYYY-MM-DD'
}

export interface TDEEResult {
  calorieGoal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  tdee: number;        // maintenance calories (before goal adjustment)
  weeksToGoal: number | null; // null when no deadline or maintain goal
  // Present only when a deadline was supplied AND it demands more than the
  // safe cap allows — the two numbers to show side by side: what the user's
  // own deadline would require, vs. the capped-safe pace calorieGoal above
  // actually uses. Null whenever the deadline (if any) is already within
  // the safe range, so the UI only shows this note when it's actually needed.
  deadlinePace: {
    requiredDailyAdjustment: number;  // signed: negative = deficit, positive = surplus
    requiredCalorieGoal: number;      // tdee + requiredDailyAdjustment, unclamped by the safety cap
    safeWeeksToGoal: number | null;   // weeks at the capped-safe pace actually being used
  } | null;
}

const ACTIVITY_MULTIPLIERS: Record<TDEEInput['activity_level'], number> = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
  super_active: 1.9,
};

// Fixed fallback calorie adjustment from TDEE, used when a goal has no
// (goal_weight_kg, deadline_date) pair to derive a deadline-aware pace from
// — e.g. 'maintain' never has a target weight, and lose_weight/gain_weight/
// build_muscle fall back here too if the user skipped the Target Weight
// screen. See computeGoalAdjustment() for the deadline-aware path.
const GOAL_ADJUSTMENTS: Record<TDEEInput['goal'], number> = {
  lose_weight: -500,
  gain_weight: +300,
  maintain: 0,
  build_muscle: +200,
};

// 1 kg of body fat ≈ 7700 kcal (used both here and by estimateWeeksToGoal
// below — kept as one constant so the two can't drift out of sync).
const KCAL_PER_KG = 7700;

// Safety caps on the daily calorie adjustment, regardless of how aggressive
// a deadline demands. Both are evidence-backed, not arbitrary:
//  - Gain: surpluses beyond ~500 kcal/day don't build muscle faster — natural
//    muscle protein synthesis has an upper ceiling, so anything past this
//    mostly becomes fat gain instead (ISSN review, Slater et al. 2019).
//  - Loss: ACSM's position stand caps SAFE weight loss at 0.5–1.0% of
//    bodyweight/week; 1% is the fastest end of that safe range, converted to
//    a kcal/day deficit scaled by the user's own weight (heavier users can
//    safely lose more absolute kg/week than lighter ones, so this is computed
//    per-user rather than being a single flat number for everyone).
const MAX_SAFE_SURPLUS_KCAL = 500;
const MAX_SAFE_LOSS_PCT_PER_WEEK = 0.01;

function maxSafeDeficitKcal(weightKg: number): number {
  const weeklyLossKg = weightKg * MAX_SAFE_LOSS_PCT_PER_WEEK;
  return (weeklyLossKg * KCAL_PER_KG) / 7;
}

// Derives the daily calorie adjustment (signed: negative = deficit, positive
// = surplus) to actually use, plus — when the user's own deadline demands
// more than the safe cap — the uncapped "what your deadline needs" number to
// show alongside it. Falls back to the fixed GOAL_ADJUSTMENTS value whenever
// there's no goal_weight_kg/deadline_date to compute a real pace from.
function computeGoalAdjustment(input: TDEEInput, tdee: number): {
  dailyAdjustment: number;
  deadlinePace: TDEEResult['deadlinePace'];
} {
  const { goal, weight_kg, goal_weight_kg, deadline_date } = input;

  if (goal === 'maintain' || !goal_weight_kg || !deadline_date) {
    return { dailyAdjustment: GOAL_ADJUSTMENTS[goal], deadlinePace: null };
  }

  const deltaKg = goal_weight_kg - weight_kg;
  const daysAvailable = Math.round(
    (new Date(deadline_date + 'T00:00:00').getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000
  );

  // A deadline that's already passed, today, or a goal weight that doesn't
  // actually require the direction implied by `goal` (e.g. lose_weight but
  // goal_weight_kg >= current) isn't a usable pace to derive math from —
  // fall back to the fixed default rather than dividing by zero/negative
  // days or computing a nonsensical adjustment sign.
  const wantsLoss = goal === 'lose_weight';
  const directionMatches = wantsLoss ? deltaKg < 0 : deltaKg > 0;
  if (daysAvailable <= 0 || !directionMatches) {
    return { dailyAdjustment: GOAL_ADJUSTMENTS[goal], deadlinePace: null };
  }

  const totalKcalNeeded = Math.abs(deltaKg) * KCAL_PER_KG;
  const requiredMagnitude = totalKcalNeeded / daysAvailable;
  const requiredDailyAdjustment = wantsLoss ? -requiredMagnitude : requiredMagnitude;

  const safeCap = wantsLoss ? maxSafeDeficitKcal(weight_kg) : MAX_SAFE_SURPLUS_KCAL;
  const safeMagnitude = Math.min(requiredMagnitude, safeCap);
  const dailyAdjustment = wantsLoss ? -safeMagnitude : safeMagnitude;

  // Only surface the deadline-vs-safe comparison when the deadline actually
  // demands more than what's safe — if the user's own timeline is already
  // realistic, requiredDailyAdjustment and the safe pace are the same number
  // and there's nothing extra worth showing.
  if (requiredMagnitude <= safeCap) {
    return { dailyAdjustment, deadlinePace: null };
  }

  const safeWeeksToGoal = Math.round((totalKcalNeeded / safeMagnitude) / 7);

  return {
    dailyAdjustment,
    deadlinePace: {
      requiredDailyAdjustment,
      requiredCalorieGoal: Math.round(tdee + requiredDailyAdjustment),
      safeWeeksToGoal,
    },
  };
}

// Protein target in grams per kg of bodyweight — the evidence-based way to
// size protein (ISSN position stand + subsequent research), not a percentage
// of total calories. A percentage split has no direct link to body size, so
// it drifts away from the recommended range for anyone lighter or heavier
// than an "average" build the percentage happened to be tuned around — a
// 50kg and 100kg person on the same percentage split land at very different
// g/kg numbers even though the g/kg target barely changes between them.
// Values below sit inside (lose_weight, at the higher end since a deficit
// specifically benefits from more protein to preserve lean mass) or at
// (gain_weight/maintain/build_muscle) the commonly cited 1.6–2.2 g/kg range.
const PROTEIN_G_PER_KG: Record<TDEEInput['goal'], number> = {
  lose_weight: 2.0,
  gain_weight: 1.8,
  maintain: 1.6,
  build_muscle: 2.0,
};

// Once protein is fixed in grams, the REMAINING calories split between carbs
// and fat by this ratio (carbs, fat) — unlike protein, carb/fat balance is
// much more a matter of preference and context than a single evidence-backed
// number, so a simple, goal-flavored ratio is reasonable here.
const CARB_FAT_SPLIT: Record<TDEEInput['goal'], [number, number]> = {
  lose_weight: [0.55, 0.45],
  gain_weight: [0.65, 0.35],
  maintain: [0.65, 0.35],
  build_muscle: [0.60, 0.40],
};

// Cosmetic final-display rounding — e.g. 2862 kcal shown as 2860, 117g
// protein shown as 120g. Applied ONLY at calculateTDEE's return, never to
// the intermediate calorieGoal that macrosFromCalories/weeksToGoal/
// deadlinePace derive from — those need the precise value so protein/carb/
// fat grams still reconcile back to the real calorie budget (see the
// 2.1.7 test), and a deadline's kcal/day math isn't thrown off by a
// same-direction ±5 rounding on every number in the chain. Standard
// round-to-nearest (not always up or down): 117 -> 120, 2862 -> 2860.
export function roundToNearest10(value: number): number {
  return Math.round(value / 10) * 10;
}

// Calories per gram: protein=4, carbs=4, fat=9
function macrosFromCalories(
  calories: number,
  weightKg: number,
  goal: TDEEInput['goal']
): { proteinG: number; carbsG: number; fatG: number } {
  const proteinG = Math.round(PROTEIN_G_PER_KG[goal] * weightKg);
  const proteinCalories = proteinG * 4;

  // Guard: at very low calorie goals combined with a high bodyweight, a
  // fixed g/kg protein target can exceed the entire calorie budget — carbs
  // and fat would go negative without this. Clamping remaining-calories to
  // 0 here means protein still reflects the honest bodyweight-based target
  // (so the number shown is never silently wrong), while carbs/fat simply
  // bottom out at 0 rather than becoming meaningless negative grams.
  const remainingCalories = Math.max(0, calories - proteinCalories);
  const [carbsPct, fatPct] = CARB_FAT_SPLIT[goal];

  return {
    proteinG,
    carbsG: Math.round((remainingCalories * carbsPct) / 4),
    fatG: Math.round((remainingCalories * fatPct) / 9),
  };
}

export function calculateAge(dateOfBirth: string): number {
  const dob = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

export function calculateTDEE(input: TDEEInput): TDEEResult {
  const { weight_kg, height_cm, age, sex, activity_level, goal } = input;

  // Mifflin-St Jeor BMR
  const bmrMale = 10 * weight_kg + 6.25 * height_cm - 5 * age + 5;
  const bmrFemale = 10 * weight_kg + 6.25 * height_cm - 5 * age - 161;
  const bmr =
    sex === 'male' ? bmrMale :
    sex === 'female' ? bmrFemale :
    (bmrMale + bmrFemale) / 2;

  const tdee = Math.round(bmr * ACTIVITY_MULTIPLIERS[activity_level]);
  const { dailyAdjustment, deadlinePace } = computeGoalAdjustment(input, tdee);
  const calorieGoal = Math.max(1200, Math.round(tdee + dailyAdjustment));

  // Everything above (macrosFromCalories, weeksToGoal, deadlinePace's own
  // internal math) uses the PRECISE calorieGoal — only the values actually
  // handed back to the caller get the cosmetic nearest-10 touch-up below.
  const macros = macrosFromCalories(calorieGoal, weight_kg, goal);

  const weeksToGoal =
    input.goal_weight_kg != null
      ? estimateWeeksToGoal(weight_kg, input.goal_weight_kg, dailyAdjustment)
      : null;

  return {
    calorieGoal: roundToNearest10(calorieGoal),
    tdee,
    weeksToGoal,
    deadlinePace: deadlinePace && {
      ...deadlinePace,
      requiredCalorieGoal: roundToNearest10(deadlinePace.requiredCalorieGoal),
    },
    proteinG: roundToNearest10(macros.proteinG),
    carbsG: roundToNearest10(macros.carbsG),
    fatG: roundToNearest10(macros.fatG),
  };
}

// Given a calorie deficit/surplus and a target weight delta, returns
// an estimated number of weeks to reach the goal.
// 1 kg of body fat ≈ 7700 kcal.
export function estimateWeeksToGoal(
  currentWeightKg: number,
  goalWeightKg: number,
  dailyAdjustment: number // negative = deficit, positive = surplus
): number | null {
  if (dailyAdjustment === 0) return null;
  const deltaKg = Math.abs(goalWeightKg - currentWeightKg);
  if (deltaKg < 0.5) return null; // already at goal
  const totalKcal = deltaKg * 7700;
  const daysNeeded = totalKcal / Math.abs(dailyAdjustment);
  return Math.round(daysNeeded / 7);
}
