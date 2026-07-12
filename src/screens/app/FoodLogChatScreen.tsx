import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFoodLogStore, MealCard as MealCardType, todayDate } from '../../store/foodLogStore';
import MealCard from '../../components/nutrition/MealCard';
import { supabase } from '../../api/supabase';
import { posthog } from '../../utils/posthog';

// ── Design tokens ──────────────────────────────────────────────────────────────
const C = {
  bg: '#F7F6FB',
  card: '#FFFFFF',
  accent: '#6366F1',
  accentSoft: '#ECEAFE',
  text: '#1D1D1F',
  text2: '#6E6E73',
  muted: '#A1A1A6',
  border: '#E4E2EC',
  surface: '#EEEDF4',
  divider: '#E5E5EA',
  userBubble: '#6366F1',
  error: '#FF3B30',
} as const;

// ── Chat message types ─────────────────────────────────────────────────────────
type ChatMsg =
  | { id: string; type: 'user';      text: string }
  | { id: string; type: 'thinking' }
  | { id: string; type: 'meal_card'; meal: MealCardType }
  | { id: string; type: 'answer';    text: string }
  | { id: string; type: 'error';     text: string };

let _id = 0;
const uid = () => String(++_id);

// ── Screen ─────────────────────────────────────────────────────────────────────
export default function FoodLogChatScreen() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const { logMealFromText, isLogging, meals, selectedDate } = useFoodLogStore();
  const scrollRef = useRef<ScrollView>(null);

  // Load today's persisted chat history when the screen mounts.
  // We fetch from chat_messages ordered by time, then:
  //   - 'user' rows → render as user bubbles
  //   - 'food_log_confirmation' rows → find the matching MealCard from the store
  //     and render the full card (so the chat shows real meal data, not just text)
  //   - 'chat' assistant rows → render as AI text bubbles
  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  async function loadHistory() {
    setIsLoadingHistory(true);
    setMessages([]);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setIsLoadingHistory(false); return; }

      const date = selectedDate ?? todayDate();

      const { data, error } = await supabase
        .from('chat_messages')
        .select('id, role, content, message_type, meal_log_id, created_at')
        .eq('user_id', user.id)
        .eq('chat_date', date)
        .order('created_at', { ascending: true });

      if (error || !data) { setIsLoadingHistory(false); return; }

      // Build the message list from DB rows.
      // We use the store's meals array to find the matching MealCard for food log rows.
      const currentMeals = useFoodLogStore.getState().meals;

      const hydrated: ChatMsg[] = data.flatMap((row): ChatMsg[] => {
        if (row.role === 'user') {
          return [{ id: row.id, type: 'user' as const, text: row.content }];
        }

        // AI food log confirmation → render as meal card if we can find it
        if (row.role === 'assistant' && row.message_type === 'food_log_confirmation' && row.meal_log_id) {
          const meal = currentMeals.find(m => m.id === row.meal_log_id);
          if (meal) {
            return [{ id: row.id, type: 'meal_card' as const, meal }];
          }
          // Meal not in store (deleted or different date) — fall back to text
          return [{ id: row.id, type: 'answer' as const, text: row.content }];
        }

        // AI text answer
        return [{ id: row.id, type: 'answer' as const, text: row.content }];
      });

      setMessages(hydrated);
    } catch (_err) {
      // History load failure is non-fatal — start with empty chat
    } finally {
      setIsLoadingHistory(false);
    }
  }

  const push = (msg: ChatMsg) =>
    setMessages(prev => [...prev, msg]);

  const replace = (id: string, msg: ChatMsg) =>
    setMessages(prev => prev.map(m => (m.id === id ? msg : m)));

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLogging) return;

    setInput('');
    push({ id: uid(), type: 'user', text });

    const thinkingId = uid();
    push({ id: thinkingId, type: 'thinking' });

    scrollRef.current?.scrollToEnd({ animated: true });

    try {
      const result = await logMealFromText(text);
      if (result.type === 'answer') {
        replace(thinkingId, { id: thinkingId, type: 'answer', text: result.reply });
      } else {
        replace(thinkingId, { id: thinkingId, type: 'meal_card', meal: result.meal });
        const totalCalories = result.meal.entries.reduce((sum, e) => sum + (e.calories ?? 0), 0);
        posthog.capture('meal_logged', {
          meal_type: result.meal.meal_type,
          calories: totalCalories,
          item_count: result.meal.entries.length,
        });
      }
    } catch (err: any) {
      const message = err.message ?? 'Something went wrong. Try again.';
      replace(thinkingId, { id: thinkingId, type: 'error', text: message });
      posthog.capture('ai_chat_error', { error_message: message });
    }

    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const showWelcome = !isLoadingHistory && messages.length === 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerAvatar}>
          <Text style={styles.headerAvatarText}>S</Text>
        </View>
        <View>
          <Text style={styles.headerTitle}>STEADY AI</Text>
          <Text style={styles.headerSub}>Tell me what you ate</Text>
        </View>
      </View>

      <View style={styles.divider} />

      {/* ── Chat + Input (keyboard-aware) ───────────────────────────────────── */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {/* Loading skeleton while history is being fetched */}
          {isLoadingHistory && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={C.accent} />
              <Text style={styles.loadingText}>Loading conversation…</Text>
            </View>
          )}

          {showWelcome && <WelcomeBubble />}

          {messages.map(msg => {
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
                  <View style={styles.aiAvatar}>
                    <Text style={styles.aiAvatarText}>S</Text>
                  </View>
                  <View style={styles.thinkingBubble}>
                    <ActivityIndicator size="small" color={C.accent} />
                    <Text style={styles.thinkingText}>Analysing your meal…</Text>
                  </View>
                </View>
              );
            }

            if (msg.type === 'meal_card' && msg.meal.entries.length > 0) {
              return (
                <View key={msg.id} style={styles.mealCardRow}>
                  <View style={styles.aiAvatar}>
                    <Text style={styles.aiAvatarText}>S</Text>
                  </View>
                  <View style={styles.mealCardWrap}>
                    <Text style={styles.loggedLabel}>Logged ✓</Text>
                    <MealCard meal={msg.meal} onEdit={() => {}} onOptions={() => {}} />
                  </View>
                </View>
              );
            }

            if (msg.type === 'answer') {
              return (
                <View key={msg.id} style={styles.aiBubbleRow}>
                  <View style={styles.aiAvatar}>
                    <Text style={styles.aiAvatarText}>S</Text>
                  </View>
                  <View style={styles.aiBubble}>
                    <Text style={styles.aiBubbleText}>{msg.text}</Text>
                  </View>
                </View>
              );
            }

            if (msg.type === 'error') {
              return (
                <View key={msg.id} style={styles.aiBubbleRow}>
                  <View style={styles.aiAvatar}>
                    <Text style={styles.aiAvatarText}>S</Text>
                  </View>
                  <View style={styles.errorBubble}>
                    <Text style={styles.errorText}>{msg.text}</Text>
                  </View>
                </View>
              );
            }

            return null;
          })}
        </ScrollView>

        {/* ── Input bar ──────────────────────────────────────────────────────── */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="What did you eat?"
            placeholderTextColor={C.muted}
            multiline
            returnKeyType="send"
            onSubmitEditing={handleSend}
            editable={!isLogging}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || isLogging) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!input.trim() || isLogging}
            activeOpacity={0.85}
          >
            <Ionicons name="arrow-up" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

    </SafeAreaView>
  );
}

