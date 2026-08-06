import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveFoods, normalizeName, type ParsedFood, type ResolvedFood, type MacroSource } from '../_shared/macroResolver.ts'
import { logAiCall } from '../_shared/aiLogger.ts'
import { SYSTEM_PROMPT } from '../_shared/foodParsePrompt.ts'

// One entry as it existed before an edit — sent by the client so the AI (and
// the rescale guard below) can tell "same food, new quantity" apart from
// "genuinely different food" instead of re-deriving nutrition facts blind.
interface PreviousEntry {
  name: string
  quantity_g: number
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
  food_item_id: string | null
  macro_source: MacroSource | null
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
    const meal_type: string = body.meal_type ?? inferMealType(body.logged_hour)
    const logged_date: string = body.logged_date ?? today()
    const editMealLogId: string | undefined = body.meal_log_id ?? undefined
    const previousEntries: PreviousEntry[] = Array.isArray(body.previous_entries) ? body.previous_entries : []

    if (!text) return json({ error: 'text is required' }, 400)

    // Captured now, before any DB writes — used to timestamp the user's chat
    // bubble. Without this, saveChatTurn() (called at the very end, after the
    // meal_log row already exists) would stamp the user's own message LATER
    // than the meal it produced, so on reload the sort-by-created_at would
    // place the meal card above the user's text instead of below it.
    const requestStartedAt = new Date().toISOString()

    // ── 3. Load today's chat history ───────────────────────────────────────────
    const historyMessages = await loadChatHistory(supabase, user.id, logged_date)

