import { create } from 'zustand';
import { supabase } from '../api/supabase';
import { useAuthStore } from './authStore';
import { Json } from '../types/database';

export type ReminderType =
  | 'workout'
  | 'meal'
  | 'water'
  | 'walking'
  | 'weight'
  | 'healthLog'
  | 'medicine';

// ─── Per-type schedule shapes ────────────────────────────────────────────────
// A discriminated union: one `ReminderConfig` type that's really five
// different shapes glued together with `|`, each tagged by `kind` so
// TypeScript knows exactly which other fields exist once that tag is
// checked (draft.kind === 'meals' narrows draft to MealsConfig, and
// draft.meals becomes accessible; the compiler refuses `draft.meals` in any
// branch where that hasn't been checked). See LEARNING.md for the full
// mental model. Every reminder type maps to exactly one `kind`:
//   workout, walking            -> daily
//   meal                        -> meals
//   water                       -> water
//   weight, healthLog           -> recurring
//   medicine                    -> medicine

export interface DailyConfig {
  kind: 'daily';
  time: string; // "HH:mm", 24h
}

export interface MealSlot {
  on: boolean;
  time: string; // "HH:mm"
}
export type MealSlotKey = 'breakfast' | 'morningSnack' | 'lunch' | 'eveningSnack' | 'dinner';
export interface MealsConfig {
  kind: 'meals';
  meals: Record<MealSlotKey, MealSlot>;
}

export interface WaterConfig {
  kind: 'water';
  mode: 'hourly' | 'times';
  from: string; // "HH:mm" — active window start
  to: string;   // "HH:mm" — active window end
  times: string[]; // used when mode === 'times', 2-6 entries
}

export interface RecurringConfig {
  kind: 'recurring';
  freq: 'week' | 'month';
  day: string;   // 'Sun'..'Sat' — used when freq === 'week'
  date: number;  // 1-28 — used when freq === 'month'
  time: string;  // "HH:mm" — time of day to fire on the matching day
}

export interface Medicine {
  id: string;
  name: string;
  dose: string;
  time: string; // "HH:mm"
  days: string[]; // subset of WEEKDAYS; empty = every day
}
export interface MedicineConfig {
  kind: 'medicine';
  meds: Medicine[];
}

export type ReminderConfig = DailyConfig | MealsConfig | WaterConfig | RecurringConfig | MedicineConfig;

export interface ReminderSchedule {
  type: ReminderType;
  enabled: boolean;
  config: ReminderConfig;
}

interface ReminderState {
  reminders: Record<ReminderType, ReminderSchedule>;
  loading: boolean;

  fetchReminders: () => Promise<void>;
  toggleReminder: (type: ReminderType) => Promise<void>;
  saveReminderConfig: (type: ReminderType, config: ReminderConfig, enabled: boolean) => Promise<void>;
  reset: () => void;
}

// Postgres CHECK (Dy) weekday names, matching to_char(..., 'Dy') in migration 021.
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export const MEAL_SLOTS: { key: MealSlotKey; label: string }[] = [
  { key: 'breakfast',    label: 'Breakfast' },
  { key: 'morningSnack', label: 'Morning Snack' },
  { key: 'lunch',        label: 'Lunch' },
  { key: 'eveningSnack', label: 'Evening Snack' },
  { key: 'dinner',       label: 'Dinner' },
];

function defaultConfig(type: ReminderType): ReminderConfig {
  switch (type) {
    case 'workout':
      return { kind: 'daily', time: '19:30' };
    case 'walking':
      return { kind: 'daily', time: '19:00' };
    case 'meal':
      return {
        kind: 'meals',
        meals: {
          breakfast:    { on: true,  time: '08:00' },
          morningSnack: { on: false, time: '11:00' },
          lunch:        { on: true,  time: '13:00' },
          eveningSnack: { on: false, time: '17:00' },
          dinner:       { on: true,  time: '19:30' },
        },
      };
    case 'water':
      return { kind: 'water', mode: 'times', from: '09:00', to: '21:00', times: ['09:00', '13:00', '17:00'] };
    case 'weight':
      return { kind: 'recurring', freq: 'week', day: 'Sun', date: 1, time: '07:00' };
    case 'healthLog':
      return { kind: 'recurring', freq: 'week', day: 'Sun', date: 1, time: '20:00' };
    case 'medicine':
      return { kind: 'medicine', meds: [] };
  }
}

// Backfills fields that didn't exist yet when a config was first saved to
// the DB. `config` is stored as plain JSONB with no schema enforcement, so a
// TypeScript type gaining a new field (like Medicine.days, added after some
// users already had medicines saved) doesn't retroactively add that field to
// rows already sitting in Postgres — the raw JSON a user saved last month is
// exactly what comes back today, missing keys and all. Called once, right
// after a config is read back from Supabase, so every component downstream
// can trust the type it's given instead of null-checking on every read.
function normalizeConfig(config: ReminderConfig): ReminderConfig {
  if (config.kind === 'medicine') {
    return {
      ...config,
      meds: config.meds.map((m) => ({ ...m, days: m.days ?? [] })),
    };
  }
  return config;
}

