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
  Platform,
  ActivityIndicator,
  Alert,
  PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import MealCard from '../../components/nutrition/MealCard';
import WaterHomeCard from '../../components/nutrition/WaterHomeCard';
import { useWaterStore } from '../../store/waterStore';
import { useFoodLogStore, MealCard as MealCardType, todayDate } from '../../store/foodLogStore';
import { useAuthStore } from '../../store/authStore';
import { homeColors as C } from '../../theme/homeColors';
import ProfileDrawer from '../../components/profile/ProfileDrawer';
import DatePickerSheet from '../../components/common/DatePickerSheet';
import { supabase } from '../../api/supabase';
import { useStreak } from '../../hooks/useStreak';

// ── Chat message types ─────────────────────────────────────────────────────────
type ChatMsg =
  | { id: string; type: 'user';      text: string }
  | { id: string; type: 'thinking' }
  | { id: string; type: 'meal_card'; meal: MealCardType }
  | { id: string; type: 'answer';    text: string }
  | { id: string; type: 'error';     text: string };

let _id = 0;
const uid = () => String(++_id);

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

// ── WelcomeBubble — shown on today when no meals logged ───────────────────────
function WelcomeBubble() {
  return (
    <View style={styles.aiBubbleRow}>
      <View style={styles.aiAvatar}><Text style={styles.aiAvatarText}>S</Text></View>
      <View style={styles.aiBubble}>
        <Text style={styles.aiBubbleText}>
          Hey! Tell me what you ate and I'll log the calories and macros automatically.{'\n\n'}
          Try: <Text style={{ fontWeight: '700' }}>"I had two eggs on toast with a coffee"</Text>
        </Text>
      </View>
    </View>
  );
}

// ── EmptyHistoryBubble — shown on past days with no logs ──────────────────────
function EmptyHistoryBubble({ date }: { date: string }) {
  return (
    <View style={styles.aiBubbleRow}>
      <View style={styles.aiAvatar}><Text style={styles.aiAvatarText}>S</Text></View>
      <View style={styles.aiBubble}>
        <Text style={styles.aiBubbleText}>
          Nothing was logged on <Text style={{ fontWeight: '700' }}>{date}</Text>.
          {'\n\n'}You can still ask me questions about your nutrition goals.
        </Text>
      </View>
    </View>
  );
}