    // ── 4. Build messages array for the AI ────────────────────────────────────
    // System prompt sets the persona. History gives context. User message is new.
    // No data dump — the AI calls tools if it needs data.
    const messages: Array<Record<string, unknown>> = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'system', content: `Current date: ${logged_date}. User's timezone context: messages are in local time.` },
    ]

    // On an edit, tell the model what the meal's foods currently are so it can
    // tell "same food, new quantity" apart from "genuinely different food" —
    // without this it re-derives nutrition facts from scratch on every edit,
    // even a pure quantity change. This is belt-and-suspenders: the rescale
    // guard after resolveFoods() enforces the same rule deterministically,
    // so a model that ignores this instruction still can't drift the numbers.
    if (editMealLogId && previousEntries.length > 0) {
      const entryLines = previousEntries.map((e) =>
        `- "${e.name}": ${e.quantity_g}g → ${e.calories} cal, ${e.protein_g}g protein, ${e.carbs_g}g carbs, ${e.fat_g}g fat` +
        (e.macro_source === 'label' ? ' [from a nutrition label — these are exact printed values, not estimates]' : '')
      ).join('\n')
      messages.push({
        role: 'system',
        content: `This is an EDIT of an existing meal. Its current foods are:\n${entryLines}\n\n` +
          `For each food in the edited text below: if it is the SAME food as one listed above (same identity, ` +
          `possibly a different quantity), keep quantity_g accurate to the new text — do NOT change your ` +
          `identification of what the food is. Only treat a food as new/different if its name or identity in the ` +
          `edited text genuinely changed. The app recalculates macros from quantity_g after this step, so your ` +
          `only job here is correct food identification and gram amounts, exactly as with a fresh log.`,
      })
    }

    // Placed AFTER history and immediately BEFORE the new message on purpose —
    // a long run of alternating user/assistant turns is a strong in-context
    // pattern for "we're just chatting now", and a reminder stated once at the
    // top of the system prompt loses to that pattern by the time the model
    // reaches turn 10+ (confirmed: saturated 20-message history caused food
    // logs to misclassify as "answer" even with the top-level instruction in
    // place). Restating it right next to the message it governs — the
    // position an LLM weighs most heavily — is what actually holds under load.
    if (historyMessages.length > 0) {
      messages.push({
        role: 'system',
        content: 'Reminder: classify the very next user message on its own content alone, ' +
          'independent of the conversation pattern above. If it describes something eaten or drunk, it is a food log — ' +
          'the number of prior back-and-forth turns today does not change that.',
      })
    }

    messages.push(...historyMessages, { role: 'user', content: text })

    // ── 5. Agent loop: Call 1 → execute tools → Call 2 (if needed) ───────────
    const { result: aiResult, waterLogged } = await runAgentLoop(supabase, user.id, messages)

    // ── 6. Route on intent ─────────────────────────────────────────────────────
    if (aiResult.intent === 'answer') {
      const reply = (aiResult.reply ?? '').trim() || "I'm not sure how to answer that — try rephrasing?"
      await saveChatTurn(supabase, user.id, logged_date, text, reply, null, requestStartedAt)
      return json({ success: true, type: 'answer', reply, water_logged: waterLogged })
    }

    // ── 7. Food log path ───────────────────────────────────────────────────────
    if (!Array.isArray(aiResult.foods) || aiResult.foods.length === 0) {
      return json({
        error: "I couldn't find any food in that. Try describing what you ate, e.g. \"2 eggs and toast\".",
      }, 422)
    }

    // On an edit, deterministically rescale any food that's the same as one of
    // the previous entries (by normalized name) — quantity_g × old_per100g,
    // reusing the SAME food_item_id/macro_source rather than re-resolving.
    // This is the enforcement layer for the system-prompt instruction above:
    // even if the model ignores that instruction and re-derives nutrition
    // facts on its own, this guard overrides its output for matched foods, so
    // a pure quantity edit can never change the macro ratio. Foods with no
    // match (genuinely new/changed identity) fall through to the normal
    // resolveFoods() pipeline, exactly as a fresh log would.
    const previousByName = new Map(previousEntries.map((e) => [normalizeName(e.name), e]))
    const allParsed = aiResult.foods as ParsedFood[]
    const rescaledIndices: number[] = []
    const freshIndices: number[] = []
    const rescaled: ResolvedFood[] = new Array(allParsed.length)

    allParsed.forEach((f, i) => {
      const prev = editMealLogId ? previousByName.get(normalizeName(f.name)) : undefined
      // Only rescale when the food itself carries no fresher ground truth
      // (e.g. a new label_macros from a re-scanned label) and the previous
      // entry actually has a usable macro_source to trust.
      if (prev && !f.label_macros && prev.food_item_id && prev.quantity_g > 0) {
        const ratio = f.quantity_g / prev.quantity_g
        const r1 = (n: number) => Math.round(n * ratio * 10) / 10
        rescaled[i] = {
          ...f,
          calories: r1(prev.calories),
          protein_g: r1(prev.protein_g),
          carbs_g: r1(prev.carbs_g),
          fat_g: r1(prev.fat_g),
          fiber_g: r1(prev.fiber_g),
          food_item_id: prev.food_item_id,
          macro_source: prev.macro_source ?? 'user_created',
        }
        rescaledIndices.push(i)
      } else {
        freshIndices.push(i)
      }
    })

    // Resolve macros from real data (cache → USDA → one-time AI estimate) for
    // anything not covered by the rescale above. The parse only identified
    // foods + grams for these; numbers are computed here, same as a fresh log.
    const freshResolved = freshIndices.length > 0
      ? await resolveFoods(supabase, freshIndices.map((i) => allParsed[i]), {
          openRouterKey: Deno.env.get('OPENROUTER_API_KEY')!,
          fdcApiKey: Deno.env.get('FDC_API_KEY') ?? '',
          userId: user.id,
        })
      : { foods: [] as ResolvedFood[], totals: null }

    const foods: ResolvedFood[] = new Array(allParsed.length)
    rescaledIndices.forEach((origIdx) => { foods[origIdx] = rescaled[origIdx] })
    freshIndices.forEach((origIdx, j) => { foods[origIdx] = freshResolved.foods[j] })

    const r1 = (n: number) => Math.round(n * 10) / 10
    const totals = {
      calories: r1(foods.reduce((s, f) => s + f.calories, 0)),
      protein_g: r1(foods.reduce((s, f) => s + f.protein_g, 0)),
      carbs_g: r1(foods.reduce((s, f) => s + f.carbs_g, 0)),
      fat_g: r1(foods.reduce((s, f) => s + f.fat_g, 0)),
      fiber_g: r1(foods.reduce((s, f) => s + f.fiber_g, 0)),
    }

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
    // resolver returned — no more one-off food_items rows per log. A single
    // batched insert instead of one round trip per food.
    const { data: savedEntries, error: entriesErr } = await supabase
      .from('food_entries')
      .insert(foods.map((food) => ({
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
      })))
      .select()
    if (entriesErr) throw entriesErr

    // The coach_note is the AI's personalised insight about this specific meal.
    // It's saved as the assistant message so it appears in history and is readable.
    const coachNote = aiResult.coach_note ?? `Logged ${aiResult.meal_name} — ${Math.round(totals.calories)} cal`
    await saveChatTurn(supabase, user.id, logged_date, text, coachNote, mealLog.id, requestStartedAt)

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
  const call1 = await callOpenRouter(supabase, userId, messages, TOOLS)

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

  const call2 = await callOpenRouter(supabase, userId, messagesWithTools, TOOLS)
  const call2Content = (call2.content as string | null) ?? ''

  // Call 2 can itself come back asking for MORE tools instead of answering, in
  // which case content is null. We used to hand that empty string straight to
  // parseAIContent, which fell through to "Something went wrong. Try again." —
  // so the user lost their message entirely at what is really just the loop
  // running out of turns. Observed live on Hinglish logs like "maine ek plate
  // biryani khayi". One more call with tool_choice 'none' forces the model to
  // produce an actual answer from what it already has, turning a dead end into
  // a usable response.
  if (call2Content.trim()) {
    return { result: parseAIContent(call2Content), waterLogged }
  }

  // Re-ask with the SAME message list call 2 saw — deliberately not appending
  // call 2's unanswered tool_calls, because the API requires every assistant
  // tool_call to be followed by matching tool-result messages and we have none
  // (that request is exactly what we're declining to run). Adding them produced
  // a 400. tool_choice 'none' removes the option to ask again, so the model has
  // to answer from the tool results already in the conversation.
  const finalCall = await callOpenRouter(supabase, userId, messagesWithTools, TOOLS, 'none')
  return { result: parseAIContent((finalCall.content as string | null) ?? ''), waterLogged }
}

