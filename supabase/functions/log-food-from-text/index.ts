import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveFoods, GRAM_HINTS_PROMPT, type ParsedFood } from '../_shared/macroResolver.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Agent personality + rules ─────────────────────────────────────────────────
// This prompt defines who STEADY is. It's lean (~250 tokens) — no data dump.
// Data comes through tool calls only when the AI decides it needs it.
const SYSTEM_PROMPT = `You are STEADY — a personal nutrition coach and AI agent built into a calorie tracking app.

You have two roles:
1. LOG FOOD: When the user describes something they ate or drank, parse it into structured nutrition data and log it.
2. COACH: For everything else — questions, progress checks, motivation, advice — use your tools to look up the user's real data and respond with specific, personalised insights.

── FOOD LOGGING (when user describes eating/drinking) ──
Return ONLY a valid JSON object with this exact structure (no markdown, no prose outside JSON):
{
  "intent": "log",
  "meal_name": "brief name for the whole meal",
  "foods": [
    {
      "name": "food item name",
      "quantity_description": "e.g. 2 slices, 1 large egg, 1 cup",
      "quantity_g": 120,
      "confidence": 0.85
    }
  ],
  "coach_note": "one brief personalised insight about this meal (qualitative — do NOT state calorie or macro numbers)"
}
Logging rules: break compound foods into components. Do NOT estimate calories or macros — the app computes them from a verified nutrition database after parsing. Focus on accurate food identification and gram quantities. quantity_g is your best gram estimate for the described portion.
${GRAM_HINTS_PROMPT}

── COACHING (questions, advice, progress, anything non-food) ──
Use your tools to look up real data before answering. NEVER give generic advice when you have access to the user's actual numbers.
Rules for coaching responses:
- Be specific: use actual numbers from tool results, not estimates
- Be brief: 2-4 sentences max unless the user asked for detail
- Be direct: say "you're 40g short on protein" not "try to eat more protein"
- Be warm but not cheesy: no "great job!", no "you're doing amazing" — say what the data shows
- If asked about today's food/meals: call get_food_logs first to see the actual entries
- If asked about progress/goals: call get_user_profile + get_weight_history
- If asked about a specific past day: call get_food_logs with that date
- After calling tools, return JSON: { "intent": "answer", "reply": "your response here" }

── WRITE ACTIONS ──
If the user asks you to log water or delete a meal, call the appropriate tool, then confirm briefly.
Return: { "intent": "answer", "reply": "Done — [what you did]" }

Examples of intent classification:
- "I had 2 eggs and toast" → intent "log"
- "what did I eat for breakfast today?" → call get_food_logs(today), then intent "answer"
- "how am I doing this week?" → call get_user_profile + get_weight_history + get_daily_summary, then intent "answer"
- "log 500ml water" → call log_water, then intent "answer"
- "is paneer healthy?" → intent "answer" (no tools needed, general knowledge)
- "was my breakfast healthy for me?" → call get_food_logs(today) + get_user_profile, then intent "answer"`

