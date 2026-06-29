import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { decode } from 'https://deno.land/std@0.177.0/encoding/base64.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Photo logging always produces a food log — photos are never Q&A.
// The system prompt tells GPT-4o to look at the image and return the
// standard STEADY nutrition JSON (same shape as log-food-from-text).
const SYSTEM_PROMPT = `You are STEADY, a friendly AI nutritionist inside a calorie-tracking app.
The user has sent you a photo of their meal. Identify all the food and drink in the image and log the nutrition.

Return ONLY a valid JSON object — no markdown, no prose outside the JSON.

Return this exact structure:
{
  "meal_name": "brief name for the whole meal (e.g. 'Chicken rice bowl')",
  "foods": [
    {
      "name": "food item name",
      "quantity_description": "e.g. 2 slices, 1 large egg, 1 cup",
      "quantity_g": 120,
      "calories": 154,
      "protein_g": 11.5,
      "carbs_g": 1.2,
      "fat_g": 10.8,
      "fiber_g": 0.0,
      "confidence": 0.85
    }
  ],
  "totals": {
    "calories": 297,
    "protein_g": 15.5,
    "carbs_g": 28.0,
    "fat_g": 13.0,
    "fiber_g": 0.0
  }
}

Rules:
- Identify every visible food item, including sides, sauces, drinks, and garnishes
- quantity_g is your best gram estimate based on what you can see
- calories and macros are for that quantity_g amount (not per 100g)
- confidence is 0.0–1.0 (how certain you are — lower if the image is unclear or the food is obscured)
- Break compound dishes into components where visible (e.g. rice + curry + naan)
- Use USDA-level nutrition values
- totals must equal the sum of all foods rounded to 1 decimal
- If you cannot identify any food in the image, return foods as an empty array with meal_name "Unknown"`

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
    // The public URL is saved to meal_logs.photo_url so the MealCard can display it.
    const ext = mime_type === 'image/png' ? 'png' : 'jpg'
    const fileName = `${user.id}/${crypto.randomUUID()}.${ext}`
    const imageBytes = decode(image_base64)

    const { error: storageErr } = await supabase.storage
      .from('meal-photos')
      .upload(fileName, imageBytes, { contentType: mime_type, upsert: false })

    if (storageErr) throw new Error(`Storage upload failed: ${storageErr.message}`)

    const { data: { publicUrl } } = supabase.storage
      .from('meal-photos')
      .getPublicUrl(fileName)

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

    // ── 6. Insert meal_log with photo_url ──────────────────────────────────────
    const { data: mealLog, error: mealLogErr } = await supabase
      .from('meal_logs')
      .insert({
        user_id: user.id,
        logged_date,
        meal_type,
        caption: caption || aiResult.meal_name,
        photo_url: publicUrl,
      })
      .select('id')
      .single()

    if (mealLogErr) throw mealLogErr

    // ── 7. Insert food_items + food_entries for each identified food ───────────
    const savedEntries = []

    for (const food of aiResult.foods) {
      const { data: foodItem, error: foodItemErr } = await supabase
        .from('food_items')
        .insert({
          source: 'ai_estimated',
          name: food.name,
          calories: food.calories,
          protein_g: food.protein_g,
          carbs_g: food.carbs_g,
          fat_g: food.fat_g,
          fiber_g: food.fiber_g ?? 0,
          serving_size_g: food.quantity_g,
          serving_size_description: food.quantity_description,
          created_by: user.id,
        })
        .select('id')
        .single()

      if (foodItemErr) throw foodItemErr

      const { data: entry, error: entryErr } = await supabase
        .from('food_entries')
        .insert({
          meal_log_id: mealLog.id,
          user_id: user.id,
          food_item_id: foodItem.id,
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
      photo_url: publicUrl,
      logged_date,
      meal_type,
      foods: aiResult.foods,
      totals: aiResult.totals,
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