// ── OpenRouter call wrapper ───────────────────────────────────────────────────
// deno-lint-ignore no-explicit-any
async function callOpenRouter(
  supabase: any,
  userId: string,
  messages: Array<Record<string, unknown>>,
  tools: typeof TOOLS,
  toolChoice: 'auto' | 'none' = 'auto',
): Promise<Record<string, unknown>> {
  const model = 'openai/gpt-4o-mini'
  const requestBody = { model, temperature: 0, messages, tools, tool_choice: toolChoice }

  const { response: data } = await logAiCall(supabase, {
    userId,
    source: 'log-food-from-text',
    model,
    requestPayload: requestBody,
    run: async () => {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('OPENROUTER_API_KEY')}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://steadyapp.io',
          'X-Title': 'STEADY',
        },
        body: JSON.stringify(requestBody),
      })

      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`OpenRouter: ${errText}`)
      }

      const json = await res.json()
      return {
        response: json,
        promptTokens: json.usage?.prompt_tokens,
        completionTokens: json.usage?.completion_tokens,
      }
    },
  })

  // deno-lint-ignore no-explicit-any
  return (data as any).choices[0].message
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
      .select('role, content, message_type, meal_log_id')
      .eq('user_id', userId)
      .eq('chat_date', date)
      .order('created_at', { ascending: true })
      .limit(20)

    if (error || !data) return []

    // Replaying every food-log confirmation as its own conversational
    // assistant turn — same role, same prose tone as a genuine coaching
    // answer — teaches the model, purely by repeated pattern, that "this
    // whole conversation is just back-and-forth chat". Past ~10 exchanges in
    // one day (very reachable: breakfast, snack, lunch, water, a question or
    // two, dinner...) that pattern reliably overrides the system prompt and
    // new food logs start getting misclassified as answers too — confirmed
    // by reproducing it directly, and confirmed that tagging/reminding the
    // model in-line did NOT fix it (the sheer volume of repeated shape wins).
    // Real fix: don't replay the pattern at all. Coaching Q&A turns stay as
    // real messages (their content matters for follow-up questions). Food
    // logs collapse into ONE compact system fact-list instead of N separate
    // prose turns — the model still knows what's already logged today
    // (useful context), but there's no repeated "log → prose reply" shape
    // left to pattern-match against.
    const rows = data as Array<{
      role: string; content: string; message_type: string | null; meal_log_id: string | null
    }>
    const loggedFoods: string[] = []
    const conversational: Array<{ role: string; content: string }> = []

    for (let i = 0; i < rows.length; i++) {
      const m = rows[i]
      if (m.role === 'assistant' && m.message_type === 'food_log_confirmation') {
        loggedFoods.push(m.content)
        continue
      }
      // A user turn that produced a meal is folded into the summary line below
      // rather than replayed. Two tests, deliberately:
      //
      //   m.meal_log_id !== null  — the row says so ITSELF. This is the reliable
      //     one, and it is why saveChatTurn now stamps meal_log_id on the user
      //     row too.
      //   rows[i+1] is a confirmation — the original positional test, kept only
      //     as a fallback for rows written before that change.
      //
      // The positional test alone was the bug: it asks a question about the
      // NEIGHBOUR, so deleting a meal (which cascades the neighbour away)
      // silently flipped the answer and resurrected the user's message into the
      // model's context. Identity should never be inferred from an adjacent
      // row's continued existence.
      if (m.role === 'user' && (m.meal_log_id !== null || rows[i + 1]?.message_type === 'food_log_confirmation')) {
        continue
      }
      conversational.push({ role: m.role, content: m.content })
    }

    const result: Array<{ role: string; content: string }> = []
    if (loggedFoods.length > 0) {
      result.push({
        role: 'system',
        content: `Already logged earlier today (for context only — not something to react to or re-log): ${loggedFoods.length} meal(s) logged.`,
      })
    }
    result.push(...conversational)
    return result
  } catch {
    return []
  }
}