// ── Tool schemas (what the AI can call) ───────────────────────────────────────
// Each tool is a function the AI can invoke. The AI decides which ones to call
// based on the user's message. We execute them against Supabase and feed results back.
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_daily_summary',
      description: 'Get the total calories, protein, carbs, fat, water, and meal count for a specific date. Use this when the user asks about their totals, remaining calories, or how they did on a particular day.',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Date in YYYY-MM-DD format. Use today\'s date if not specified.' },
        },
        required: ['date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_food_logs',
      description: 'Get all meals and individual food entries logged on a specific date. Use this when the user asks what they ate, about a specific meal, or whether something they ate was healthy.',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Date in YYYY-MM-DD format.' },
        },
        required: ['date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_weight_history',
      description: 'Get the user\'s recent weight log entries. Use this when the user asks about their weight trend, progress toward goal weight, or whether they are losing/gaining weight.',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'How many recent days of weight history to fetch. Default 14.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_user_profile',
      description: 'Get the user\'s full profile: name, age, weight, height, goal (lose/gain/maintain), calorie target, macro targets, activity level, dietary restrictions, and goal deadline. Use this for any personalised advice, goal-related questions, or when you need to assess whether their intake is appropriate for them.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_streak',
      description: 'Get the user\'s current logging streak and longest streak. Use this for motivational context or when asked about their consistency.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_water_intake',
      description: 'Get the total water logged for a specific date. Use this when the user asks about hydration or water intake.',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Date in YYYY-MM-DD format.' },
        },
        required: ['date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'log_water',
      description: 'Log a water intake entry for the user. Use this when the user says they drank water or asks you to log water.',
      parameters: {
        type: 'object',
        properties: {
          amount_ml: { type: 'number', description: 'Amount of water in millilitres.' },
          date: { type: 'string', description: 'Date in YYYY-MM-DD format. Use today if not specified.' },
        },
        required: ['amount_ml', 'date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_meal',
      description: 'Delete a meal log entry. Only use this if the user explicitly asks to delete or remove a meal they did not actually eat.',
      parameters: {
        type: 'object',
        properties: {
          meal_log_id: { type: 'string', description: 'The UUID of the meal log to delete.' },
        },
        required: ['meal_log_id'],
      },
    },
  },
]

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    // ── 1. Auth ────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !user) return json({ error: 'Unauthorized' }, 401)

    // ── 2. Parse request ───────────────────────────────────────────────────────
    const body = await req.json()
    const text: string = body.text?.trim()
    const meal_type: string = body.meal_type ?? inferMealType()
    const logged_date: string = body.logged_date ?? today()
    const editMealLogId: string | undefined = body.meal_log_id ?? undefined

    if (!text) return json({ error: 'text is required' }, 400)

    // ── 3. Load today's chat history ───────────────────────────────────────────
    const historyMessages = await loadChatHistory(supabase, user.id, logged_date)

    // ── 4. Build messages array for the AI ────────────────────────────────────
    // System prompt sets the persona. History gives context. User message is new.
    // No data dump — the AI calls tools if it needs data.
    const messages: Array<Record<string, unknown>> = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'system', content: `Current date: ${logged_date}. User's timezone context: messages are in local time.` },
      ...historyMessages,
      { role: 'user', content: text },
    ]

    // ── 5. Agent loop: Call 1 → execute tools → Call 2 (if needed) ───────────
    const { result: aiResult, waterLogged } = await runAgentLoop(supabase, user.id, messages)

    // ── 6. Route on intent ─────────────────────────────────────────────────────
    if (aiResult.intent === 'answer') {
      const reply = (aiResult.reply ?? '').trim() || "I'm not sure how to answer that — try rephrasing?"
      await saveChatTurn(supabase, user.id, logged_date, text, reply, null)
      return json({ success: true, type: 'answer', reply, water_logged: waterLogged })
    }

    // ── 7. Food log path ───────────────────────────────────────────────────────
    if (!Array.isArray(aiResult.foods) || aiResult.foods.length === 0) {
      return json({
        error: "I couldn't find any food in that. Try describing what you ate, e.g. \"2 eggs and toast\".",
      }, 422)
    }

    // Resolve macros from real data (cache → USDA → one-time AI estimate).
    // The parse above only identified foods + grams; numbers are computed here.
    const { foods, totals } = await resolveFoods(supabase, aiResult.foods as ParsedFood[], {
      openRouterKey: Deno.env.get('OPENROUTER_API_KEY')!,
      fdcApiKey: Deno.env.get('FDC_API_KEY') ?? '',
      userId: user.id,
    })

    // Get or create meal_log
    let mealLog: { id: string }

    if (editMealLogId) {
      const { data: existing, error: updErr } = await supabase
        .from('meal_logs')
        .update({ caption: text })
        .eq('id', editMealLogId)
        .eq('user_id', user.id)
        .select('id')
        .single()

      if (updErr) throw updErr
      if (!existing) return json({ error: 'Meal not found' }, 404)
      mealLog = existing

      const { error: delErr } = await supabase
        .from('food_entries')
        .delete()
        .eq('meal_log_id', mealLog.id)
      if (delErr) throw delErr
    } else {
      const { data: created, error: mealLogErr } = await supabase
        .from('meal_logs')
        .insert({ user_id: user.id, logged_date, meal_type, caption: text })
        .select('id')
        .single()
      if (mealLogErr) throw mealLogErr
      mealLog = created
    }

    // Insert food entries. Each references the shared food_items cache row the
    // resolver returned — no more one-off food_items rows per log.
    const savedEntries = []
    for (const food of foods) {
      const { data: entry, error: entryErr } = await supabase
        .from('food_entries')
        .insert({
          meal_log_id: mealLog.id,
          user_id: user.id,
          food_item_id: food.food_item_id,
          food_name: food.name,
          quantity_g: food.quantity_g,
          quantity_label: food.quantity_description,
          calories: food.calories,
          protein_g: food.protein_g,
          carbs_g: food.carbs_g,
          fat_g: food.fat_g,
          fiber_g: food.fiber_g ?? 0,
          source: 'ai_text',
          ai_confidence: food.confidence,
          macro_source: food.macro_source,
        })
        .select()
        .single()
      if (entryErr) throw entryErr
      savedEntries.push(entry)
    }

    // The coach_note is the AI's personalised insight about this specific meal.
    // It's saved as the assistant message so it appears in history and is readable.
    const coachNote = aiResult.coach_note ?? `Logged ${aiResult.meal_name} — ${Math.round(totals.calories)} cal`
    await saveChatTurn(supabase, user.id, logged_date, text, coachNote, mealLog.id)

    return json({
      success: true,
      type: 'log',
      meal_log_id: mealLog.id,
      meal_name: aiResult.meal_name,
      coach_note: coachNote,
      input_text: text,
      logged_date,
      meal_type,
      foods,
      totals,
      entries: savedEntries,
    })
  } catch (err) {
    console.error('log-food-from-text error:', err)
    return json({ error: err?.message ?? 'Internal server error' }, 500)
  }
})

