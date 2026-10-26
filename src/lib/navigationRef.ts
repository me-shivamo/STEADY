import { createNavigationContainerRef } from '@react-navigation/native';

// ── Navigating from outside React ────────────────────────────────────────────
// React Navigation's useNavigation() hook only works inside a component that is
// mounted under the NavigationContainer. A notification tap is not that: it
// arrives from the OS, through expo-notifications, in a plain callback with no
// React context around it at all.
//
// createNavigationContainerRef() is the escape hatch for exactly this case. It
// creates a module-level handle (mentally: a global singleton pointer to the
// navigator) that RootNavigator attaches itself to on mount, and that any
// non-React code can then import and call. Same pattern as keeping a reference
// to a top-level window object in a desktop app.
export const navigationRef = createNavigationContainerRef<any>();

// Deep-link keys that a notification is allowed to target, mapped to the real
// screen names in AppNavigator.
//
// This is a whitelist rather than a straight pass-through on purpose. The value
// arrives inside the push payload, which means it has travelled through the
// Expo push service and back onto the device, and it is ultimately a string
// typed into a database row by whoever wrote the template. Passing it directly
// to navigate() would mean a typo silently no-ops and a bad value could push a
// screen that was never meant to be reachable this way. Mapping through a fixed
// table means only these seven destinations are ever possible.
//
// 'camera' points at Home because food logging is presented inside HomeScreen
// rather than as its own route.
const DEEP_LINKS: Record<string, string> = {
  home:      'Home',
  camera:    'Home',
  water:     'Water',
  weight:    'Weight',
  progress:  'Progress',
  reminders: 'Reminders',
  // Two destinations, because the two audiences are different. 'group' is for
  // people who already have one and should land on its activity. 'groups' is
  // for the discovery messages ("still not joined a group?"), whose readers by
  // definition have no group, so GroupHome would have nothing to show them.
  group:     'GroupHome',
  groups:    'GroupsIntro',
  chat:      'Home',
};

// Returns true if navigation actually happened, so callers can tell "went
// somewhere" from "ignored an unknown target".
export function navigateToDeepLink(target: string | undefined | null): boolean {
  if (!target) return false;

  const screen = DEEP_LINKS[target.toLowerCase()];
  if (!screen) {
    console.warn(`navigateToDeepLink: unknown target "${target}" — ignoring.`);
    return false;
  }

  // isReady() guards the cold-start race. When a notification launches the app
  // from killed state, the tap handler can fire before the NavigationContainer
  // has finished mounting, and navigating then throws. Callers handle the
  // false return by retrying once the container is ready.
  if (!navigationRef.isReady()) return false;

  navigationRef.navigate(screen as never);
  return true;
}
