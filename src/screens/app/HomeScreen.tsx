import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ActivityIndicator,
  PanResponder,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppStackParamList } from '../../navigation/types';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { resizeForUpload } from '../../utils/imageResize';
import MealCard from '../../components/nutrition/MealCard';
import WaterHomeCard from '../../components/nutrition/WaterHomeCard';
import { useWaterStore } from '../../store/waterStore';
import { useFoodLogStore, MealCard as MealCardType, todayDate } from '../../store/foodLogStore';
import { useAuthStore } from '../../store/authStore';
import { homeColors as C } from '../../theme/homeColors';
import ProfileDrawer from '../../components/profile/ProfileDrawer';
import DatePickerSheet from '../../components/common/DatePickerSheet';
import SavedEntriesSheet from '../../components/nutrition/SavedEntriesSheet';
import ImageViewerModal from '../../components/common/ImageViewerModal';
import { useSavedEntriesStore } from '../../store/savedEntriesStore';
import { supabase } from '../../api/supabase';
import { toLocalDateString } from '../../utils/localDate';
import { useStreak } from '../../hooks/useStreak';
import { fontFamily } from '../../theme/typography';
import TypewriterText from '../../components/common/TypewriterText';
import { useScreenChrome } from '../../hooks/useScreenChrome';
import { track } from '../../utils/analytics';
import { toUserMessage } from '../../utils/errors';

// ── Chat message types ─────────────────────────────────────────────────────────
type ChatMsg =
  // imageUri carries the photo the user attached. Without this field there was
  // nowhere to put it, so a photo-logged meal produced either a bare text
  // bubble (caption case) or no bubble at all (photo-only case) — the message
  // never showed that an image had been sent.
  | { id: string; type: 'user';      text: string; sentAt?: string; imageUri?: string }
  | { id: string; type: 'thinking' }
  | { id: string; type: 'meal_card'; meal: MealCardType }
  | { id: string; type: 'answer';    text: string; sentAt?: string }
  | { id: string; type: 'error';     text: string };

// Formats an ISO timestamp as a short local time (e.g. "12:30 PM") for display
// inside chat bubbles. Falls back to an empty string for messages sent before
// this field existed, so old rows just render without a time rather than crashing.
function formatBubbleTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// Builds the invisible width-reserver that makes WhatsApp-style bubble
// timestamps work. RN has no "float this right inside a paragraph", so the
// timestamp is rendered twice:
//
//   1. This spacer — a transparent copy of the time appended to the message
//      text. It draws nothing but still occupies width, so the text layout
//      engine keeps exactly enough room for the real time at the end of the
//      last line. When the last line is too full, the spacer wraps instead,
//      creating the empty final line WhatsApp shows on long messages.
//   2. The real time, absolutely positioned at the bubble's bottom-right, so
//      it lands right-aligned whether the spacer stayed on the last line or
//      wrapped to a new one.
//
// The spaces are non-breaking so the reserved block can never itself be split
// across two lines, which would put the real time over the message text.
function timeSpacer(time: string): string {
  const NBSP = '\u00A0';
  return NBSP.repeat(3) + time.replace(/ /g, NBSP);
}

let _id = 0;
const uid = () => String(++_id);

// Applies a freshly-fetched history thread to the feed WITHOUT discarding
// anything the user added while that fetch was in flight.
//
// loadAndMergeHistory awaits two network round trips before it can build
// `merged`, and handleSend can push a user bubble + a "thinking" bubble into
// `messages` during that gap. A plain setMessages(merged) overwrote them, and
// because replace() is a .map() over the list, the later
// replace(thinkingId, card) then matched nothing and silently did nothing —
// so a meal logged in those first few hundred ms never appeared in Log +
// Coach at all (it still reached Food log and the totals, which read the
// store directly). Anything `prev` has that the fetched thread doesn't is by
// definition newer than everything in it, so it belongs on the end.
//
// In the normal case `prev` is empty — the initial state, or cleared by the
// selectedDate effect — so this returns `next` unchanged.
function mergeKeepingOptimistic(prev: ChatMsg[], next: ChatMsg[]): ChatMsg[] {
  if (prev.length === 0) return next;
  const nextIds = new Set(next.map(m => m.id));
  const optimistic = prev.filter(m => !nextIds.has(m.id));
  return optimistic.length === 0 ? next : [...next, ...optimistic];
}

// ── MacroCol — one column of the 3-column macro grid ─────────────────────────
function MacroCol({ label, current, goal, dotColor }: {
  label: string; current: number; goal: number; dotColor: string;
}) {
  const pct = goal > 0 ? Math.min(current / goal, 1) : 0;
  return (
    <View style={styles.macroCol}>
      <View style={styles.macroColHeader}>
        <View style={[styles.macroDot, { backgroundColor: dotColor }]} />
        <Text style={styles.macroLabel}>{label}</Text>
      </View>
      <Text style={styles.macroValue}>
        {Math.round(current)}<Text style={styles.macroGoal}> / {goal}g</Text>
      </Text>
      <View style={styles.macroTrack}>
        <View style={{ height: 5, width: `${pct * 100}%` as `${number}%`, backgroundColor: dotColor, borderRadius: 3 }} />
      </View>
    </View>
  );
}

// Greeting variants for the typewriter intro — picked once per mount so the
// first-time experience doesn't feel identical on every fresh install.
// `{name}` is replaced with the user's first name when we have one, or the
// whole clause is dropped for a name-less variant when we don't (see
// buildGreetings below) — every entry here must read naturally either way.
// Shown to brand-new accounts (profile created today) — no "welcome back" /
// "missed you" framing, since there's no history to be back to yet.
const FIRST_TIME_GREETINGS = [
  "Hey{name} 👋 I'm STEADY, your slightly sarcastic food tracker. Tell me what you ate and I'll do the boring math.",
  "Well well{name} 🕵️ a brand-new log, completely empty. Let's put something on it. Tell me what you had.",
  "Welcome aboard{name} ✨ your log is a blank canvas. Describe a meal or send a pic to get it started.",
  "Hi{name} 🤖 first time here. Describe a meal, in plain English, and I'll handle the calorie and macro math.",
  "Hey{name}, ready when you are 🍽️ your plate's a mystery to me so far. Spill the details.",
  "Let's get this show on the road{name} 🎬 nothing's logged yet and the suspense is killing me.",
  "Hi{name} 🧾 no need to overthink it, just tell me what you ate, typos and all. I've seen worse.",
  "Good to see a new face{name} 👀 tell me what's on your plate and I'll take it from here.",
];

