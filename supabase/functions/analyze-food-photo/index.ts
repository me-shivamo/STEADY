import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { decode } from 'https://deno.land/std@0.177.0/encoding/base64.ts'
import { resolveFoods, GRAM_HINTS_PROMPT, type ParsedFood } from '../_shared/macroResolver.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Photo logging always produces a food log — photos are never Q&A.
// GPT-4o only IDENTIFIES foods and portions from the image. Macro numbers are
// resolved afterwards by the shared macro resolver (cache → USDA → AI fallback),
// so photo logs and text logs of the same food produce identical numbers.
const SYSTEM_PROMPT = `You are STEADY, a friendly AI nutritionist inside a calorie-tracking app.
The user has sent you a photo of their meal. Identify all the food and drink in the image.

Return ONLY a valid JSON object — no markdown, no prose outside the JSON.

Return this exact structure:
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

Rules:
- Identify every visible food item, including sides, sauces, drinks, and garnishes
- Do NOT estimate calories or macros — the app computes them from a verified nutrition database
- quantity_g is your best gram estimate based on what you can see
- confidence is 0.0–1.0 (how certain you are — lower if the image is unclear or the food is obscured)
- Break compound dishes into components where visible (e.g. rice + curry + naan)
- If you cannot identify any food in the image, return foods as an empty array with meal_name "Unknown"
${GRAM_HINTS_PROMPT}`

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

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
    const meal_type: string    = body.meal_type ?? inferMealType()
    const logged_date: string  = body.logged_date ?? today()

    if (!image_base64) return json({ error: 'image_base64 is required' }, 400)

    // ── 3. Upload image to Supabase Storage ────────────────────────────────────
    // Decode base64 → raw bytes, then upload to meal-photos/{userId}/{uuid}.jpg
    // The bucket is PRIVATE (migration 011): the DB stores the storage path and
    // readers exchange it for a short-lived signed URL. The response carries a
    // ready signed URL so the just-logged card renders without a second trip.
    const ext = mime_type === 'image/png' ? 'png' : 'jpg'
    const fileName = `${user.id}/${crypto.randomUUID()}.${ext}`
    const imageBytes = decode(image_base64)

    const { error: storageErr } = await supabase.storage
      .from('meal-photos')
      .upload(fileName, imageBytes, { contentType: mime_type, upsert: false })

    if (storageErr) throw new Error(`Storage upload failed: ${storageErr.message}`)

    const { data: signedData, error: signErr } = await supabase.storage
      .from('meal-photos')
      .createSignedUrl(fileName, 60 * 60 * 24)
    if (signErr || !signedData) throw new Error(`Could not sign photo URL: ${signErr?.message}`)
    const signedUrl = signedData.signedUrl

    // ── 4. Build nutrition context for the AI ─────────────────────────────────
    const contextLine = await buildContextLine(supabase, user.id, logged_date)

    // ── 5. Call OpenRouter → gpt-4o Vision ────────────────────────────────────
    // Uses OPENROUTER_IMAGE_API_KEY (separate from text key) for independent cost tracking.
    // detail: 'low' → GPT-4o tiles the image at 512px — cheapest, fast, more than enough for food.
    const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENROUTER_IMAGE_API_KEY')}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://steadyapp.io',
        'X-Title': 'STEADY-photo',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o',
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

    const orData = await orRes.json()
    const aiResult = JSON.parse(orData.choices[0].message.content)

    if (!Array.isArray(aiResult.foods) || aiResult.foods.length === 0) {
      return json({
        error: "I couldn't identify any food in that photo. Try a clearer shot with better lighting.",
      }, 422)
    }

    // Resolve macros from real data (cache → USDA → one-time AI estimate).
    // GPT-4o only identified foods + grams above; numbers are computed here.
    // The resolver's internal match call uses the text OPENROUTER_API_KEY so
    // image-key cost tracking stays clean.
    const { foods, totals } = await resolveFoods(supabase, aiResult.foods as ParsedFood[], {
      openRouterKey: Deno.env.get('OPENROUTER_API_KEY')!,
      fdcApiKey: Deno.env.get('FDC_API_KEY') ?? '',
      userId: user.id,
    })

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
    // no more one-off food_items rows per log.
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
          source: 'ai_photo',
          ai_confidence: food.confidence,
          macro_source: food.macro_source,
        })
        .select()
        .single()

      if (entryErr) throw entryErr
      savedEntries.push(entry)
    }

    // ── 8. Return the full logged meal to the app ──────────────────────────────
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