// Save both the user turn and AI turn to chat_messages for history persistence.
// chat_date stores the user's local date (passed from the app as logged_date) so
// history queries can filter by user-facing date rather than UTC created_at,
// correctly handling non-UTC timezones where created_at may fall on a different date.
// `userSentAt` is the request-start timestamp, not "now" — the user's chat bubble
// must sort BEFORE the meal_log row this same request may have already created
// (see call site), or the feed reorders the food log card above the user's own
// message on reload.
// deno-lint-ignore no-explicit-any
async function saveChatTurn(supabase: any, userId: string, date: string, userText: string, aiReply: string, mealLogId: string | null, userSentAt: string): Promise<void> {
  try {
    await supabase.from('chat_messages').insert([
      {
        user_id: userId,
        role: 'user',
        content: userText,
        message_type: 'chat',
        // The user's own message must carry meal_log_id too, not just the
        // assistant's confirmation. Without it, deleting a meal cascades away
        // the assistant row and STRANDS this one: the bubble stays on screen
        // with no card under it, and — worse — loadChatHistory() stops folding
        // it out of the AI context (it recognises a log's user turn by looking
        // at whether the NEXT row is a food_log_confirmation). The orphan then
        // replays as a live user turn, so the model sees two consecutive user
        // messages, reads them as one utterance, and re-logs the deleted food
        // alongside the new one.
        meal_log_id: mealLogId,
        chat_date: date,
        created_at: userSentAt,
      },
      {
        user_id: userId,
        role: 'assistant',
        content: aiReply,
        message_type: mealLogId ? 'food_log_confirmation' : 'chat',
        meal_log_id: mealLogId,
        chat_date: date,
        created_at: userSentAt,
      },
    ])
  } catch (err) {
    console.error('saveChatTurn error:', err)
  }
}

// Fallback only — the client always sends its own local logged_date (see
// foodLogStore.todayDate()). This has no notion of the user's timezone, so
// it's only correct by coincidence; it exists purely so a malformed request
// still gets *a* date rather than crashing.
function today(): string {
  return new Date().toISOString().split('T')[0]
}

// logged_hour is the user's own local hour (0-23), sent by the client
// alongside logged_date. The server has no timezone of its own — guessing
// from its own clock would mislabel meals for anyone outside UTC (e.g.
// dinner in India is still UTC afternoon). Falls back to server UTC hour
// only if the client omitted it entirely.
function inferMealType(localHour?: number): string {
  const hour = typeof localHour === 'number' ? localHour : new Date().getUTCHours()
  if (hour >= 5 && hour < 10) return 'breakfast'
  if (hour >= 10 && hour < 15) return 'lunch'
  if (hour >= 15 && hour < 18) return 'snack'
  if (hour >= 18 && hour < 22) return 'dinner'
  return 'other'
}
