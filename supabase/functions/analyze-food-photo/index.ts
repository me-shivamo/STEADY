import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { decode } from 'https://deno.land/std@0.177.0/encoding/base64.ts'
import { resolveFoods, resolveLabelFoods, GRAM_HINTS_PROMPT, type ParsedFood, type ResolvedFood, type Totals } from '../_shared/macroResolver.ts'
import { logAiCall } from '../_shared/aiLogger.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Photo logging normally produces a food log — GPT-5 mini only IDENTIFIES
// foods and portions from the image; macro numbers are resolved afterwards by
// the shared macro resolver (cache → USDA → AI fallback), so photo logs and
// text logs of the same food produce identical numbers.
//
// Two exceptions to that "always produce a food log" rule:
//  1. Nutrition label photos — the label's own macros are ground truth, so we
//     read them directly instead of re-deriving them from a USDA lookup.
//  2. Low-confidence identification — rather than log a guess, the model asks
//     the user to type the food in chat. index.ts detects this response shape
//     and returns it straight to the app without touching the resolver.
const SYSTEM_PROMPT = `You are STEADY, a friendly AI nutritionist inside a calorie-tracking app.
The user has sent you a photo, possibly with an accompanying message. Figure out which of these three
cases it is, then respond accordingly.

── QUANTITY PRIORITY (applies to every case below) ──
The user's accompanying message is the source of truth for portion size whenever it states one — it always
overrides what you'd otherwise estimate or read from the image. Examples: "I ate 90g of this", "I only had
half of it", "this was a large bowl", "2 servings". If the message states or implies a quantity for a food,
use that to set quantity_g (converting units/fractions/multiples as needed) instead of your own visual
estimate or the label's stated serving size. If the message says nothing about quantity, fall back to visual
estimation (CASE 1) or the label's own serving size (CASE 2) as before. This applies per food item — if the
message only specifies quantity for one item in a multi-item photo, use it for that item only.

CASE 1 — Regular meal or food photo
Identify all the food and drink in the image. Return ONLY this JSON, no markdown, no prose outside it:
{
  "meal_name": "brief name for the whole meal (e.g. 'Chicken rice bowl')",
  "foods": [
    {
      "name": "food item name",
      "quantity_description": "e.g. 2 slices, 1 large egg, 1 cup",
      "quantity_g": 120,
      "confidence": 0.85
    }
  ]
}
Rules for this case:
- Identify every visible food item, including sides, sauces, drinks, and garnishes
- Do NOT estimate calories or macros yourself — the app computes them from a verified nutrition database
- quantity_g follows the QUANTITY PRIORITY rule above: use the user's stated amount if given, otherwise your
  best gram estimate based on what you can see
- confidence is 0.0–1.0 (how certain you are — lower if the image is unclear or the food is obscured; a
  stated quantity does not raise confidence if the food identification itself is still uncertain)
- Break compound dishes into components where visible (e.g. rice + curry + naan)
${GRAM_HINTS_PROMPT}

CASE 2 — Nutrition label or nutrition facts panel
If the photo is of a nutrition label, ingredient panel, or a chart/table that already lists calories and
macros per serving (not a photo of the actual food), read the exact numbers printed on it — do not estimate.
Return this JSON instead:
{
  "meal_name": "brief name for the product (e.g. 'Oats, 1 serving')",
  "foods": [
    {
      "name": "product/food name as printed on the label",
      "quantity_description": "the label's own serving size, e.g. '1 serving (40g)'",
      "quantity_g": 40,
      "confidence": 0.95,
      "label_serving_g": 40,
      "label_macros": {
        "calories": 150,
        "protein_g": 5,
        "carbs_g": 27,
        "fat_g": 2.5,
        "fiber_g": 3
      }
    }
  ]
}
Rules for this case:
- label_serving_g is the gram weight the label's own numbers are FOR, exactly as printed — e.g. if the panel
  says "per 100g" this is 100; if it says "1 serving (40g)" this is 40. Never scale or convert this value.
- label_macros must be the label's macro values exactly as printed for that label_serving_g — read them
  verbatim, never estimated, never scaled by you. The app does all scaling math in code from these two raw
  numbers, so do NOT attempt to compute values for a different quantity yourself — always report the label's
  own unscaled numbers here, no matter what quantity_g ends up being.
- quantity_g follows the QUANTITY PRIORITY rule above: if the user stated an amount (e.g. "I ate 90g of
  this"), set quantity_g to that amount. If the user did not state a quantity, quantity_g equals
  label_serving_g (i.e. quantity_description and quantity_g describe the label's own serving).
- quantity_description should describe whichever quantity you used — the label's serving size, or the
  user's stated amount if that took priority.
- If a value isn't printed on the label (e.g. no fiber listed), omit that key from label_macros entirely.
- confidence here reflects how legible/complete the label was, not food-identification uncertainty.

CASE 3 — Cannot identify the food
If the food in the photo is too unclear, obscured, or ambiguous to identify with reasonable confidence
(this does not apply to label photos — read those regardless of image quality, per CASE 2), do not guess.
Return this JSON instead:
{
  "status": "needs_clarification",
  "message": "I couldn't quite make out what's in this photo — could you type the food items here in the chat?"
}
Use CASE 3 only when you are genuinely unsure what the food is — not merely uncertain about the exact
portion size. If you can identify the food but are unsure of the amount, use CASE 1 with a lower confidence
value instead of asking for clarification.`

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
      // Uses OPENROUTER_IMAGE_API_KEY (separate from text key) for independent cost tracking.
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
          { role: 'system', content: SYSTEM_PROMPT },
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
              'Authorization': `Bearer ${Deno.env.get('OPENROUTER_IMAGE_API_KEY')}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://steadyapp.io',
              'X-Title': 'STEADY-photo',
            },
            body: JSON.stringify({
              model,
              temperature: 0,
              response_format: { type: 'json_object' },
              messages: [
                { role: 'system', content: SYSTEM_PROMPT },
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
    // CASE 1 items go through the normal cache → USDA → AI-estimate pipeline.
    // Foods are kept in original array order after resolving, since they were
    // split by index and merged back rather than resolved as two ordered lists.
    const allFoods = aiResult.foods as ParsedFood[]
    const labelIndices: number[] = []
    const normalIndices: number[] = []
    allFoods.forEach((f, i) => (f.label_macros ? labelIndices : normalIndices).push(i))

    const [labelResolved, normalResult] = await Promise.all([
      labelIndices.length > 0
        ? resolveLabelFoods(supabase, labelIndices.map((i) => allFoods[i]))
        : Promise.resolve([] as ResolvedFood[]),
      normalIndices.length > 0
        // Resolve macros from real data (cache → USDA → one-time AI estimate).
        // GPT-5 mini only identified foods + grams above; numbers are computed here.
        // The resolver's internal match call uses the text OPENROUTER_API_KEY so
        // image-key cost tracking stays clean.
        ? resolveFoods(supabase, normalIndices.map((i) => allFoods[i]), {
            openRouterKey: Deno.env.get('OPENROUTER_API_KEY')!,
            fdcApiKey: Deno.env.get('FDC_API_KEY') ?? '',
            userId: user.id,
          })
        : Promise.resolve({ foods: [] as ResolvedFood[], totals: null }),
    ])

    const foods: ResolvedFood[] = new Array(allFoods.length)
    labelIndices.forEach((origIdx, j) => { foods[origIdx] = labelResolved[j] })
    normalIndices.forEach((origIdx, j) => { foods[origIdx] = normalResult.foods[j] })

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
    // Each references the shared food_items cache row the resolver returned —
    // no more one-off food_items rows per log. A single batched insert instead
    // of one round trip per food — for a 4-item meal that's 1 DB call instead
    // of 4 sequential ones.
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
        source: 'ai_photo',
        ai_confidence: food.confidence,
        macro_source: food.macro_source,
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
    const confirmationNote = `Logged ${aiResult.meal_name} — ${Math.round(totals.calories)} cal`
    await saveChatTurn(supabase, user.id, logged_date, caption, confirmationNote, mealLog.id, requestStartedAt)

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
// deno-lint-ignore no-explicit-any
async function saveChatTurn(supabase: any, userId: string, date: string, userCaption: string, aiNote: string, mealLogId: string, userSentAt: string): Promise<void> {
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
