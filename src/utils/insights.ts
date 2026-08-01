import { TdeeEstimate } from '../store/tdeeStore';

export type InsightId =
  | 'protein_gap'
  | 'tdee_mismatch'
  | 'weekend_pattern'
  | 'weekday_pattern'
  | 'streak_milestone'
  | 'best_week_comparison'
  | 'strong_week';

export interface Insight {
  id: InsightId;
  priority: number; // lower = shown first
  icon: string; // Ionicons name
  text: string;
}

export interface InsightInputs {
  avgP: number;
  goalP: number;
  tdee: TdeeEstimate | null;
  tdeeStatus: 'insufficient_data' | 'ready';
  weekdayAvgCalories: number | null;
  weekendAvgCalories: number | null;
  currentStreak: number | null;
  bestStreak: number | null;
  isCurrentWeekBest: boolean;
  currentWeekAdherencePct: number | null;
  bestWeekAdherencePct: number | null;
  elapsedDaysThisWeek: number;
}

const STREAK_MILESTONES = [7, 14, 30, 60, 100, 365];

function evalStreakMilestone(inputs: InsightInputs): Insight | null {
  const { currentStreak } = inputs;
  if (currentStreak == null) return null;

  if (STREAK_MILESTONES.includes(currentStreak)) {
    return {
      id: 'streak_milestone',
      priority: 10,
      icon: 'flame',
      text: `${currentStreak}-day logging streak! Consistency like this is what actually moves the needle.`,
    };
  }
  return null;
}

const TDEE_BUFFER_KCAL = 100;

function evalTdeeMismatch(inputs: InsightInputs): Insight | null {
  const { tdee, tdeeStatus } = inputs;
  if (tdeeStatus !== 'ready' || !tdee) return null;
  if (Math.abs(tdee.deltaVsGoal) < TDEE_BUFFER_KCAL) return null;

  if (tdee.deltaVsGoal > 0) {
    return {
      id: 'tdee_mismatch',
      priority: 20,
      icon: 'trending-down',
      text: `Your estimated maintenance is ~${tdee.smoothedTdee} kcal, about ${tdee.deltaVsGoal} more than your current goal. Your plan looks on track for a real deficit.`,
    };
  }
  return {
    id: 'tdee_mismatch',
    priority: 20,
    icon: 'trending-up',
    text: `Your estimated maintenance is ~${tdee.smoothedTdee} kcal, close to or below your current goal. Progress may be slower than expected at this intake.`,
  };
}

const WEEKEND_PATTERN_PCT_THRESHOLD = 0.15;
const WEEKEND_PATTERN_ABS_THRESHOLD = 150;

function evalWeekendPattern(inputs: InsightInputs): Insight | null {
  const { weekdayAvgCalories, weekendAvgCalories } = inputs;
  if (!weekdayAvgCalories || !weekendAvgCalories) return null;

  const diff = weekendAvgCalories - weekdayAvgCalories;
  const pctDiff = Math.abs(diff) / weekdayAvgCalories;
  if (pctDiff < WEEKEND_PATTERN_PCT_THRESHOLD || Math.abs(diff) < WEEKEND_PATTERN_ABS_THRESHOLD) {
    return null;
  }

  if (diff > 0) {
    return {
      id: 'weekend_pattern',
      priority: 30,
      icon: 'calendar-outline',
      text: `Your weekends tend to run ~${Math.round(diff)} kcal higher than weekdays. Planning ahead for Saturday/Sunday could help even things out.`,
    };
  }
  return {
    id: 'weekday_pattern',
    priority: 30,
    icon: 'calendar-outline',
    text: `You eat more on weekdays than weekends. Worth checking if weekend meals are getting under-logged.`,
  };
}

function evalProteinGap(inputs: InsightInputs): Insight | null {
  const { avgP, goalP } = inputs;
  if (goalP <= 0 || avgP >= goalP) return null;
  return {
    id: 'protein_gap',
    priority: 40,
    icon: 'nutrition-outline',
    text: "You're averaging below your protein goal this week. Adding a protein source to breakfast would help close the gap.",
  };
}

function evalBestWeekComparison(inputs: InsightInputs): Insight | null {
  const {
    isCurrentWeekBest,
    currentWeekAdherencePct,
    bestWeekAdherencePct,
    elapsedDaysThisWeek,
  } = inputs;

  if (currentWeekAdherencePct == null || bestWeekAdherencePct == null) return null;

  // Don't call it "your best week" after only a day or two — not enough of
  // the week has happened for the comparison to mean anything yet.
  if (isCurrentWeekBest && elapsedDaysThisWeek >= 3) {
    return {
      id: 'best_week_comparison',
      priority: 50,
      icon: 'trophy-outline',
      text: 'This is shaping up to be your best week yet. Keep the momentum going!',
    };
  }

  if (!isCurrentWeekBest && bestWeekAdherencePct - currentWeekAdherencePct >= 20) {
    return {
      id: 'best_week_comparison',
      priority: 50,
      icon: 'trending-up-outline',
      text: `Your best week hit ${Math.round(bestWeekAdherencePct)}% on-goal days, and this week's at ${Math.round(currentWeekAdherencePct)}%. A small push could get you back there.`,
    };
  }

  return null;
}

function strongWeekFallback(): Insight {
  return {
    id: 'strong_week',
    priority: 999,
    icon: 'sparkles',
    text: 'Strong, balanced week. Calories and macros are tracking right where they should be. Keep it up!',
  };
}

// Evaluates every rule, keeps the ones that fired, and returns the single
// highest-priority (lowest priority number) match — falling back to a
// generic "good week" message if nothing more specific applies.
export function evaluateInsights(inputs: InsightInputs): Insight {
  const candidates = [
    evalStreakMilestone(inputs),
    evalTdeeMismatch(inputs),
    evalWeekendPattern(inputs),
    evalProteinGap(inputs),
    evalBestWeekComparison(inputs),
  ].filter((c): c is Insight => c !== null);

  candidates.sort((a, b) => a.priority - b.priority);

  return candidates[0] ?? strongWeekFallback();
}
