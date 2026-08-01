import { create } from 'zustand';
import { supabase } from '../api/supabase';
import { useAuthStore } from './authStore';

export type ReminderType =
  | 'workout'
  | 'meal'
  | 'water'
  | 'walking'
  | 'weight'
  | 'healthLog'
  | 'medicine';

export interface ReminderSchedule {
  type: ReminderType;
  enabled: boolean;
  times: string[]; // "HH:mm", 24h clock, local to the device's timezone
  frequencyLabel: string; // e.g. "Once", "3 Meals, at different times"
}

interface ReminderState {
  reminders: Record<ReminderType, ReminderSchedule>;
  loading: boolean;

  fetchReminders: () => Promise<void>;
  toggleReminder: (type: ReminderType) => Promise<void>;
  setReminderTimes: (type: ReminderType, times: string[]) => Promise<void>;
  reset: () => void;
}

const FREQUENCY_LABELS: Record<ReminderType, (times: string[]) => string> = {
  workout: () => 'Once',
  meal: (t) => (t.length > 1 ? `${t.length} Meals, at different times` : 'Once'),
  water: (t) => (t.length > 1 ? `${t.length} times in a day` : 'Once'),
  walking: () => 'Once',
  weight: () => 'Once',
  healthLog: () => 'Once',
  medicine: () => 'Once',
};

const DEFAULT_TIMES: Record<ReminderType, string[]> = {
  workout: ['19:30'],
  meal: ['08:00', '13:00', '19:00'],
  water: ['09:00', '13:00', '17:00'],
  walking: ['08:00'],
  weight: ['07:00'],
  healthLog: ['20:00'],
  medicine: ['09:00'],
};

const REMINDER_TYPES: ReminderType[] = [
  'workout', 'meal', 'water', 'walking', 'weight', 'healthLog', 'medicine',
];

function defaultSchedule(type: ReminderType): ReminderSchedule {
  const times = DEFAULT_TIMES[type];
  return { type, enabled: false, times, frequencyLabel: FREQUENCY_LABELS[type](times) };
}

function defaultReminders(): Record<ReminderType, ReminderSchedule> {
  return Object.fromEntries(
    REMINDER_TYPES.map((type) => [type, defaultSchedule(type)])
  ) as Record<ReminderType, ReminderSchedule>;
}

export const useReminderStore = create<ReminderState>((set, get) => ({
  reminders: defaultReminders(),
  loading: false,

  // Hydrates from notification_preferences (migration 013). Every reminder
  // type starts disabled with sensible default times until a matching row
  // exists — a user who has never touched the Reminders screen has no rows
  // at all, so absence just means "not set yet," not an error.
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
        const times = (row.times as string[] | null) ?? DEFAULT_TIMES[type];
        reminders[type] = {
          type,
          enabled: row.enabled,
          times,
          frequencyLabel: FREQUENCY_LABELS[type](times),
        };
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

    // Optimistic local update — mirrors the UI-instant feel of the previous
    // local-only store — reverted below if the write fails.
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
          times: current.times,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,reminder_type' }
      );

    if (error) {
      set((state) => ({ reminders: { ...state.reminders, [type]: current } }));
      throw error;
    }
  },

  setReminderTimes: async (type, times) => {
    const userId = useAuthStore.getState().session?.user.id;
    if (!userId) return;

    const current = get().reminders[type];
    const frequencyLabel = FREQUENCY_LABELS[type](times);

    set((state) => ({
      reminders: { ...state.reminders, [type]: { ...current, times, frequencyLabel } },
    }));

    const { error } = await supabase
      .from('notification_preferences')
      .upsert(
        {
          user_id: userId,
          reminder_type: type,
          enabled: current.enabled,
          times,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,reminder_type' }
      );

    if (error) {
      set((state) => ({ reminders: { ...state.reminders, [type]: current } }));
      throw error;
    }
  },

  reset: () => set({ reminders: defaultReminders(), loading: false }),
}));