// ── Agent loop ────────────────────────────────────────────────────────────────
// Call 1: AI decides what to do (may request tool calls or respond directly).
// If tools requested: execute them, append results, Call 2: AI gives final answer.
// Max 2 LLM calls. Simple messages (food log, simple Q&A) only use 1 call.
// deno-lint-ignore no-explicit-any
async function runAgentLoop(supabase: any, userId: string, messages: Array<Record<string, unknown>>): Promise<{ result: Record<string, unknown>; waterLogged: boolean }> {
  const call1 = await callOpenRouter(messages, TOOLS)

  // No tool calls → AI responded directly (food log JSON or simple answer)
  if (!call1.tool_calls || call1.tool_calls.length === 0) {
    return { result: parseAIContent(call1.content ?? ''), waterLogged: false }
  }

  // AI requested tool calls — execute them against Supabase.
  // Track whether log_water actually succeeded so the client knows to refresh
  // its water store — the water insert happens server-side here, so nothing
  // on the client would otherwise know a new row exists.
  let waterLogged = false

  const toolResults = await Promise.all(
    call1.tool_calls.map(async (tc: Record<string, unknown>) => {
      const fnName = (tc.function as Record<string, unknown>).name as string
      const fnArgs = JSON.parse((tc.function as Record<string, unknown>).arguments as string ?? '{}')
      const result = await executeTool(supabase, userId, fnName, fnArgs)
      if (fnName === 'log_water' && (result as Record<string, unknown>)?.success) {
        waterLogged = true
      }
      return {
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      }
    })
  )

  // Call 2: give the AI the tool results and get the final response
  const messagesWithTools = [
    ...messages,
    { role: 'assistant', tool_calls: call1.tool_calls },
    ...toolResults,
  ]

  const call2 = await callOpenRouter(messagesWithTools, TOOLS)
  return { result: parseAIContent(call2.content ?? ''), waterLogged }
}

