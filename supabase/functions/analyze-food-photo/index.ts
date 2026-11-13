import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { decode } from 'https://deno.land/std@0.177.0/encoding/base64.ts'
import {
  resolveFoods, planLabelFoods, commitLabelFoods, placeFoods, memoryModeFromEnv, searchModeFromEnv, effectiveSearch, usdaModeFromEnv, effectiveUsda, aiMacrosModeFromEnv, effectiveAiMacros,
  unsureReply, estimateNote, portionColumns,
  entryQuantityLabel, type ParsedFood, type ResolvedFood, type Totals, type UnresolvedFood, type ResolveResult,
} from '../_shared/macroResolver.ts'
import { logAiCall } from '../_shared/aiLogger.ts'
import { openRouterKeyFor } from '../_shared/aiKeys.ts'
import { PHOTO_PROMPT_V1, PHOTO_PROMPT_V2 } from '../_shared/photoPrompt.ts'
import { validateParsedFoodV2 } from '../_shared/parseSchema.ts'
import { effectivePortion, loadRegion, portionModeFromEnv } from '../_shared/portionStore.ts'
import { LABEL_CONFIDENCE } from '../_shared/portions.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Photo logging normally produces a food log — GPT-5 mini only IDENTIFIES
// foods and portions from the image; macro numbers are resolved afterwards by
// the shared macro resolver (memory → verified base → USDA → AI estimate), so
// photo logs and text logs of the same food produce identical numbers.
//
// Two exceptions to that "always produce a food log" rule:
//  1. Nutrition label photos — the label's own macros are ground truth, so we
//     read them directly instead of re-deriving them from a USDA lookup.
//  2. Low-confidence identification — rather than log a guess, the model asks
//     the user to type the food in chat. index.ts detects this response shape
//     and returns it straight to the app without touching the resolver.
const SYSTEM_PROMPT = PHOTO_PROMPT_V1   // _shared/photoPrompt.ts (moved verbatim; V2 is used in PORTION_MODE table)

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  // Captured once, up front — reused as the user's chat-bubble timestamp so it
  // always sorts before the meal_log row this same request creates (mirrors
  // the same fix in log-food-from-text/index.ts's requestStartedAt).
  const requestStartedAt = new Date().toISOString()

  try {
    // ── 1. Verify JWT → get user ───────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'Missing Authorization header' }, 401)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !user) return json({ error: 'Unauthorized' }, 401)

    // ── 2. Parse request body ──────────────────────────────────────────────────
    const body = await req.json()
    const image_base64: string = body.image_base64
    const mime_type: string    = body.mime_type ?? 'image/jpeg'
    const caption: string      = body.caption?.trim() ?? ''
    const meal_type: string    = body.meal_type ?? inferMealType(body.logged_hour)
    const logged_date: string  = body.logged_date ?? today()

    if (!image_base64) return json({ error: 'image_base64 is required' }, 400)

    // v1.2 Phase 5 (PORTION_MODE: legacy | shadow | eval_only | table; unset or
    // misspelt = legacy = V1 prompt and the vision model's grams, as before).
    const portionEff = effectivePortion(portionModeFromEnv(Deno.env.get('PORTION_MODE')), user.email)
    const portionOn = portionEff.mode !== 'legacy'
    const tableMode = portionEff.mode === 'table'
    const prompt = tableMode ? PHOTO_PROMPT_V2 : SYSTEM_PROMPT

    // The eval account bills OPENROUTER_EVAL_API_KEY when it is set (aiKeys.ts), so
    // test runs can never drain the keys real users' photo logs depend on.
    const aiImageKey = openRouterKeyFor('image', user.email, (k) => Deno.env.get(k))
    const aiTextKey = openRouterKeyFor('text', user.email, (k) => Deno.env.get(k))
    // the user's region (profiles.timezone), read while the vision model looks
    const regionP = portionOn ? loadRegion(supabase, user.id) : null

    // ── 3-5. Upload photo + build AI context + call OpenRouter, concurrently ──
    // None of these three depend on each other's output — the storage upload
    // only needs to finish before we can create a signed URL and before the
    // final response goes out, not before the vision call. Running them
    // together instead of one-after-another saves the full duration of
    // whichever finishes first (previously they ran fully sequentially).
    const ext = mime_type === 'image/png' ? 'png' : 'jpg'
    const fileName = `${user.id}/${crypto.randomUUID()}.${ext}`
    const imageBytes = decode(image_base64)

    const uploadAndSign = (async () => {
      const { error: storageErr } = await supabase.storage
        .from('meal-photos')
        .upload(fileName, imageBytes, { contentType: mime_type, upsert: false })
      if (storageErr) throw new Error(`Storage upload failed: ${storageErr.message}`)

      const { data: signedData, error: signErr } = await supabase.storage
        .from('meal-photos')
        .createSignedUrl(fileName, 60 * 60 * 24)
      if (signErr || !signedData) throw new Error(`Could not sign photo URL: ${signErr?.message}`)
      return signedData.signedUrl
    })()

    const visionCall = (async () => {
      const contextLine = await buildContextLine(supabase, user.id, logged_date)

      // Call OpenRouter → gpt-5-mini Vision.
      // Uses OPENROUTER_IMAGE_API_KEY (separate from text key) for independent cost tracking;
      // the eval account bills OPENROUTER_EVAL_API_KEY instead (see _shared/aiKeys.ts).
      // detail: 'low' → hints low-res tiling (85 base tokens vs high-detail tiling cost).
      // OpenAI's Responses API has a known bug where GPT-5 models ignore this and process
      // at high detail anyway — but that bug is specific to the Responses API; the Chat
      // Completions API (what we call here, via image_url content blocks) reportedly
      // still honors it correctly. Worth re-verifying if latency/cost seems off later.
      const model = 'openai/gpt-5-mini'
      // Logged request omits the base64 image itself (would bloat ai_logs fast) —
      // everything else about the call is captured, including the caption/context text.
      const loggedRequest = {
        model,
        temperature: 0,
        messages: [
          { role: 'system', content: prompt },
          { role: 'system', content: `CONTEXT — ${contextLine}` },
          { role: 'user', content: [{ type: 'image_url', image_url: '[omitted]' }, { type: 'text', text: caption || 'What food is in this photo? Log the nutrition.' }] },
        ],
      }

      const { response: orData } = await logAiCall(supabase, {
        userId: user.id,
        source: 'analyze-food-photo',
        model,
        requestPayload: loggedRequest,
        run: async () => {
          const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${aiImageKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://steadyapp.io',
              'X-Title': 'STEADY-photo',
            },
            body: JSON.stringify({
              model,
              temperature: 0,
              response_format: { type: 'json_object' },
              messages: [
                { role: 'system', content: prompt },
                { role: 'system', content: `CONTEXT — ${contextLine}` },
                {
                  role: 'user',
                  content: [
                    {
                      type: 'image_url',
                      image_url: {
                        url: `data:${mime_type};base64,${image_base64}`,
                        detail: 'low',
                      },
                    },
                    {
                      type: 'text',
                      text: caption || 'What food is in this photo? Log the nutrition.',
                    },
                  ],
                },
              ],
            }),
          })

          if (!orRes.ok) {
            const errText = await orRes.text()
            throw new Error(`OpenRouter: ${errText}`)
          }

          const json = await orRes.json()
          return {
            response: json,
            promptTokens: json.usage?.prompt_tokens,
            completionTokens: json.usage?.completion_tokens,
          }
        },
      })

      // deno-lint-ignore no-explicit-any
      return JSON.parse((orData as any).choices[0].message.content)
    })()

    const [signedUrl, aiResult] = await Promise.all([uploadAndSign, visionCall])

    // CASE 3 from the system prompt: the model couldn't identify the food
    // with confidence and is asking the user to type it in chat instead of
    // logging a guess. Hand this straight back — no resolver, no DB writes.
    if (aiResult.status === 'needs_clarification') {
      return json({
        success: false,
        type: 'needs_clarification',
        message: aiResult.message ?? 'Could you type the food items in the chat?',
      }, 200)
    }

    if (!Array.isArray(aiResult.foods) || aiResult.foods.length === 0) {
      return json({
        error: "I couldn't identify any food in that photo. Try a clearer shot with better lighting.",
      }, 422)
    }

    // CASE 2 items (nutrition-label photos) carry label_macros and skip the
    // resolver entirely — their numbers are read off the label, not derived.
    // CASE 1 items go through the normal memory → verified base → USDA →
    // AI-estimate pipeline.
    // Foods are kept in original array order after resolving, since they were
    // split by index and merged back rather than resolved as two ordered lists.
    // Table mode: CASE 1 foods come in the V2 shape (count/unit/size, the
    // caption's stated amount, a visual fallback_g); label foods keep V1's.
    let allFoods = aiResult.foods as ParsedFood[]
    if (tableMode) {
      let invented = 0
      allFoods = (aiResult.foods as Array<Record<string, unknown>>).flatMap((raw): ParsedFood[] => {
        if (raw && typeof raw === 'object' && raw.label_macros) return [raw as unknown as ParsedFood]
        const v = validateParsedFoodV2(raw, caption)
        if (v.invented_stated) invented++
        if (!v.ok || !v.food) return []
        const f = v.food
        return [{
          name: f.name, quantity_description: f.quantity_description, quantity_g: f.portion.fallback_g ?? 0,
          confidence: f.confidence, portion_parse: f.portion, cooking_fat: f.cooking_fat,
        }]
      })
      if (invented > 0) console.log(`[portion] invented_stated ${invented}`)
      if (allFoods.length === 0) {
        return json({ error: "I couldn't identify any food in that photo. Try a clearer shot with better lighting." }, 422)
      }
    }
    const labelIndices: number[] = []
    const normalIndices: number[] = []
    allFoods.forEach((f, i) => (f.label_macros ? labelIndices : normalIndices).push(i))

    // Decide the whole photo before writing anything: label foods are planned
    // (pure arithmetic, no I/O), then the normal foods are resolved, and only
    // then are the label rows committed — so a photo where nothing at all
    // could be logged leaves no food_items rows behind.
    //
    // Resolve macros from real data (memory → verified base → USDA → AI estimate).
    // GPT-5 mini only identified foods + grams above; numbers are computed here.
    // The resolver's internal match call uses the text OPENROUTER_API_KEY so
    // image-key cost tracking stays clean (eval account: its own key, see aiKeys.ts).
    const memory = memoryModeFromEnv(Deno.env.get('RESOLVER_MEMORY'))
    const labelPlan = planLabelFoods(labelIndices.map((i) => allFoods[i]))
    const normalResult = normalIndices.length > 0
      ? await resolveFoods(supabase, normalIndices.map((i) => allFoods[i]), {
          openRouterKey: aiTextKey,
          fdcApiKey: Deno.env.get('FDC_API_KEY') ?? '',
          userId: user.id,
          memory,
          // RESOLVER_SEARCH (fts | eval_only | ranked): the Phase 4 DB search, same secret as text logs.
          search: effectiveSearch(searchModeFromEnv(Deno.env.get('RESOLVER_SEARCH')), user.email),
          // RESOLVER_USDA (api | eval_only | local): the Phase 7 local USDA rows, same secret as text logs.
          usda: effectiveUsda(usdaModeFromEnv(Deno.env.get('RESOLVER_USDA')), user.email),
          // RESOLVER_AI_MACROS (legacy | eval_only | computed): AI estimates with computed, category-bounded calories
          aiMacros: effectiveAiMacros(aiMacrosModeFromEnv(Deno.env.get('RESOLVER_AI_MACROS')), user.email),
          ...(portionOn ? { portion: { ...portionEff, region: await regionP!, userText: caption, channel: 'photo' as const } } : {}),
        })
      : { foods: [] as ResolvedFood[], totals: null, unresolved: [] as UnresolvedFood[] }

    // Founder decision D5, "log the rest, flag the unknown": a food we could
    // not put a single usable number on is left out and named in the note,
    // and the rest of the photo still logs. Only when EVERY food is unusable
    // do we fall back to CASE 3's shape — nothing written to meal_logs,
    // food_entries or food_items.
    const unresolved = [
      ...labelPlan.unresolved.map((u) => ({ ...u, index: labelIndices[u.index] })),
      ...normalResult.unresolved.map((u) => ({ ...u, index: normalIndices[u.index] })),
    ]
    if (labelPlan.plans.length === 0 && normalResult.foods.length === 0) {
      const message = unsureReply(unresolved.map((u) => u.name), 'photo')
      return json({
        success: false,
        type: 'needs_clarification',
        message,
        // The installed app reads only `error` from a failed photo response
        // (and today shows its own generic "couldn't log that meal" copy for
        // any message it does not recognise). Sending the specific reply here
        // too lets a later build show it without another server change.
        error: message,
        unresolved: unresolved.map((u) => ({ name: u.name, reason: u.reason })),
      }, 200)
    }

    const labelResolved = (labelPlan.plans.length > 0
      ? await commitLabelFoods(supabase, labelPlan.plans, { userId: user.id, memory })
      : [] as ResolvedFood[])
      // table mode: a label's grams are the label's (portion_source 'label')
      .map((f) => tableMode ? {
        ...f,
        portion: { unit: 'g' as const, size: null, count: 1, grams_per_unit: f.quantity_g, source: 'label' as const, ref: 'nutrition label', confidence: LABEL_CONFIDENCE, needs_follow_up: false },
        options: [],
      } : f)

    // Merge back into the photo's original order. Left-out foods leave a gap
    // that is dropped below, so every later food keeps its own numbers.
    const placed: Array<ResolvedFood | undefined> = new Array(allFoods.length)
    labelPlan.plans.forEach((plan, j) => { placed[labelIndices[plan.index]] = labelResolved[j] })
    placeFoods(placed, normalIndices, normalResult)
    const foods: ResolvedFood[] = placed.filter((f): f is ResolvedFood => f !== undefined)
    // table mode: the resolver's own lines (the cooking-fat rule) go after the photo's foods
    const extras = (normalResult as Partial<ResolveResult>).extras
    if (tableMode && extras?.length) foods.push(...extras)

    const r1 = (n: number) => Math.round(n * 10) / 10
    const totals: Totals = {
      calories: r1(foods.reduce((s, f) => s + f.calories, 0)),
      protein_g: r1(foods.reduce((s, f) => s + f.protein_g, 0)),
      carbs_g: r1(foods.reduce((s, f) => s + f.carbs_g, 0)),
      fat_g: r1(foods.reduce((s, f) => s + f.fat_g, 0)),
      fiber_g: r1(foods.reduce((s, f) => s + f.fiber_g, 0)),
    }

    // ── 6. Insert meal_log with photo_url ──────────────────────────────────────
    const { data: mealLog, error: mealLogErr } = await supabase
      .from('meal_logs')
      .insert({
        user_id: user.id,
        logged_date,
        meal_type,
        caption: caption || aiResult.meal_name,
        photo_url: fileName,
      })
      .select('id')
      .single()

    if (mealLogErr) throw mealLogErr

    // ── 7. Insert food_entries for each resolved food ──────────────────────────
    // Each references the food_items row the resolver returned: a shared
    // verified row, or one of this user's own private rows (AI estimates,
    // personal USDA picks, label scans — since 050 those are never shared).
    // A single batched insert instead of one round trip per food — for a
    // 4-item meal that's 1 DB call instead of 4 sequential ones.
    const { data: savedEntries, error: entriesErr } = await supabase
      .from('food_entries')
      .insert(foods.map((food) => ({
        meal_log_id: mealLog.id,
        user_id: user.id,
        food_item_id: food.food_item_id,
        food_name: food.name,
        quantity_g: food.quantity_g,
        // "1 plate · rough estimate" for a rough entry: the one D5 flag the
        // installed app shows on the card (see entryQuantityLabel).
        quantity_label: entryQuantityLabel(food),
        calories: food.calories,
        protein_g: food.protein_g,
        carbs_g: food.carbs_g,
        fat_g: food.fat_g,
        fiber_g: food.fiber_g ?? 0,
        source: 'ai_photo',
        ai_confidence: food.confidence,
        macro_source: food.macro_source,
        // table mode only: what the portion was (054's five columns)
        ...(tableMode ? portionColumns(food) : {}),
      })))
      .select()

    if (entriesErr) throw entriesErr

    // ── 8. Save chat history so "Log + Coach" can replay this turn later ───────
    // Photo logs previously never wrote to chat_messages at all — the meal card
    // itself persists fine (meal_logs/food_entries), but any caption the user
    // typed alongside the photo, plus the AI's confirmation line, would vanish
    // the moment the screen re-fetched history. Mirrors log-food-from-text's
    // saveChatTurn: a user row (only if a caption was actually typed) and an
    // assistant row tagged food_log_confirmation + meal_log_id.
    // D5: one short sentence naming any rough estimate (and where to adjust it)
    // or any food left out (add it manually), so the user knows which number
    // to check. No installed build renders coach_note, so saveChatTurn also
    // writes that sentence as its own chat row, which Home does show.
    const note = estimateNote(
      foods.filter((f) => f.rough).map((f) => f.name),
      unresolved.map((u) => u.name),
    )
    const confirmationNote = `Logged ${aiResult.meal_name} — ${Math.round(totals.calories)} cal` + (note ? ` ${note}` : '')
    await saveChatTurn(supabase, user.id, logged_date, caption, confirmationNote, mealLog.id, requestStartedAt, note)

    // ── 9. Return the full logged meal to the app ──────────────────────────────
    return json({
      success: true,
      type: 'log',
      meal_log_id: mealLog.id,
      meal_name: aiResult.meal_name,
      photo_url: signedUrl,
      logged_date,
      meal_type,
      foods,
      totals,
      entries: savedEntries,
      // Additive fields (the current app ignores them): the same confirmation
      // line saved to chat history, and any food left out of this log.
      coach_note: confirmationNote,
      unresolved: unresolved.map((u) => ({ name: u.name, reason: u.reason })),
    })
  } catch (err) {
    console.error('analyze-food-photo error:', err)
    return json({ error: err?.message ?? 'Internal server error' }, 500)
  }
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// deno-lint-ignore no-explicit-any
async function buildContextLine(supabase: any, userId: string, loggedDate: string): Promise<string> {
  try {
    const [{ data: profile }, { data: summary }] = await Promise.all([
      supabase
        .from('profiles')
        .select('calorie_goal, protein_goal_g, carb_goal_g, fat_goal_g, goal, dietary_restrictions')
        .eq('id', userId)
        .single(),
      supabase
        .from('daily_summaries')
        .select('total_calories, total_protein_g, total_carbs_g, total_fat_g')
        .eq('user_id', userId)
        .eq('summary_date', loggedDate)
        .maybeSingle(),
    ])

    const calGoal = profile?.calorie_goal ?? 2000
    const eaten   = Math.round(summary?.total_calories ?? 0)
    const remain  = Math.max(calGoal - eaten, 0)
    const protein = Math.round(summary?.total_protein_g ?? 0)
    const carbs   = Math.round(summary?.total_carbs_g ?? 0)
    const fat     = Math.round(summary?.total_fat_g ?? 0)
    const goal    = profile?.goal ?? 'maintain'
    const restr   = (profile?.dietary_restrictions ?? []).join(', ') || 'none'

    return `Today so far: ${eaten}/${calGoal} cal (${remain} remaining), ` +
           `${protein}g protein, ${carbs}g carbs, ${fat}g fat. ` +
           `Goal: ${goal}. Dietary restrictions: ${restr}.`
  } catch (_err) {
    return 'No nutrition context available yet today.'
  }
}

