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
}

export interface TDEEResult {
  calorieGoal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  tdee: number;        // maintenance calories (before goal adjustment)
  weeksToGoal: number | null; // null when no deadline or maintain goal
}

const ACTIVITY_MULTIPLIERS: Record<TDEEInput['activity_level'], number> = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
  super_active: 1.9,
};

// Calorie adjustment from TDEE based on goal
const GOAL_ADJUSTMENTS: Record<TDEEInput['goal'], number> = {
  lose_weight: -500,
  gain_weight: +300,
  maintain: 0,
  build_muscle: +200,
};

// Macro % split: [protein%, carbs%, fat%]
const MACRO_SPLITS: Record<TDEEInput['goal'], [number, number, number]> = {
  lose_weight: [0.30, 0.40, 0.30],
  gain_weight: [0.25, 0.50, 0.25],
  maintain: [0.25, 0.50, 0.25],
  build_muscle: [0.35, 0.40, 0.25],
};

// Calories per gram: protein=4, carbs=4, fat=9
function macrosFromCalories(
  calories: number,
  splits: [number, number, number]
): { proteinG: number; carbsG: number; fatG: number } {
  const [proteinPct, carbsPct, fatPct] = splits;
  return {
    proteinG: Math.round((calories * proteinPct) / 4),
    carbsG: Math.round((calories * carbsPct) / 4),
    fatG: Math.round((calories * fatPct) / 9),
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
  const calorieGoal = Math.max(1200, Math.round(tdee + GOAL_ADJUSTMENTS[goal]));

  const macros = macrosFromCalories(calorieGoal, MACRO_SPLITS[goal]);

  return {
    calorieGoal,
    tdee,
    weeksToGoal: null, // computed separately in RevealScreen using deadline_date
    ...macros,
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