// ── Welcome bubble — shown when chat is empty ─────────────────────────────────
function WelcomeBubble() {
  return (
    <View style={styles.aiBubbleRow}>
      <View style={styles.aiAvatar}>
        <Text style={styles.aiAvatarText}>S</Text>
      </View>
      <View style={styles.aiBubble}>
        <Text style={styles.aiBubbleText}>
          Hey! I'm your STEADY AI. Tell me what you ate — any meal, any time — and I'll log the calories and macros for you automatically.{'\n\n'}
          Try: <Text style={{ fontWeight: '700' }}>"I had two eggs on toast with a coffee"</Text>
        </Text>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: C.text },
  headerSub: { fontSize: 12, color: C.muted, marginTop: 1 },

  divider: { height: 1, backgroundColor: C.divider },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 12 },

  // Loading history indicator
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 20,
  },
  loadingText: { fontSize: 13, color: C.muted },

  // User bubble (right side)
  userRow: { alignItems: 'flex-end' },
  userBubble: {
    backgroundColor: C.userBubble,
    borderRadius: 18,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '80%',
  },
  userBubbleText: { color: '#fff', fontSize: 14, fontWeight: '500', lineHeight: 20 },

  // AI row (left side — avatar + content)
  aiBubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  aiAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginBottom: 2,
  },
  aiAvatarText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  // AI speech bubble
  aiBubble: {
    backgroundColor: C.card,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '80%',
    shadowColor: 'rgba(60,40,90,1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
  },
  aiBubbleText: { fontSize: 14, color: C.text, lineHeight: 20 },

  // Thinking indicator
  thinkingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.card,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: 'rgba(60,40,90,1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
  },
  thinkingText: { fontSize: 13, color: C.muted, fontWeight: '500' },

  // Meal card in chat
  mealCardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  mealCardWrap: { flex: 1 },
  loggedLabel: { fontSize: 11, color: C.accent, fontWeight: '700', marginBottom: 4, marginLeft: 2 },

  // Error bubble
  errorBubble: {
    backgroundColor: '#FFF0F0',
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '80%',
    borderWidth: 1,
    borderColor: '#FFD0D0',
  },
  errorText: { fontSize: 13, color: C.error, lineHeight: 18 },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: C.divider,
    backgroundColor: C.card,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: C.surface,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: C.text,
    lineHeight: 18,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sendBtnDisabled: { opacity: 0.35 },
});