const REMINDER_TYPES: ReminderType[] = [
  'workout', 'meal', 'water', 'walking', 'weight', 'healthLog', 'medicine',
];

function defaultSchedule(type: ReminderType): ReminderSchedule {
  return { type, enabled: false, config: defaultConfig(type) };
}

function defaultReminders(): Record<ReminderType, ReminderSchedule> {
  return Object.fromEntries(
    REMINDER_TYPES.map((type) => [type, defaultSchedule(type)])
  ) as Record<ReminderType, ReminderSchedule>;
}

// Flattens a config into the "HH:mm" list find_due_reminders() unnests to
// find matches — only the times that would actually fire count (e.g. a
// disabled meal slot, or the inactive branch of water's mode, contribute
// nothing). Kept in the client rather than computed in SQL because it's the
// same shape either way and the client already has the config in hand when
// saving.
export function computeTimes(config: ReminderConfig): string[] {
  switch (config.kind) {
    case 'daily':
      return [config.time];
    case 'meals':
      return Object.values(config.meals).filter((m) => m.on).map((m) => m.time);
    case 'water':
      return config.mode === 'times' ? config.times : [config.from];
    case 'recurring':
      return [config.time];
    case 'medicine':
      return config.meds.map((m) => m.time);
  }
}

// Human-readable summary shown on the list rows.
export function summarizeConfig(config: ReminderConfig): string {
  switch (config.kind) {
    case 'daily':
      return `Every day at ${formatTime12(config.time)}`;
    case 'meals': {
      const n = Object.values(config.meals).filter((m) => m.on).length;
      return `${n} ${n === 1 ? 'meal' : 'meals'} a day`;
    }
    case 'water':
      return config.mode === 'hourly'
        ? `Every hour, ${formatTime12(config.from)} to ${formatTime12(config.to)}`
        : `${config.times.length} times a day`;
    case 'recurring': {
      const dayNames: Record<string, string> = {
        Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday',
        Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday',
      };
      return config.freq === 'week' ? `Every ${dayNames[config.day]}` : `Monthly on the ${ordinal(config.date)}`;
    }
    case 'medicine': {
      const n = config.meds.length;
      return n ? `${n} ${n === 1 ? 'medicine' : 'medicines'}` : 'No medicines yet';
    }
  }
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

export function formatTime12(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export const useReminderStore = create<ReminderState>((set, get) => ({
  reminders: defaultReminders(),
  loading: false,

  // Hydrates from notification_preferences (migration 013, extended by 021
  // with a `config` jsonb column). Every reminder type starts disabled with
  // sensible defaults until a matching row exists — a user who has never
  // touched the Reminders screen has no rows at all, so absence just means
  // "not set yet," not an error.
  fetchReminders: async () => {
    const userId = useAuthStore.getState().session?.user.id;
    if (!userId) return;

    set({ loading: true });
    try {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', userId);
      if (error) throw error;

      const reminders = defaultReminders();
      for (const row of data ?? []) {
        const type = row.reminder_type as ReminderType;
        const hasConfig = row.config && typeof row.config === 'object' && Object.keys(row.config).length > 0;
        const rawConfig = hasConfig ? (row.config as unknown as ReminderConfig) : defaultConfig(type);
        reminders[type] = { type, enabled: row.enabled, config: normalizeConfig(rawConfig) };
      }
      set({ reminders });
    } finally {
      set({ loading: false });
    }
  },

  toggleReminder: async (type) => {
    const userId = useAuthStore.getState().session?.user.id;
    if (!userId) return;

    const current = get().reminders[type];
    const nextEnabled = !current.enabled;

    // Optimistic local update, reverted below if the write fails.
    set((state) => ({
      reminders: { ...state.reminders, [type]: { ...current, enabled: nextEnabled } },
    }));

    const { error } = await supabase
      .from('notification_preferences')
      .upsert(
        {
          user_id: userId,
          reminder_type: type,
          enabled: nextEnabled,
          times: computeTimes(current.config),
          config: current.config as unknown as Json,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,reminder_type' }
      );

    if (error) {
      set((state) => ({ reminders: { ...state.reminders, [type]: current } }));
      throw error;
    }
  },

  // Persists a fully-edited config (and its enabled state) in one write —
  // used by the reminder detail screen's Save button.
  saveReminderConfig: async (type, config, enabled) => {
    const userId = useAuthStore.getState().session?.user.id;
    if (!userId) return;

    const previous = get().reminders[type];
    const next: ReminderSchedule = { type, enabled, config };

    set((state) => ({ reminders: { ...state.reminders, [type]: next } }));

    const { error } = await supabase
      .from('notification_preferences')
      .upsert(
        {
          user_id: userId,
          reminder_type: type,
          enabled,
          times: computeTimes(config),
          config: config as unknown as Json,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,reminder_type' }
      );

    if (error) {
      set((state) => ({ reminders: { ...state.reminders, [type]: previous } }));
      throw error;
    }
  },

  reset: () => set({ reminders: defaultReminders(), loading: false }),
}));