// ── HomeScreen ────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const [mode, setMode]               = useState<'logs' | 'all'>('all');
  const [messages, setMessages]       = useState<ChatMsg[]>([]);
  const [isLoadingChat, setIsLoadingChat] = useState(true);
  const [input, setInput]             = useState('');
  const [drawerOpen, setDrawerOpen]   = useState(false);
  const [pickerOpen, setPickerOpen]   = useState(false);
  // pendingPhoto holds the local URI (for the thumbnail preview) and base64
  // string (for the Edge Function). null means no photo is queued.
  const [pendingPhoto, setPendingPhoto] = useState<{ uri: string; base64: string } | null>(null);
  const scrollRef                   = useRef<ScrollView>(null);
  const cardRefs                    = useRef<Map<string, View | null>>(new Map());
  const initialSeedDone             = useRef(false);

  const {
    meals, totals, fetchEntriesForDate, logMealFromText, logMealFromPhoto, isLogging,
    isFetchingDate, selectedDate, setSelectedDate,
  } = useFoodLogStore();
  const { profile } = useAuthStore();

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
          const next = d.toISOString().split('T')[0];
          if (next <= todayDate()) useFoodLogStore.getState().setSelectedDate(next);
        } else if (g.dx > 50) {
          // swipe right → previous day
          d.setDate(d.getDate() - 1);
          useFoodLogStore.getState().setSelectedDate(d.toISOString().split('T')[0]);
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
    // without touching the chat bubble messages.
    const mealsById = new Map(meals.map(m => [m.id, m]));
    setMessages(prev => {
      // Remove cards for deleted meals, update cards for edited meals
      const updated = prev
        .filter(msg => msg.type !== 'meal_card' || mealsById.has(msg.id))
        .map(msg =>
          msg.type === 'meal_card' && mealsById.has(msg.id)
            ? { ...msg, meal: mealsById.get(msg.id)! }
            : msg
        );
      return updated;
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
          ? { id: row.id, type: 'user' as const, text: row.content }
          : { id: row.id, type: 'answer' as const, text: row.content },
      }));

      // Merge and sort by timestamp — this gives the correct interleaved order:
      // user bubble → AI reply → MealCard → user bubble → etc.
      const merged = [...mealEntries, ...chatEntries]
        .sort((a, b) => a.ts.localeCompare(b.ts))
        .map(e => e.msg);

      setMessages(merged);
      initialSeedDone.current = true;
    } catch {
      // Non-fatal: fall back to showing meals only
      setMessages(currentMeals.map(meal => ({ id: meal.id, type: 'meal_card' as const, meal })));
      initialSeedDone.current = true;
    } finally {
      setIsLoadingChat(false);
    }
  }

  const push    = (msg: ChatMsg) => setMessages(prev => [...prev, msg]);
  const replace = (id: string, msg: ChatMsg) =>
    setMessages(prev => prev.map(m => (m.id === id ? msg : m)));

  // Open the OS native camera. On success, stores the local URI + base64 in
  // pendingPhoto so the composer shows a thumbnail and the send button is ready.
  const handleCameraPress = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera access needed', 'Please allow camera access in your device Settings to log food by photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.7,   // 70% quality — sharp enough for food ID, smaller payload
      base64: true,   // we need this to send to the Edge Function
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]?.base64) {
      setPendingPhoto({ uri: result.assets[0].uri, base64: result.assets[0].base64 });
    }
  };

  // Open the photo library (gallery) as an alternative to the live camera.
  const handleGalleryPress = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo library access needed', 'Please allow photo library access in your device Settings.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      base64: true,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]?.base64) {
      setPendingPhoto({ uri: result.assets[0].uri, base64: result.assets[0].base64 });
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
      const thinkingId = uid();
      push({ id: thinkingId, type: 'thinking' });
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
      try {
        const result = await logMealFromPhoto(photoToSend.base64, 'image/jpeg', caption || undefined);
        replace(thinkingId, { id: thinkingId, type: 'meal_card', meal: result.meal });
      } catch (err: any) {
        replace(thinkingId, {
          id: thinkingId, type: 'error',
          text: err?.message ?? 'Could not analyse photo. Try again.',
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
    push({ id: uid(), type: 'user', text });
    const thinkingId = uid();
    push({ id: thinkingId, type: 'thinking' });
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    try {
      const result = await logMealFromText(text);
      if (result.type === 'answer') {
        replace(thinkingId, { id: thinkingId, type: 'answer', text: result.reply });
        // The water insert (if any) happened server-side inside the edge
        // function — nothing on the client knows about it yet. Refresh the
        // water store only when the AI actually called log_water, so a plain
        // "how am I doing?" chat turn doesn't cost an extra fetch.
        if (result.waterLogged) {
          useWaterStore.getState().fetchToday();
        }
      } else {
        if (isViewingToday) {
          replace(thinkingId, { id: thinkingId, type: 'meal_card', meal: result.meal });
        } else {
          const kcal = Math.round(result.meal.entries.reduce((s, e) => s + e.calories, 0));
          replace(thinkingId, {
            id: thinkingId, type: 'answer',
            text: `That looks like about ${kcal} kcal. Switch to Today to log new meals.`,
          });
        }
      }
    } catch (err: any) {
      replace(thinkingId, {
        id: thinkingId, type: 'error',
        text: err?.message ?? 'Something went wrong. Try again.',
      });
    }
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  // Goals
  const calorieGoal = profile?.calorie_goal   ?? 2000;
  const proteinGoal = profile?.protein_goal_g  ?? 150;
  const carbGoal    = profile?.carb_goal_g     ?? 200;
  const fatGoal     = profile?.fat_goal_g      ?? 60;
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
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <View style={styles.topBar}>
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

        {/* Right side: streak chip */}
        <View style={styles.topRight}>
          <View style={styles.streakChip}>
            <Text style={styles.streakText}>🔥 {streak} days</Text>
          </View>
        </View>
      </View>

      {/* ── Keyboard-aware area ──────────────────────────────────────────── */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        {...swipeResponder.panHandlers}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Date picker sheet — inside ScrollView so it pushes content down ── */}
          <DatePickerSheet
            visible={pickerOpen}
            selectedDate={selectedDate}
            onSelectDate={(date) => {
              setSelectedDate(date);
            }}
          />

          {/* ── Calorie summary card ──────────────────────────────────────── */}
          <View style={[styles.summaryCard, pickerOpen && styles.summaryCardBelowPicker]}>
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
                ? <WelcomeBubble />
                : <EmptyHistoryBubble date={dateLabel} />
            )}

            {shownMessages.map(msg => {
              if (msg.type === 'user') {
                return (
                  <View key={msg.id} style={styles.userRow}>
                    <View style={styles.userBubble}>
                      <Text style={styles.userBubbleText}>{msg.text}</Text>
                    </View>
                  </View>
                );
              }
              if (msg.type === 'thinking') {
                return (
                  <View key={msg.id} style={styles.aiBubbleRow}>
                    <View style={styles.aiAvatar}><Text style={styles.aiAvatarText}>S</Text></View>
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
                    {msg.meal.entries.length > 0 && (
                      <View style={styles.loggedRow}>
                        <Ionicons name="checkmark-circle" size={13} color={C.accent} />
                        <Text style={styles.loggedLabel}>Logged by STEADY</Text>
                      </View>
                    )}
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
                return (
                  <View key={msg.id} style={styles.aiBubbleRow}>
                    <View style={styles.aiAvatar}><Text style={styles.aiAvatarText}>S</Text></View>
                    <View style={styles.aiBubble}>
                      <Text style={styles.aiBubbleText}>{msg.text}</Text>
                    </View>
                  </View>
                );
              }
              if (msg.type === 'error') {
                return (
                  <View key={msg.id} style={styles.aiBubbleRow}>
                    <View style={styles.aiAvatar}><Text style={styles.aiAvatarText}>S</Text></View>
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
        <View style={styles.composerWrap}>
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
  dateSub: { fontSize: 13, fontWeight: '500', color: C.text2 },
  dateLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  datePrimary: { fontSize: 18, fontWeight: '700', color: C.text, letterSpacing: -0.2, lineHeight: 22 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  streakChip: {
    flexDirection: 'row', alignItems: 'center',
    height: 32, paddingHorizontal: 12, borderRadius: 20,
    backgroundColor: C.accentSoft, borderWidth: 1, borderColor: C.accentPressed,
  },
  streakText: { fontSize: 13.5, fontWeight: '700', color: C.accent, whiteSpace: 'nowrap' } as any,

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 0, paddingBottom: 24, gap: 14 },

  // Summary card
  summaryCard: {
    backgroundColor: C.card, borderRadius: 20, padding: 18,
    marginTop: -20,
    shadowColor: 'rgba(60,40,90,1)', shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.12, shadowRadius: 14, elevation: 6,
    gap: 16,
  },
  // When the calendar sheet is open it sits between the nav bar and this card —
  // the -20 pull is meant for the nav bar gap, not the calendar, so drop it here
  // and let the calendar's own marginBottom (6) provide the spacing instead.
  summaryCardBelowPicker: {
    marginTop: 0,
  },
  summaryHeadRow: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
  },
  calorieHeadline: {
    fontSize: 26, fontWeight: '800', color: C.text, letterSpacing: -0.5, lineHeight: 28,
  },
  calorieGoalText: {
    fontSize: 13, fontWeight: '500', color: C.text2,
  },
  remainingPill: {
    height: 28, paddingHorizontal: 12, borderRadius: 16,
    backgroundColor: C.accentSoft, justifyContent: 'center', alignItems: 'center',
  },
  remainingPillOver: {
    backgroundColor: '#FEF3DF',
  },
  remainingPillText: {
    fontSize: 13, fontWeight: '700', color: C.accent,
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
  macroLabel: { fontSize: 12, fontWeight: '600', color: C.text2 },
  macroValue: { fontSize: 14, fontWeight: '700', color: C.text },
  macroGoal: { fontSize: 11.5, fontWeight: '500', color: C.muted },
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
  toggleText: { fontSize: 13.5, fontWeight: '700', color: C.text2 },
  toggleTextActive: { color: C.accent },

  // Loading history indicator
  loadingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 20,
  },
  loadingText: { fontSize: 13, color: C.muted },

  // Feed
  feed: { gap: 12 },

  // User bubble
  userRow: { alignItems: 'flex-end' },
  userBubble: {
    backgroundColor: '#F0EFFF',
    borderWidth: 1, borderColor: '#D4D3FF',
    borderRadius: 18, borderBottomRightRadius: 4,
    paddingHorizontal: 14, paddingVertical: 7, maxWidth: '82%',
  },
  userBubbleText: { color: C.text, fontSize: 12.5, fontWeight: '400', lineHeight: 18 },

  // AI row
  aiBubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  aiAvatar: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: '#7476F6',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginBottom: 2,
    shadowColor: 'rgba(99,102,241,1)', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 3,
  },
  aiAvatarText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  aiBubble: {
    backgroundColor: C.card, borderRadius: 16, borderBottomLeftRadius: 4,
    paddingHorizontal: 13, paddingVertical: 10, maxWidth: '82%',
    shadowColor: 'rgba(60,40,90,1)', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 6, elevation: 2,
  },
  aiBubbleText: { fontSize: 14.5, color: C.text, lineHeight: 21 },
  thinkingBubble: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.card, borderRadius: 16, borderBottomLeftRadius: 4,
    paddingHorizontal: 13, paddingVertical: 10,
    shadowColor: 'rgba(60,40,90,1)', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 6, elevation: 2,
  },
  thinkingText: { fontSize: 14, color: C.muted, fontWeight: '500' },

  // Meal card
  mealCardGroup: { gap: 5 },
  loggedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 2 },
  loggedLabel: { fontSize: 11.5, color: C.accent, fontWeight: '600' },

  errorBubble: {
    backgroundColor: '#FFF0F0', borderRadius: 18, borderBottomLeftRadius: 4,
    paddingHorizontal: 14, paddingVertical: 10, maxWidth: '80%',
    borderWidth: 1, borderColor: '#FFD0D0',
  },
  errorText: { fontSize: 13, color: C.error, lineHeight: 18 },

  // Composer
  composerWrap: {
    borderTopWidth: 1, borderTopColor: C.divider, backgroundColor: C.card,
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
    flex: 1, fontSize: 12.5, color: C.muted, fontWeight: '500',
  },
  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 4,
    paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8,
  },
  composerInput: {
    flex: 1, minHeight: 40, maxHeight: 120, borderRadius: 20,
    backgroundColor: C.surface, paddingHorizontal: 18, paddingVertical: 8,
    fontSize: 14.5, color: C.text, minWidth: 0, textAlignVertical: 'center',
  },
  iconBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cameraFab: {
    width: 36, height: 36, borderRadius: 18, flexShrink: 0,
    backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 5,
  },
});