// Fallback only — the client always sends its own local logged_date (see
// foodLogStore.todayDate()). Has no notion of the user's timezone; exists
// purely so a malformed request still gets *a* date rather than crashing.
function today(): string {
  return new Date().toISOString().split('T')[0]
}

// Save this photo-log turn to chat_messages so "Log + Coach" history can
// replay it later. Only inserts a user row when a caption was actually typed
// — a photo sent with no text shouldn't produce an empty chat bubble.
// chat_date stores the user's local date (same convention as log-food-from-text)
// so history queries filter by the user-facing day, not UTC created_at.
// `flagNote` (D5's rough-estimate / left-out line) becomes a separate
// assistant 'chat' row, exactly as in log-food-from-text's saveChatTurn: Home
// hides confirmation rows and never reads coach_note, but shows chat rows. Its
// created_at is the database's now(), after the meal_log, so it sorts under
// the card; meal_log_id makes it go when the meal is deleted.
// deno-lint-ignore no-explicit-any
async function saveChatTurn(supabase: any, userId: string, date: string, userCaption: string, aiNote: string, mealLogId: string, userSentAt: string, flagNote = ''): Promise<void> {
  try {
    const rows = []
    if (userCaption.trim()) {
      rows.push({
        user_id: userId,
        role: 'user',
        content: userCaption,
        message_type: 'chat',
        // Same reasoning as log-food-from-text: without meal_log_id here, a
        // deleted meal cascades the assistant row away and leaves this caption
        // stranded — visible in the thread with no card, and replayed into the
        // AI context so the deleted food gets logged again on the next message.
        meal_log_id: mealLogId,
        chat_date: date,
        created_at: userSentAt,
      })
    }
    rows.push({
      user_id: userId,
      role: 'assistant',
      content: aiNote,
      message_type: 'food_log_confirmation',
      meal_log_id: mealLogId,
      chat_date: date,
      created_at: userSentAt,
    })
    await supabase.from('chat_messages').insert(rows)
    if (flagNote) {
      await supabase.from('chat_messages').insert({
        user_id: userId,
        role: 'assistant',
        content: flagNote,
        message_type: 'chat',
        meal_log_id: mealLogId,
        chat_date: date,
      })
    }
  } catch (err) {
    console.error('saveChatTurn error:', err)
  }
}

// logged_hour is the user's own local hour (0-23), sent by the client. The
// server has no timezone of its own — guessing from its own clock would
// mislabel meals for anyone outside UTC. Falls back to server UTC hour only
// if the client omitted it entirely.
function inferMealType(localHour?: number): string {
  const hour = typeof localHour === 'number' ? localHour : new Date().getUTCHours()
  if (hour >= 5 && hour < 10) return 'breakfast'
  if (hour >= 10 && hour < 15) return 'lunch'
  if (hour >= 15 && hour < 18) return 'snack'
  if (hour >= 18 && hour < 22) return 'dinner'
  return 'other'
}