// ── OpenRouter call wrapper ───────────────────────────────────────────────────
async function callOpenRouter(messages: Array<Record<string, unknown>>, tools: typeof TOOLS): Promise<Record<string, unknown>> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('OPENROUTER_API_KEY')}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://steadyapp.io',
      'X-Title': 'STEADY',
    },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini',
      temperature: 0,
      messages,
      tools,
      tool_choice: 'auto',
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`OpenRouter: ${errText}`)
  }

  const data = await res.json()
  return data.choices[0].message
}

// ── Tool executor ─────────────────────────────────────────────────────────────
// Dispatches tool calls to the appropriate Supabase query.
// Each tool returns a plain object that gets JSON-stringified and fed back to the AI.
// deno-lint-ignore no-explicit-any
async function executeTool(supabase: any, userId: string, name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'get_daily_summary': {
      const date = (args.date as string) ?? today()
      const [{ data: summary }, { data: profile }] = await Promise.all([
        supabase
          .from('daily_summaries')
          .select('total_calories, total_protein_g, total_carbs_g, total_fat_g, total_water_ml, meal_count')
          .eq('user_id', userId)
          .eq('summary_date', date)
          .maybeSingle(),
        supabase
          .from('profiles')
          .select('calorie_goal, protein_goal_g, carb_goal_g, fat_goal_g, water_goal_ml')
          .eq('id', userId)
          .single(),
      ])
      const eaten = Math.round(summary?.total_calories ?? 0)
      const goal = profile?.calorie_goal ?? 2000
      return {
        date,
        calories_eaten: eaten,
        calorie_goal: goal,
        calories_remaining: Math.max(goal - eaten, 0),
        protein_g: Math.round(summary?.total_protein_g ?? 0),
        protein_goal_g: profile?.protein_goal_g ?? null,
        carbs_g: Math.round(summary?.total_carbs_g ?? 0),
        carbs_goal_g: profile?.carb_goal_g ?? null,
        fat_g: Math.round(summary?.total_fat_g ?? 0),
        fat_goal_g: profile?.fat_goal_g ?? null,
        water_ml: Math.round(summary?.total_water_ml ?? 0),
        water_goal_ml: profile?.water_goal_ml ?? 2500,
        meals_logged: summary?.meal_count ?? 0,
      }
    }

    case 'get_food_logs': {
      const date = (args.date as string) ?? today()
      const { data } = await supabase
        .from('meal_logs')
        .select('id, meal_type, caption, created_at, food_entries(food_name, quantity_g, quantity_label, calories, protein_g, carbs_g, fat_g)')
        .eq('user_id', userId)
        .eq('logged_date', date)
        .order('created_at', { ascending: true })
      return {
        date,
        meals: (data ?? []).map((m: Record<string, unknown>) => ({
          meal_id: m.id,
          meal_type: m.meal_type,
          user_description: m.caption,
          foods: m.food_entries,
        })),
      }
    }

    case 'get_weight_history': {
      const days = Math.min(Number(args.days ?? 14), 30)
      const { data } = await supabase
        .from('weight_logs')
        .select('logged_date, weight_kg, notes')
        .eq('user_id', userId)
        .order('logged_date', { ascending: false })
        .limit(days)
      return { entries: (data ?? []).reverse() }
    }

    case 'get_user_profile': {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, date_of_birth, sex, height_cm, current_weight_kg, goal_weight_kg, goal, activity_level, calorie_goal, protein_goal_g, carb_goal_g, fat_goal_g, water_goal_ml, dietary_restrictions, deadline_date')
        .eq('id', userId)
        .single()
      if (!data) return { error: 'Profile not found' }

      // Compute age from date_of_birth
      let age: number | null = null
      if (data.date_of_birth) {
        const dob = new Date(data.date_of_birth)
        age = new Date().getFullYear() - dob.getFullYear()
      }

      return { ...data, age_years: age }
    }

    case 'get_streak': {
      const { data } = await supabase
        .from('streaks')
        .select('current_streak, longest_streak, last_logged_date')
        .eq('user_id', userId)
        .maybeSingle()
      return data ?? { current_streak: 0, longest_streak: 0, last_logged_date: null }
    }

    case 'get_water_intake': {
      const date = (args.date as string) ?? today()
      const { data } = await supabase
        .from('water_logs')
        .select('amount_ml, logged_at')
        .eq('user_id', userId)
        .gte('logged_at', `${date}T00:00:00.000Z`)
        .lte('logged_at', `${date}T23:59:59.999Z`)
      const total = (data ?? []).reduce((sum: number, r: Record<string, number>) => sum + (r.amount_ml ?? 0), 0)
      return { date, total_ml: total, entries: data ?? [] }
    }

    case 'log_water': {
      const amount_ml = Number(args.amount_ml)
      const date = (args.date as string) ?? today()
      if (!amount_ml || amount_ml <= 0) return { error: 'Invalid amount' }
      const { error } = await supabase
        .from('water_logs')
        .insert({ user_id: userId, logged_date: date, amount_ml })
      if (error) return { error: error.message }
      return { success: true, logged_ml: amount_ml, date }
    }

    case 'delete_meal': {
      const meal_log_id = args.meal_log_id as string
      if (!meal_log_id) return { error: 'meal_log_id required' }
      const { error } = await supabase
        .from('meal_logs')
        .delete()
        .eq('id', meal_log_id)
        .eq('user_id', userId) // ownership guard
      if (error) return { error: error.message }
      return { success: true, deleted_meal_log_id: meal_log_id }
    }

    default:
      return { error: `Unknown tool: ${name}` }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// Parse the AI's text content as JSON. The AI always returns JSON per the system prompt.
function parseAIContent(content: string): Record<string, unknown> {
  try {
    return JSON.parse(content)
  } catch {
    // Fallback: treat as plain answer if JSON parse fails
    return { intent: 'answer', reply: content.trim() || "Something went wrong. Try again." }
  }
}

// Load today's chat history as OpenAI message format for context replay.
// Queries by chat_date (the user's local date sent from the app) rather than UTC
// created_at timestamps — this correctly handles users in non-UTC timezones who
// chat past midnight local time (their UTC timestamp would be the previous day).
// Capped at 20 messages to keep token cost bounded.
// deno-lint-ignore no-explicit-any
async function loadChatHistory(supabase: any, userId: string, date: string): Promise<Array<{ role: string; content: string }>> {
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('role, content')
      .eq('user_id', userId)
      .eq('chat_date', date)
      .order('created_at', { ascending: true })
      .limit(20)

    if (error || !data) return []
    return data as Array<{ role: string; content: string }>
  } catch {
    return []
  }
}