// Shown to accounts that have been around a while — safe to reference
// history, streaks, and the fact that today's log is currently empty.
const RETURNING_GREETINGS = [
  "Welcome back{name} 🔄 your log missed you. Mostly it just missed having any data in it.",
  "Hey{name}, glad you're here 😌 now less glad that your food log is a ghost town today. Let's fix that.",
  "Good to see you{name} 👀 zero calories logged so far today. Either you're fasting or procrastinating, tell me which.",
  "Hi again{name} 🕵️ today's log is suspiciously empty. I promise I won't judge... much. Tell me what you had.",
  "Back for more{name} ✨ today's a clean slate so far. Fix that?",
  "Hey{name} 👋 today's plate is looking suspiciously empty. Tell me what you ate and I'll do the boring math.",
  "Hi{name} 🤖 today's a blank page in your log so far. Describe a meal or send a pic, I'll take it from here.",
  "Hey{name}, ready for round two 🍽️ today's still a mystery to me. Spill the details.",
];

// Fills in a greeting pool's "{name}" placeholder: if we have a first name it
// becomes ", Shivam"; otherwise it's dropped entirely so the sentence still
// reads naturally without one (e.g. "Hey! Tell me..." vs "Hey, Shivam! Tell me...").
function buildGreetings(templates: string[], firstName: string | null): string[] {
  const suffix = firstName ? `, ${firstName}` : '';
  return templates.map(t => t.replace('{name}', suffix));
}

// Example prompts shown under the greeting so first-time users know the
// expected input shape. Kept strictly vegetarian across all variants.
const TRY_EXAMPLES = [
  'Try: "40g paneer with 80g moong sprouts, one tomato, and half an onion"',
  'Try: "150g curd rice with a spoon of pickle"',
  'Try: "2 rotis, 100g paneer bhurji, and a cucumber salad"',
  'Try: "30g peanut butter on toast with one banana"',
  'Try: "200g veg pulao with 100g raita"',
  'Try: "1 bagel with 30g cream cheese"',
  'Try: "1 cup dal, 150g rice, and a glass of buttermilk"',
  'Try: "150g Greek yogurt with 30g granola and a spoon of honey"',
];

// ── WelcomeBubble — shown on today when no meals logged ───────────────────────
function WelcomeBubble({ firstName, isFirstTime }: { firstName: string | null; isFirstTime: boolean }) {
  // Picked once per mount. Kept as two separate strings (rather than one
  // joined block) because TypewriterText splits on plain spaces — a literal
  // "\n" inside its input gets swallowed by the word-join during typing and
  // only reappears once fully revealed, which reflowed the two lines into a
  // ragged single line mid-animation. Rendering the example as a plain,
  // always-visible bold <Text> avoids feeding it through that split at all.
  const [greeting] = useState(() => {
    const pool = isFirstTime ? FIRST_TIME_GREETINGS : RETURNING_GREETINGS;
    return buildGreetings(pool, firstName)[Math.floor(Math.random() * pool.length)];
  });
  const [example] = useState(() =>
    TRY_EXAMPLES[Math.floor(Math.random() * TRY_EXAMPLES.length)]
  );
  const [introDone, setIntroDone] = useState(false);

  return (
    <View style={styles.aiBubbleRow}>
      <View style={styles.aiBubble}>
        <TypewriterText text={greeting} onDone={() => setIntroDone(true)} style={styles.aiBubbleText} />
        {introDone && (
          <Text style={[styles.aiBubbleText, { fontWeight: '700', fontFamily: fontFamily.bold }]}>
            {'\n'}{example}
          </Text>
        )}
      </View>
    </View>
  );
}

// ── EmptyHistoryBubble — shown on past days with no logs ──────────────────────
function EmptyHistoryBubble({ date }: { date: string }) {
  return (
    <View style={styles.aiBubbleRow}>
      <View style={styles.aiBubble}>
        <Text style={styles.aiBubbleText}>
          🕳️ <Text style={{ fontWeight: '700', fontFamily: fontFamily.bold }}>{date}</Text> is a total blank, not one bite on record.
          {'\n'}Ask me about your goals instead, I'm still around 💬
        </Text>
      </View>
    </View>
  );
}

