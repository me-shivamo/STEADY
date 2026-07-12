import { create } from 'zustand';
import { Alert } from 'react-native';
import { supabase } from '../api/supabase';
import { useAuthStore } from './authStore';

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

    const today = new Date().toISOString().split('T')[0];

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
    // no upsert/conflict target needed.
    const { data, error } = await supabase
      .from('water_logs')
      .insert({ user_id: userId, amount_ml })
      .select('id, logged_date, amount_ml, logged_at')
      .single();

    if (error || !data) {
      Alert.alert('Could not log water', 'Check your connection and try again.');
      return;
    }
    set((s) => ({ entries: [...s.entries, data as WaterEntry] }));
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
  },
}));
