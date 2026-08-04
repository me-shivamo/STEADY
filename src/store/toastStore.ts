import { create } from 'zustand';

/**
 * Global transient-confirmation state.
 *
 * WHY A STORE RATHER THAN LOCAL STATE
 * -----------------------------------
 * The bug that prompted this: MealCard's "Add to saved entries" handler set a
 * local `justSaved` flag and rendered the confirmation *inside* the options
 * Modal — but the same handler closed that Modal on the line above. The
 * confirmation was mounted into a container that was being unmounted, so it
 * could never be seen. Any local-state approach has that shape of problem
 * whenever the thing being confirmed also dismisses the UI you're confirming in.
 *
 * Hoisting it to a store decouples "something happened" (any component, any
 * depth, even one about to unmount) from "show a message" (one host mounted
 * once, near the navigation root, that outlives every screen and sheet).
 *
 * Mental model: this is a tiny event bus with exactly one slot. `show()` is a
 * fire-and-forget publish; ToastHost is the sole subscriber. Zustand is already
 * the app's state layer, so this adds no new dependency — think of the store as
 * a module-level singleton whose subscribers re-render when it changes.
 */

export type ToastKind = 'success' | 'error' | 'info';

interface ToastState {
  message: string | null;
  kind: ToastKind;
  /** Bumped on every show() so repeat calls with identical text still re-trigger
   *  the animation instead of being treated as "no change" by React. */
  token: number;
  show: (message: string, kind?: ToastKind) => void;
  hide: () => void;
}

export const useToastStore = create<ToastState>((set, get) => ({
  message: null,
  kind: 'success',
  token: 0,
  show: (message, kind = 'success') =>
    set({ message, kind, token: get().token + 1 }),
  hide: () => set({ message: null }),
}));

/** Convenience for call sites that don't need the hook (handlers, stores). */
export const toast = {
  success: (m: string) => useToastStore.getState().show(m, 'success'),
  error: (m: string) => useToastStore.getState().show(m, 'error'),
  info: (m: string) => useToastStore.getState().show(m, 'info'),
};
