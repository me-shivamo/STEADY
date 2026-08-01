import { create } from 'zustand';
import { supabase } from '../api/supabase';

interface AdminPingState {
  count: number | null;
  loading: boolean;

  fetchCount: () => Promise<void>;
  ping: () => Promise<number | null>;
}

// Tiny store around the `admin_pings` singleton row + increment_admin_ping()
// RPC (see supabase/migrations/017_admin_pings.sql). The count is global —
// every user shares the same number — so this intentionally does not key
// anything by user_id the way weightStore etc. do.
export const useAdminPingStore = create<AdminPingState>((set) => ({
  count: null,
  loading: false,

  fetchCount: async () => {
    set({ loading: true });
    const { data, error } = await supabase
      .from('admin_pings')
      .select('count')
      .eq('id', 1)
      .single();

    if (!error && data) {
      set({ count: data.count });
    }
    set({ loading: false });
  },

  ping: async () => {
    const { data, error } = await supabase.rpc('increment_admin_ping');
    if (error || data == null) return null;
    set({ count: data });
    return data;
  },
}));