// ── HomeScreen ────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  useScreenChrome(C.bg, 'dark');
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const [mode, setMode]               = useState<'logs' | 'all'>('all');
  const [messages, setMessages]       = useState<ChatMsg[]>([]);
  const [isLoadingChat, setIsLoadingChat] = useState(true);
  const [input, setInput]             = useState('');
  const [drawerOpen, setDrawerOpen]   = useState(false);
  // Real measured height of topBar — KeyboardAvoidingView only knows its own
  // frame, not this sibling's height above it, so without this offset it
  // under-pads by exactly topBar's height and the keyboard covers the composer.
  const [topBarHeight, setTopBarHeight] = useState(0);

  // ── Keyboard handling (Android) ────────────────────────────────────────
  // We track the keyboard height ourselves on Android instead of letting
  // KeyboardAvoidingView do it, because RN's Android implementation cannot
  // return to zero.
  //
  // The mechanism, for the record: on Android, KAV subscribes to BOTH
  // keyboardDidShow and keyboardDidHide and feeds both into the same handler,
  // which reads `event.endCoordinates.screenY`. But RN's native side fills that
  // field differently per event — on show it is a real Y coordinate, on hide it
  // is the visible frame's HEIGHT. The height is the larger number, so the
  // "reset" arithmetic lands on the status-bar height instead of 0, and KAV's
  // own `if (this._keyboardEvent == null) setBottom(0)` early-out never fires
  // because the hide event is non-null. The result is a permanent gap exactly
  // as tall as the status bar, which is the phantom padding on this screen.
  //
  // Two listeners with an explicit 0 on hide cannot drift: the reset is a
  // literal, not a computation.
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    // 'Did' rather than 'Will' — keyboardWillShow/Hide never fire on Android.
    const showSub = Keyboard.addListener('keyboardDidShow', (e) =>
      setKeyboardHeight(e.endCoordinates.height),
    );
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const isAndroid = Platform.OS === 'android';
  const keyboardOpen = keyboardHeight > 0;

  // Lift the composer clear of the keyboard on Android. The `+ insets.bottom` is
  // not a fudge factor — `endCoordinates.height` genuinely is NOT the distance
  // from the screen bottom to the top of the keyboard.
  //
  // React Native computes it in ReactRootView.java:902-904 as:
  //     imeInsets.bottom - barInsets.bottom
  // i.e. the keyboard inset with the system bars SUBTRACTED. Because we run
  // edge-to-edge, our root view extends under the navigation bar, so the gap we
  // actually need to clear is the full `imeInsets.bottom`. Lifting by the
  // reported height alone leaves the composer short by exactly the nav-bar
  // height — ~48dp with 3-button navigation, which is why it stayed tucked
  // behind the keyboard on-device even though the dismiss side worked.
  //
  // Only true on API 30+. The legacy pre-Android-11 path
  // (checkForKeyboardEventsLegacy) computes `heightPixels - visibleArea.bottom
  // + notch`, which already includes the nav bar — adding the inset there would
  // over-lift by the same 48dp and leave a gap above the keyboard. Hence the
  // version gate rather than an unconditional addition.
  const androidKeyboardLift =
    isAndroid && keyboardOpen
      ? keyboardHeight + (Number(Platform.Version) >= 30 ? insets.bottom : 0)
      : 0;
  // The bottom safe-area inset now lives on the composer rather than on
  // SafeAreaView, so the composer's own card background fills the gesture/nav
  // bar strip instead of leaving a bare band in the page colour. It collapses
  // while the keyboard is up, because the nav bar is covered by the keyboard
  // then and the inset would read as dead space above it.
  const composerBottomPad = keyboardOpen ? 0 : insets.bottom;
  const [pickerOpen, setPickerOpen]   = useState(false);
  // pendingPhoto holds the local URI (for the thumbnail preview) and base64
  // string (for the Edge Function). null means no photo is queued.
  const [pendingPhoto, setPendingPhoto] = useState<{ uri: string; base64: string } | null>(null);
  const [photoErrorText, setPhotoErrorText] = useState<string | null>(null);
  // Non-null = full-screen photo preview open (attached photos in chat bubbles).
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [savedEntriesSheetOpen, setSavedEntriesSheetOpen] = useState(false);
  const scrollRef                   = useRef<ScrollView>(null);
  const cardRefs                    = useRef<Map<string, View | null>>(new Map());
  const initialSeedDone             = useRef(false);

  const {
    meals, totals, fetchEntriesForDate, logMealFromText, logMealFromPhoto, isLogging,
    isFetchingDate, selectedDate, setSelectedDate,
  } = useFoodLogStore();
  const { profile, updateProfile } = useAuthStore();
  const logSavedEntry = useSavedEntriesStore(s => s.logSavedEntry);

  // Keep a ref to selectedDate so the PanResponder closure (created once)
  // always reads the live value — not the stale one captured at mount time.
  const selectedDateRef = useRef(selectedDate);
  useEffect(() => { selectedDateRef.current = selectedDate; }, [selectedDate]);

  // PanResponder watches horizontal finger movement on the content area.
  // onMoveShouldSetPanResponder claims the gesture only when horizontal
  // movement dominates — so vertical scrolling still works normally.
  // 50px release threshold separates an intentional swipe from a small drift.
  const swipeResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderRelease: (_, g) => {
        const current = selectedDateRef.current;
        const d = new Date(current + 'T12:00:00');
        if (g.dx < -50) {
          // swipe left → next day (blocked if already on today)
          d.setDate(d.getDate() + 1);
          const next = toLocalDateString(d);
          if (next <= todayDate()) {
            useFoodLogStore.getState().setSelectedDate(next);
            track('log_date_changed', { direction: 'next', is_today: next === todayDate() });
          }
        } else if (g.dx > 50) {
          // swipe right → previous day
          d.setDate(d.getDate() - 1);
          useFoodLogStore.getState().setSelectedDate(toLocalDateString(d));
          // Back-filling yesterday is a very different habit from logging live,
          // and the two are indistinguishable without this.
          track('log_date_changed', { direction: 'previous', is_today: false });
        }
      },
    })
  ).current;

  const isViewingToday = selectedDate === todayDate();

  // Initial load
  useEffect(() => { fetchEntriesForDate(); }, []);

  // When the selected date changes: clear messages and trigger a fresh merge load.
  useEffect(() => {
    initialSeedDone.current = false;
    setMessages([]);
    setIsLoadingChat(true);
  }, [selectedDate]);

  // When meals for the current date arrive from the store (or change), merge them
  // with chat_messages from Supabase into a single time-ordered thread.
  //
  // Why wait for `meals` here instead of loading chat independently?
  // Because MealCards need full food_entries data that only the store has. We can't
  // reconstruct a MealCard from chat_messages alone — it only stores a text confirmation.
  // So the pattern is: meals arrive first (from the store), then we fetch chat rows,
  // merge both by created_at, and set messages once — no double-render flash.
  //
  // After the initial merge, subsequent meals changes (edits, deletes) are synced
  // in-place so the feed updates immediately without re-fetching chat history.
  useEffect(() => {
    if (isFetchingDate) return; // wait for meal fetch to complete first

    if (!initialSeedDone.current) {
      // Initial load for this date: fetch chat history and merge with meals
      loadAndMergeHistory(meals, selectedDate);
      return;
    }

    // After initial seed: sync meal card updates in-place (edits, deletes)
    // without touching the chat bubble messages — EXCEPT when a card's
    // created_at actually changed (via Change Date & Time), in which case
    // the whole feed is re-sorted so the card moves to its new chronological
    // position instead of staying frozen where it was first inserted.
    const mealsById = new Map(meals.map(m => [m.id, m]));
    setMessages(prev => {
      let timeChanged = false;
      const updated = prev
        // Remove cards for deleted meals, update cards for edited meals.
        //
        // Match on msg.meal.id — NOT msg.id. A message's id is only its React
        // key: cards restored by loadAndMergeHistory happen to use the meal id,
        // but a card created live by handleSend inherits the throwaway uid of
        // the "thinking" bubble it replaced ("7"). Looking up msg.id therefore
        // missed every just-logged card, and this filter read that miss as
        // "the meal was deleted" and dropped the card out of the chat feed the
        // next time the store changed (e.g. right after Adjust Macros saved).
        // msg.meal.id is the meal_log id on every card, whatever path made it.
        .filter(msg => msg.type !== 'meal_card' || mealsById.has(msg.meal.id))
        .map(msg => {
          if (msg.type !== 'meal_card') return msg;
          const nextMeal = mealsById.get(msg.meal.id);
          if (!nextMeal) return msg;
          if (nextMeal.created_at !== msg.meal.created_at) timeChanged = true;
          return { ...msg, meal: nextMeal };
        });

      if (!timeChanged) return updated;

      const tsOf = (msg: ChatMsg): string =>
        msg.type === 'meal_card' ? msg.meal.created_at : '';
      // Non-timestamped messages (thinking/answer/error bubbles) have no
      // created_at to sort by — localeCompare treats '' as always-earliest,
      // which would yank them to the top. Keep every non-meal-card message
      // pinned at its current index and only re-sort the meal cards among
      // themselves, merged back into those fixed slots.
      const cardIndices = updated
        .map((msg, i) => (msg.type === 'meal_card' ? i : -1))
        .filter(i => i !== -1);
      const sortedCards = cardIndices
        .map(i => updated[i])
        .sort((a, b) => tsOf(a).localeCompare(tsOf(b)));
      const resorted = [...updated];
      cardIndices.forEach((slot, k) => { resorted[slot] = sortedCards[k]; });
      return resorted;
    });
  }, [meals, isFetchingDate, selectedDate]);

  // Fetches today's (or any date's) chat_messages from Supabase, merges with
  // the already-loaded MealCards, sorts everything by created_at, and sets messages.
  async function loadAndMergeHistory(currentMeals: MealCardType[], date: string) {
    setIsLoadingChat(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch only user bubbles and AI text replies — skip food_log_confirmation
      // rows because those are already represented by the MealCard from the store.
      const { data: chatRows } = await supabase
        .from('chat_messages')
        .select('id, role, content, message_type, created_at')
        .eq('user_id', user.id)
        .eq('chat_date', date)
        .in('role', ['user', 'assistant'])
        .neq('message_type', 'food_log_confirmation')
        .order('created_at', { ascending: true });

      // Build timestamped entries for both sources so we can sort them together.
      type Stamped = { ts: string; msg: ChatMsg };

      const mealEntries: Stamped[] = currentMeals.map(meal => ({
        ts: meal.created_at,
        msg: { id: meal.id, type: 'meal_card' as const, meal },
      }));

      const chatEntries: Stamped[] = (chatRows ?? []).map(row => ({
        // created_at is nullable in the row type; a null would crash the
        // .localeCompare sort below and silently drop the day's chat history.
        ts: row.created_at ?? '',
        msg: row.role === 'user'
          ? { id: row.id, type: 'user' as const, text: row.content, sentAt: row.created_at ?? undefined }
          : { id: row.id, type: 'answer' as const, text: row.content, sentAt: row.created_at ?? undefined },
      }));

      // Merge and sort by timestamp — this gives the correct interleaved order:
      // user bubble → AI reply → MealCard → user bubble → etc.
      const merged = [...mealEntries, ...chatEntries]
        .sort((a, b) => a.ts.localeCompare(b.ts))
        .map(e => e.msg);

      setMessages(prev => mergeKeepingOptimistic(prev, merged));
      initialSeedDone.current = true;
    } catch {
      // Non-fatal: fall back to showing meals only
      setMessages(prev => mergeKeepingOptimistic(
        prev,
        currentMeals.map(meal => ({ id: meal.id, type: 'meal_card' as const, meal })),
      ));
      initialSeedDone.current = true;
    } finally {
      setIsLoadingChat(false);
    }
  }

  const push    = (msg: ChatMsg) => setMessages(prev => [...prev, msg]);
  const replace = (id: string, msg: ChatMsg) =>
    setMessages(prev => prev.map(m => (m.id === id ? msg : m)));

  // Re-logging a saved entry never calls the AI, so there's no "thinking"
  // bubble step — the card just appears in the feed immediately.
  const handleLogSavedEntry = async (entryId: string) => {
    try {
      const meal = await logSavedEntry(entryId);
      push({ id: meal.id, type: 'meal_card', meal });
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err: any) {
      push({ id: uid(), type: 'error', text: toUserMessage(err, 'logMeal') });
    }
  };

  // Open the OS native camera. On success, stores the local URI + base64 in
  // pendingPhoto so the composer shows a thumbnail and the send button is ready.
  const handleCameraPress = async () => {
    setPhotoErrorText(null);
    // Photo logging is a four-stage funnel and every stage can lose someone:
    // tapped the button → granted permission → actually took a shot → the AI
    // parsed it. Only the last stage is visible from the store, so the first
    // three are captured here. A big gap at any one of them points somewhere
    // completely different (bad affordance / scary prompt / bad camera UX).
    track('photo_capture_started', { source: 'camera' });
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    track('camera_permission_result', { granted: permission.granted, source: 'camera' });
    if (!permission.granted) {
      setPhotoErrorText('Please allow camera access in your device Settings to log food by photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.7,   // 70% quality — sharp enough for food ID, smaller payload
      base64: true,   // we need this to send to the Edge Function
      allowsEditing: false,
    });
    if (result.canceled) {
      track('photo_capture_cancelled', { source: 'camera' });
      return;
    }
    if (result.assets[0]?.base64) {
      const asset = result.assets[0];
      track('photo_attached', { source: 'camera' });
      // Downscale before it ever leaves the device — a raw phone photo can be
      // several MB, and that same base64 string gets sent twice server-side
      // (once to Storage, once to OpenRouter), so shrinking here speeds up
      // both the upload and the vision call.
      const base64 = await resizeForUpload(asset.uri, asset.width, asset.height);
      setPendingPhoto({ uri: asset.uri, base64 });
    }
  };

  // Open the photo library (gallery) as an alternative to the live camera.
  const handleGalleryPress = async () => {
    setPhotoErrorText(null);
    track('photo_capture_started', { source: 'library' });
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    track('camera_permission_result', { granted: permission.granted, source: 'library' });
    if (!permission.granted) {
      setPhotoErrorText('Please allow photo library access in your device Settings.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      base64: true,
      allowsEditing: false,
    });
    if (result.canceled) {
      track('photo_capture_cancelled', { source: 'library' });
      return;
    }
    if (result.assets[0]?.base64) {
      const asset = result.assets[0];
      track('photo_attached', { source: 'library' });
      const base64 = await resizeForUpload(asset.uri, asset.width, asset.height);
      setPendingPhoto({ uri: asset.uri, base64 });
    }
  };

  const handleSend = async () => {
    if (isLogging) return;

    // ── Photo flow: a photo is queued ────────────────────────────────────────
    if (pendingPhoto) {
      const caption = input.trim();
      const photoToSend = pendingPhoto;
      setPendingPhoto(null);
      setInput('');
      setMode('all');
      initialSeedDone.current = true;
      // Always push the bubble now, not just when there's a caption: a
      // photo-only log previously pushed nothing, so the thread jumped straight
      // to "thinking" with no record of what the user had sent.
      push({
        id: uid(),
        type: 'user',
        text: caption,
        imageUri: photoToSend.uri,
        sentAt: new Date().toISOString(),
      });
      const thinkingId = uid();
      push({ id: thinkingId, type: 'thinking' });
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
      try {
        const result = await logMealFromPhoto(photoToSend.base64, 'image/jpeg', caption || undefined);
        // Key the card by the meal id (not the thinking bubble's uid) so it
        // matches how loadAndMergeHistory builds restored cards — one id
        // scheme for meal cards, whichever path created them.
        replace(thinkingId, { id: result.meal.id, type: 'meal_card', meal: result.meal });
      } catch (err: any) {
        replace(thinkingId, {
          id: thinkingId, type: 'error',
          text: toUserMessage(err, 'logMeal'),
        });
      }
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      return;
    }

    // ── Text flow: normal chat message ───────────────────────────────────────
    const text = input.trim();
    if (!text) return;
    initialSeedDone.current = true;
    setInput('');
    setMode('all');
    push({ id: uid(), type: 'user', text, sentAt: new Date().toISOString() });
    const thinkingId = uid();
    push({ id: thinkingId, type: 'thinking' });
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    try {
      const result = await logMealFromText(text);
      if (result.type === 'answer') {
        replace(thinkingId, { id: thinkingId, type: 'answer', text: result.reply, sentAt: new Date().toISOString() });
        // The water insert (if any) happened server-side inside the edge
        // function — nothing on the client knows about it yet. Refresh the
        // water store only when the AI actually called log_water, so a plain
        // "how am I doing?" chat turn doesn't cost an extra fetch.
        if (result.waterLogged) {
          useWaterStore.getState().fetchToday();
        }
      } else {
        if (isViewingToday) {
          // Same as the photo flow: key by meal id, not the thinking uid.
          replace(thinkingId, { id: result.meal.id, type: 'meal_card', meal: result.meal });
        } else {
          const kcal = Math.round(result.meal.entries.reduce((s, e) => s + e.calories, 0));
          replace(thinkingId, {
            id: thinkingId, type: 'answer',
            text: `That looks like about ${kcal} kcal. Switch to Today to log new meals.`,
            sentAt: new Date().toISOString(),
          });
        }
      }
    } catch (err: any) {
      replace(thinkingId, {
        id: thinkingId, type: 'error',
        text: toUserMessage(err, 'logMeal'),
      });
    }
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  // Goals — profile.calorie_goal is only null when onboarding was skipped
  // (see OnboardingGoalScreen's "Skip for now") or manually cleared; the
  // summary card shows a "finish your profile" prompt instead of guessing.
  const hasCalorieGoal = profile?.calorie_goal != null;
  const calorieGoal = profile?.calorie_goal   ?? 2000;
  const proteinGoal = profile?.protein_goal_g  ?? 150;
  const carbGoal    = profile?.carb_goal_g     ?? 200;
  const fatGoal     = profile?.fat_goal_g      ?? 60;

  // Tapping the setup card sends the user back into onboarding to actually
  // finish it. RootNavigator swaps its ENTIRE tree — Onboarding vs. App —
  // based purely on profile.onboarding_complete (see RootNavigator.tsx), and
  // the two stacks are siblings, not nested, so there's no navigate() call
  // that can jump from here directly into OnboardingNavigator. Flipping this
  // one flag is the actual mechanism: RootNavigator re-renders, decides
  // showOnboarding is now true, and mounts OnboardingNavigator on its own,
  // starting at step 1 — same declarative pattern OnboardingRevealScreen
  // already uses to LEAVE onboarding (sets it true), just run in reverse.
  // Completing the flow for real this time sets it back to true and swaps
  // back to AppNavigator → Home automatically, no extra "return" code needed.
  const handleResumeOnboarding = async () => {
    try {
      await updateProfile({ onboarding_complete: false });
    } catch {
      // Swallow: updateProfile already surfaces its own errors upstream via
      // its own error handling; if it fails, the user just stays on Home.
    }
  };
  // Real streak from daily_summaries; meals.length retriggers it so the chip
  // ticks over right after the first log of the day.
  const streak      = useStreak(meals.length) ?? 0;
  const remaining   = calorieGoal - totals.calories;

  // Date label — derives from selectedDate, not hardcoded to today
  const selectedDateObj = new Date(selectedDate + 'T12:00:00');
  const dayName   = isViewingToday ? 'Today' : selectedDateObj.toLocaleDateString('en-US', { weekday: 'long' });
  const dateLabel = selectedDateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

  // Feed: 'logs' mode shows only stored MealCards; 'all' shows full chat thread
  const shownMessages: ChatMsg[] = mode === 'logs'
    ? meals.map(m => ({ id: m.id, type: 'meal_card' as const, meal: m }))
    : messages;

  return (
    // 'bottom' is deliberately NOT in edges: SafeAreaView would apply the
    // bottom inset permanently, leaving a bare strip in the page colour under
    // the composer AND keeping that strip while the keyboard is open. The
    // composer applies the inset itself via composerBottomPad, so the card
    // colour runs all the way into the gesture bar — the WhatsApp/iMessage
    // arrangement.
    <SafeAreaView style={styles.safe} edges={['top']}>

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <View style={styles.topBar} onLayout={e => setTopBarHeight(e.nativeEvent.layout.height)}>
        <TouchableOpacity style={styles.menuBtn} activeOpacity={0.7} onPress={() => setDrawerOpen(true)}>
          <Ionicons name="menu-outline" size={26} color={C.text} />
        </TouchableOpacity>

        {/* Date block — taps open/close the calendar picker */}
        <TouchableOpacity
          style={styles.dateBlock}
          activeOpacity={0.7}
          onPress={() => setPickerOpen(p => !p)}
        >
          <Text style={styles.dateSub}>{dayName}</Text>
          <View style={styles.dateLabelRow}>
            <Text style={styles.datePrimary}>{dateLabel}</Text>
            <Ionicons
              name={pickerOpen ? 'chevron-up' : 'chevron-down'}
              size={15}
              color={C.accent}
              style={{ marginTop: 2 }}
            />
          </View>
        </TouchableOpacity>

        {/* Right side: groups shortcut + streak chip */}
        <View style={styles.topRight}>
          <TouchableOpacity
            style={styles.groupsBtn}
            activeOpacity={0.7}
            onPress={() => {
              track('home_quick_action_tapped', { action: 'groups' });
              navigation.navigate('GroupsIntro');
            }}
          >
            <Ionicons name="people-outline" size={20} color={C.text} />
          </TouchableOpacity>
          <View style={styles.streakChip}>
            <Text style={styles.streakText}>🔥 {streak} days</Text>
          </View>
        </View>
      </View>

      {/* ── Fixed header: date picker + calorie/macro card ────────────────
          Deliberately OUTSIDE the ScrollView below — anything not inside a
          ScrollView never moves when the user scrolls, so this stays pinned
          while only the feed scrolls underneath it. The date picker used to
          live inside the scroll and "push content down" when opened; now
          that it's a sibling, opening it instead grows this fixed block's
          own height, which shrinks the flex:1 ScrollView beneath it by the
          same amount — same visual effect, correctly contained. ────────── */}
      <View style={styles.fixedHeader}>
        <DatePickerSheet
          visible={pickerOpen}
          selectedDate={selectedDate}
          onSelectDate={(date) => {
            setSelectedDate(date);
            track('log_date_changed', { direction: 'calendar', is_today: date === todayDate() });
          }}
        />

        {/* ── Calorie summary card (or a setup prompt if goals aren't set) ── */}
        {hasCalorieGoal ? (
          <View style={styles.summaryCard}>
            {/* headline row: calories eaten / goal  +  remaining pill */}
            <View style={styles.summaryHeadRow}>
              <Text style={styles.calorieHeadline}>
                {Math.round(totals.calories).toLocaleString()}
                <Text style={styles.calorieGoalText}>
                  {'  /  '}{calorieGoal.toLocaleString()} kcal
                </Text>
              </Text>
              <View style={[styles.remainingPill, remaining < 0 && styles.remainingPillOver]}>
                <Text style={[styles.remainingPillText, remaining < 0 && styles.remainingPillTextOver]}>
                  {remaining >= 0
                    ? `${Math.round(remaining).toLocaleString()} left`
                    : `${Math.abs(Math.round(remaining)).toLocaleString()} over`}
                </Text>
              </View>
            </View>
            {/* 3-column macro grid */}
            <View style={styles.macroGrid}>
              <MacroCol label="Protein" current={totals.protein_g} goal={proteinGoal} dotColor={C.protein} />
              <View style={styles.macroDivider} />
              <MacroCol label="Carbs"   current={totals.carbs_g}   goal={carbGoal}    dotColor={C.carbs} />
              <View style={styles.macroDivider} />
              <MacroCol label="Fat"     current={totals.fat_g}     goal={fatGoal}     dotColor={C.fat} />
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.summaryCard, styles.setupCard]}
            activeOpacity={0.85}
            onPress={handleResumeOnboarding}
          >
            <View style={styles.setupIconWrap}>
              <Ionicons name="flag-outline" size={20} color={C.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.setupTitle}>Finish setting up your profile</Text>
              <Text style={styles.setupSubtitle}>Add your goal and stats to see calorie and macro targets.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.muted} />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Keyboard-aware area ──────────────────────────────────────────── */}
      <KeyboardAvoidingView
        // behavior=undefined on Android makes KAV inert (its `default:` branch
        // renders a plain View and applies nothing), so the broken reset path
        // described above is never entered. The lift comes from
        // androidKeyboardLift instead, which is driven by our own listeners.
        style={[styles.flex, isAndroid && { paddingBottom: androidKeyboardLift }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? topBarHeight : 0}
        {...swipeResponder.panHandlers}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Water card — opt-in via Settings, today only ─────────── */}
          {profile?.water_tracking_enabled && isViewingToday && (
            <WaterHomeCard
              goalMl={profile.water_goal_ml ?? 2500}
              units={(profile.units_system as 'metric' | 'imperial') ?? 'metric'}
            />
          )}

          {/* ── Feed mode toggle — shown on all days ──────────────────── */}
          <View style={styles.toggleWrap}>
            <View style={styles.togglePill}>
              {([['logs', 'Food log'], ['all', 'Log + Coach']] as const).map(([id, label]) => {
                const on = mode === id;
                return (
                  <TouchableOpacity
                    key={id}
                    style={[styles.toggleTab, on && styles.toggleTabActive]}
                    onPress={() => setMode(id)}
                    activeOpacity={0.85}
                  >
                    {id === 'all' && (
                      <Ionicons name="sparkles" size={13} color={on ? C.accent : C.muted} />
                    )}
                    <Text style={[styles.toggleText, on && styles.toggleTextActive]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* ── Feed ─────────────────────────────────────────────────────── */}
          <View style={styles.feed}>
            {/* Loading spinner while chat history is being fetched and merged */}
            {isLoadingChat && mode === 'all' && (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={C.accent} />
                <Text style={styles.loadingText}>Loading conversation…</Text>
              </View>
            )}

            {shownMessages.length === 0 && !isFetchingDate && !isLoadingChat && (
              isViewingToday
                ? <WelcomeBubble
                    firstName={profile?.full_name?.trim().split(' ')[0] || null}
                    isFirstTime={!!profile?.created_at && toLocalDateString(new Date(profile.created_at)) === todayDate()}
                  />
                : <EmptyHistoryBubble date={dateLabel} />
            )}

            {shownMessages.map(msg => {
              if (msg.type === 'user') {
                // Hidden spacer reserves the room, absolute time fills it —
                // see timeSpacer() for why the timestamp is rendered twice.
                const time = formatBubbleTime(msg.sentAt);
                return (
                  <View key={msg.id} style={styles.userRow}>
                    <View style={styles.userBubble}>
                      {msg.imageUri ? (
                        <TouchableOpacity
                          onPress={() => setViewerUri(msg.imageUri ?? null)}
                          activeOpacity={0.85}
                          accessibilityRole="imagebutton"
                          accessibilityLabel="View attached photo full screen"
                        >
                          <Image source={{ uri: msg.imageUri }} style={styles.bubbleImage} />
                        </TouchableOpacity>
                      ) : null}
                      {/* A photo-only message has no text; rendering an empty
                          Text node would still reserve a line's height. */}
                      {(msg.text || !!time) && (
                      <Text style={[styles.userBubbleText, msg.imageUri && styles.userBubbleTextWithImage]}>
                        {msg.text}
                        {!!time && <Text style={styles.timeSpacerOnAccent}>{timeSpacer(time)}</Text>}
                      </Text>
                      )}
                      {!!time && (
                        <Text style={[styles.bubbleTime, styles.bubbleTimeOnAccent]}>{time}</Text>
                      )}
                    </View>
                  </View>
                );
              }
              if (msg.type === 'thinking') {
                return (
                  <View key={msg.id} style={styles.aiBubbleRow}>
                    <View style={styles.thinkingBubble}>
                      <ActivityIndicator size="small" color={C.accent} />
                      <Text style={styles.thinkingText}>Analysing your meal…</Text>
                    </View>
                  </View>
                );
              }
              if (msg.type === 'meal_card') {
                return (
                  <View
                    key={msg.id}
                    style={styles.mealCardGroup}
                    ref={el => { cardRefs.current.set(msg.id, el); }}
                  >
                    <MealCard
                      meal={msg.meal}
                      onEditStart={() => {
                        const cardRef = cardRefs.current.get(msg.id);
                        if (!cardRef || !scrollRef.current) return;
                        // Wait one frame for the TextInput to expand, then measure
                        // where this card sits inside the ScrollView and scroll to it.
                        setTimeout(() => {
                          cardRef.measureLayout(
                            scrollRef.current as any,
                            (_x, y) => {
                              scrollRef.current?.scrollTo({ y: Math.max(0, y - 16), animated: true });
                            },
                            () => {} // ignore measurement errors
                          );
                        }, 100);
                      }}
                    />
                  </View>
                );
              }
              if (msg.type === 'answer') {
                const time = formatBubbleTime(msg.sentAt);
                return (
                  <View key={msg.id} style={styles.aiRow}>
                    <View style={styles.aiBubble}>
                      <Text style={styles.aiBubbleText}>
                        {msg.text}
                        {!!time && <Text style={styles.timeSpacerOnSurface}>{timeSpacer(time)}</Text>}
                      </Text>
                      {!!time && (
                        <Text style={[styles.bubbleTime, styles.bubbleTimeMuted]}>{time}</Text>
                      )}
                    </View>
                  </View>
                );
              }
              if (msg.type === 'error') {
                return (
                  <View key={msg.id} style={styles.aiBubbleRow}>
                    <View style={styles.errorBubble}>
                      <Text style={styles.errorText}>{msg.text}</Text>
                    </View>
                  </View>
                );
              }
              return null;
            })}
          </View>
        </ScrollView>

        {/* ── Composer — always visible; camera/image hidden on past days ── */}
        <View style={[styles.composerWrap, { paddingBottom: composerBottomPad }]}>
          {photoErrorText ? <Text style={styles.photoErrorText}>{photoErrorText}</Text> : null}

          {/* Photo thumbnail strip — shown only when a photo is queued */}
          {pendingPhoto && (
            <View style={styles.photoPreviewRow}>
              <Image source={{ uri: pendingPhoto.uri }} style={styles.photoThumb} />
              <TouchableOpacity
                style={styles.photoCancel}
                onPress={() => setPendingPhoto(null)}
                activeOpacity={0.7}
              >
                <Ionicons name="close-circle" size={20} color={C.text2} />
              </TouchableOpacity>
              <Text style={styles.photoHint}>
                {input.trim() ? 'Add a note (optional)' : 'Tap ↑ to log this photo'}
              </Text>
            </View>
          )}

          <View style={styles.composer}>
            <TextInput
              style={styles.composerInput}
              value={input}
              onChangeText={setInput}
              placeholder={
                pendingPhoto
                  ? 'Add a note (optional)…'
                  : isViewingToday
                    ? 'What did you eat or exercise?'
                    : 'Ask about this day…'
              }
              placeholderTextColor={C.muted}
              returnKeyType="send"
              onSubmitEditing={handleSend}
              editable={!isLogging}
              blurOnSubmit={false}
              multiline
            />
            {/* Saved Entries button — quick-log a previously saved meal */}
            {isViewingToday && !pendingPhoto && (
              <TouchableOpacity
                style={styles.iconBtn}
                activeOpacity={0.7}
                onPress={() => {
                  // saved_count tells us whether people open an empty sheet
                  // (discovery problem) or a full one they just don't use.
                  track('saved_entries_opened', {
                    saved_count: useSavedEntriesStore.getState().entries.length,
                  });
                  setSavedEntriesSheetOpen(true);
                }}
              >
                <Ionicons name="bookmark-outline" size={22} color={C.text2} />
              </TouchableOpacity>
            )}
            {/* Gallery button — opens photo library */}
            {isViewingToday && !pendingPhoto && (
              <TouchableOpacity style={styles.iconBtn} activeOpacity={0.7} onPress={handleGalleryPress}>
                <Ionicons name="image-outline" size={22} color={C.text2} />
              </TouchableOpacity>
            )}
            {/* FAB: camera when idle, send arrow when text typed or photo queued */}
            <TouchableOpacity
              style={styles.cameraFab}
              activeOpacity={0.85}
              onPress={
                input.trim().length > 0 || pendingPhoto
                  ? handleSend
                  : isViewingToday
                    ? handleCameraPress
                    : handleSend
              }
            >
              {input.trim().length > 0 || pendingPhoto
                ? <Ionicons name="arrow-up" size={20} color="#fff" />
                : isViewingToday
                  ? <Ionicons name="camera" size={20} color="#fff" />
                  : <Ionicons name="arrow-up" size={20} color="#fff" />
              }
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Slide-out profile drawer */}
      <ProfileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />

      {/* Saved Entries quick-picker */}
      <SavedEntriesSheet
        visible={savedEntriesSheetOpen}
        onClose={() => setSavedEntriesSheetOpen(false)}
        onSelect={handleLogSavedEntry}
      />


      <ImageViewerModal uri={viewerUri} onClose={() => setViewerUri(null)} />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },

  // Top bar
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 6, paddingBottom: 12, gap: 6,
  },
  menuBtn: {
    width: 42, height: 42, borderRadius: 12, marginLeft: -4,
    alignItems: 'center', justifyContent: 'center',
  },
  dateBlock: { flex: 1 },
  dateSub: { fontSize: 12.5, fontWeight: '500', fontFamily: fontFamily.medium, color: C.text2 },
  dateLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  datePrimary: { fontSize: 17.5, fontWeight: '700', fontFamily: fontFamily.bold, color: C.text, letterSpacing: -0.2, lineHeight: 22 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupsBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.surface,
  },
  streakChip: {
    flexDirection: 'row', alignItems: 'center',
    height: 32, paddingHorizontal: 12, borderRadius: 20,
    backgroundColor: C.accentSoft, borderWidth: 1, borderColor: C.accentPressed,
  },
  streakText: { fontSize: 13, fontWeight: '700', fontFamily: fontFamily.bold, color: C.accent, whiteSpace: 'nowrap' } as any,

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 0, paddingBottom: 24, gap: 14 },

  // Fixed header — sits above the ScrollView as a sibling, not inside it, so
  // it never scrolls. paddingHorizontal: 20 stands in for scrollContent's old
  // 20px padding, which DatePickerSheet's marginHorizontal: -20 (its own
  // "bleed to screen edges" trick) is designed to cancel out exactly.
  fixedHeader: {
    paddingHorizontal: 20,
  },
  // Summary card — was the scroll's first child with a -20 marginTop that
  // cancelled scrollContent's 20px padding; now a normal block inside
  // fixedHeader (which already provides the horizontal padding), so it just
  // needs bottom spacing before the ScrollView starts.
  summaryCard: {
    backgroundColor: C.card, borderRadius: 20, padding: 18,
    marginBottom: 14,
    shadowColor: 'rgba(60,40,90,1)', shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.12, shadowRadius: 14, elevation: 6,
    gap: 16,
  },
  setupCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  setupIconWrap: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: C.accentSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  setupTitle: {
    fontSize: 14.5, fontWeight: '700', fontFamily: fontFamily.bold, color: C.text,
  },
  setupSubtitle: {
    fontSize: 11.5, fontFamily: fontFamily.regular, color: C.text2, marginTop: 2,
  },
  summaryHeadRow: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
  },
  calorieHeadline: {
    fontSize: 25.5, fontWeight: '800', fontFamily: fontFamily.bold, color: C.text, letterSpacing: -0.5, lineHeight: 28,
  },
  calorieGoalText: {
    fontSize: 12.5, fontWeight: '500', fontFamily: fontFamily.medium, color: C.text2,
  },
  remainingPill: {
    height: 28, paddingHorizontal: 12, borderRadius: 16,
    backgroundColor: C.accentSoft, justifyContent: 'center', alignItems: 'center',
  },
  remainingPillOver: {
    backgroundColor: '#FEF3DF',
  },
  remainingPillText: {
    fontSize: 12.5, fontWeight: '700', fontFamily: fontFamily.bold, color: C.accent,
  },
  remainingPillTextOver: {
    color: C.carbs,
  },
  macroGrid: {
    flexDirection: 'row', alignItems: 'stretch',
  },
  macroCol: { flex: 1, gap: 5 },
  macroColHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  macroDivider: { width: 1, backgroundColor: C.surface, marginHorizontal: 12 },
  macroDot: { width: 7, height: 7, borderRadius: 3.5, flexShrink: 0 },
  macroLabel: { fontSize: 11.5, fontWeight: '600', fontFamily: fontFamily.semibold, color: C.text2 },
  macroValue: { fontSize: 13.5, fontWeight: '700', fontFamily: fontFamily.bold, color: C.text },
  macroGoal: { fontSize: 11, fontWeight: '500', fontFamily: fontFamily.medium, color: C.muted },
  macroTrack: { height: 5, borderRadius: 3, backgroundColor: C.surface, overflow: 'hidden' },

  // Toggle
  toggleWrap: {},
  togglePill: {
    flexDirection: 'row', backgroundColor: C.surface,
    borderRadius: 11, padding: 3,
  },
  toggleTab: {
    flex: 1, height: 34, borderRadius: 8,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  toggleTabActive: {
    backgroundColor: C.card,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12, shadowRadius: 4, elevation: 2,
  },
  toggleText: { fontSize: 13, fontWeight: '700', fontFamily: fontFamily.bold, color: C.text2 },
  toggleTextActive: { color: C.accent },

  // Loading history indicator
  loadingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 20,
  },
  loadingText: { fontSize: 12.5, color: C.muted, fontFamily: fontFamily.regular },

  // Feed
  feed: { gap: 8 },

  // User bubble
  userRow: { alignItems: 'flex-end', gap: 4 },
  userBubble: {
    backgroundColor: C.accent,
    borderRadius: 18, borderBottomRightRadius: 4,
    paddingHorizontal: 14, paddingVertical: 10, maxWidth: '82%',
  },
  userBubbleText: { color: '#FFFFFF', fontSize: 14, fontWeight: '400', fontFamily: fontFamily.regular, lineHeight: 21 },
  // The photo sits above the caption, so the caption needs a gap under it.
  userBubbleTextWithImage: { marginTop: 8 },
  // Attached photo inside an outgoing bubble. Fixed height with a 4:3-ish
  // aspect keeps a portrait phone snap from taking over the whole thread;
  // 'cover' crops rather than letterboxes, and tapping opens the full view.
  bubbleImage: {
    // 150 rather than the original 200: the bubble is maxWidth 82%, so a 200pt
    // image filled almost the entire content width and the photo dominated the
    // thread instead of reading as an attachment. Half the area is plenty here,
    // because tapping opens the full-screen viewer — the bubble only has to say
    // "a photo went with this", not let you inspect the food.
    width: 150,
    // aspectRatio instead of a hardcoded height keeps the 4:3 shape locked to
    // the width, so future size tweaks are a one-number change.
    aspectRatio: 4 / 3,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  // Invisible width-reserver appended to the message text — see timeSpacer().
  //
  // Two rules for these. First, fontSize MUST match bubbleTime, or the room the
  // spacer holds isn't the room the real timestamp needs and the two drift
  // apart. Second, the colour is the BUBBLE'S OWN BACKGROUND, not 'transparent'
  // — we shipped 'transparent' first and Android drew the spacer anyway, so the
  // timestamp appeared twice, once at the text baseline and once at its pinned
  // position. Painting the glyphs in the background colour makes them invisible
  // no matter how the platform treats alpha, so these two values must stay in
  // sync with userBubble/aiBubble's backgroundColor.
  timeSpacerOnAccent:  { fontSize: 10, color: C.accent },
  timeSpacerOnSurface: { fontSize: 10, color: C.surface },
  // The visible timestamp, pinned to the bubble's bottom-right so it's always
  // right-aligned — whether the spacer kept it on the last line of text or
  // pushed it onto a line of its own.
  //
  // `right: 14` matches the bubbles' paddingHorizontal. `bottom: 8` is 2px
  // below the content box (paddingVertical is 10), which is what drops the
  // time slightly under the text baseline instead of sitting flush on it —
  // the bottom-aligned look WhatsApp has. Nudge this to taste.
  bubbleTime: {
    position: 'absolute', right: 14, bottom: 8,
    fontSize: 10, fontFamily: fontFamily.regular,
  },
  bubbleTimeOnAccent: { color: 'rgba(255,255,255,0.65)' },

  // AI row
  aiBubbleRow: { flexDirection: 'row' },
  aiRow: { alignItems: 'flex-start', gap: 4 },
  aiBubble: {
    backgroundColor: C.surface, borderRadius: 18, borderBottomLeftRadius: 4,
    paddingHorizontal: 14, paddingVertical: 10, maxWidth: '82%',
  },
  aiBubbleText: { fontSize: 14, color: C.text, lineHeight: 21, fontFamily: fontFamily.regular },
  bubbleTimeMuted: { color: C.muted },
  thinkingBubble: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.card, borderRadius: 16, borderBottomLeftRadius: 4,
    paddingHorizontal: 13, paddingVertical: 10,
    shadowColor: 'rgba(60,40,90,1)', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 6, elevation: 2,
  },
  thinkingText: { fontSize: 13.5, color: C.muted, fontWeight: '500', fontFamily: fontFamily.medium },

  // Meal card
  mealCardGroup: { gap: 5 },

  errorBubble: {
    backgroundColor: '#FFF0F0', borderRadius: 18, borderBottomLeftRadius: 4,
    paddingHorizontal: 14, paddingVertical: 10, maxWidth: '80%',
    borderWidth: 1, borderColor: '#FFD0D0',
  },
  errorText: { fontSize: 12.5, color: C.error, lineHeight: 18, fontFamily: fontFamily.regular },

  // Composer
  composerWrap: {
    borderTopWidth: 1, borderTopColor: C.divider, backgroundColor: C.card,
  },
  photoErrorText: {
    fontSize: 11.5, fontFamily: fontFamily.medium, color: C.error,
    textAlign: 'center', paddingTop: 8, paddingHorizontal: 16,
  },
  photoPreviewRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingTop: 8,
  },
  photoThumb: {
    width: 52, height: 52, borderRadius: 10,
    backgroundColor: C.surface,
  },
  photoCancel: {
    padding: 2,
  },
  photoHint: {
    flex: 1, fontSize: 12, color: C.muted, fontWeight: '500', fontFamily: fontFamily.medium,
  },
  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 4,
    paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8,
  },
  composerInput: {
    flex: 1, minHeight: 40, maxHeight: 120, borderRadius: 20,
    backgroundColor: C.surface, paddingHorizontal: 18, paddingVertical: 8,
    fontSize: 14, color: C.text, minWidth: 0, textAlignVertical: 'center', fontFamily: fontFamily.regular,
  },
  iconBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cameraFab: {
    width: 36, height: 36, borderRadius: 18, flexShrink: 0,
    backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 5,
  },
});