// Save both the user turn and AI turn to chat_messages for history persistence.
// chat_date stores the user's local date (passed from the app as logged_date) so
// history queries can filter by user-facing date rather than UTC created_at,
// correctly handling non-UTC timezones where created_at may fall on a different date.
// deno-lint-ignore no-explicit-any
async function saveChatTurn(supabase: any, userId: string, date: string, userText: string, aiReply: string, mealLogId: string | null): Promise<void> {
  try {
    const loggedAt = new Date().toISOString()
    await supabase.from('chat_messages').insert([
      {
        user_id: userId,
        role: 'user',
        content: userText,
        message_type: 'chat',
        chat_date: date,
        created_at: loggedAt,
      },
      {
        user_id: userId,
        role: 'assistant',
        content: aiReply,
        message_type: mealLogId ? 'food_log_confirmation' : 'chat',
        meal_log_id: mealLogId,
        chat_date: date,
        created_at: loggedAt,
      },
    ])
  } catch (err) {
    console.error('saveChatTurn error:', err)
  }
}

function today(): string {
  return new Date().toISOString().split('T')[0]
}

function inferMealType(): string {
  const hour = new Date().getUTCHours()
  if (hour >= 5 && hour < 10) return 'breakfast'
  if (hour >= 10 && hour < 15) return 'lunch'
  if (hour >= 15 && hour < 18) return 'snack'
  if (hour >= 18 && hour < 22) return 'dinner'
  return 'other'
}
