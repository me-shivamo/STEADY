import { create } from 'zustand';
import { Alert } from 'react-native';
import { supabase } from '../api/supabase';
import { useAuthStore } from './authStore';
import { todayLocalDate } from '../utils/localDate';
import { track } from '../utils/analytics';

export type WaterEntry = {
  id: string;
  logged_date: string; // 'YYYY-MM-DD'
  amount_ml: number;
  logged_at: string | null;
};

interface WaterState {
  entries: WaterEntry[]; // today's entries only
  loading: boolean;

  fetchToday: () => Promise<void>;
  addEntry: (amount_ml: number) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
}

export const useWaterStore = create<WaterState>((set, get) => ({
  entries: [],
  loading: false,

  fetchToday: async () => {
    const userId = useAuthStore.getState().session?.user.id;
    if (!userId) return;

    set({ loading: true });

    const today = todayLocalDate();

    const { data, error } = await supabase
      .from('water_logs')
      .select('id, logged_date, amount_ml, logged_at')
      .eq('user_id', userId)
      .eq('logged_date', today)
      .order('logged_at', { ascending: true });

    if (!error && data) {
      set({ entries: data as WaterEntry[] });
    }
    set({ loading: false });
  },

  addEntry: async (amount_ml) => {
    const userId = useAuthStore.getState().session?.user.id;
    if (!userId) return;

    // Water is logged multiple times a day, unlike weight — plain insert,
    // no upsert/conflict target needed. logged_date is sent explicitly (the
    // device's local today) rather than relying on the column's CURRENT_DATE
    // default, which resolves in the database's UTC session timezone.
    const { data, error } = await supabase
      .from('water_logs')
      .insert({ user_id: userId, amount_ml, logged_date: todayLocalDate() })
      .select('id, logged_date, amount_ml, logged_at')
      .single();

    if (error || !data) {
      Alert.alert('Could not log water', 'Check your connection and try again.');
      return;
    }
    const entryIndex = get().entries.length; // 0-based count before this insert
    set((s) => ({ entries: [...s.entries, data as WaterEntry] }));
    // amount_ml is which preset button was tapped (250 / 500 / …), not a body
    // metric, so the exact value is both safe and the whole point — it tells
    // us whether the preset sizes we shipped match how people actually drink.
    // entry_index shows how deep into the day's logging streak this was.
    track('water_logged', { amount_ml, entry_index: entryIndex });
  },

  deleteEntry: async (id) => {
    const userId = useAuthStore.getState().session?.user.id;
    if (!userId) return;

    const { error } = await supabase.from('water_logs').delete().eq('id', id).eq('user_id', userId);
    if (error) {
      Alert.alert('Could not delete', 'Check your connection and try again.');
      return;
    }
    set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
    track('water_entry_deleted', {});
  },
}));
