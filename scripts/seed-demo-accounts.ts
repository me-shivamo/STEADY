// ── One-time demo account data seed ──────────────────────────────────────────
// Populates demo@gmail.com and demo2@gmail.com with ~7 days of realistic
// food logs, weight entries, body measurements, water, chat messages and a
// streak so the demo accounts have something to show immediately after login
// (App Store / Play Store reviewers, walkthroughs, screenshots).
//
// Run:
//   SUPABASE_URL=https://<project>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
//   npx tsx scripts/seed-demo-accounts.ts
//
// Idempotent-ish: re-running adds a fresh set of meal_logs/chat_messages/water_logs
// (no dedupe key on those tables), but weight_logs/body_measurements upsert on
// (user_id, logged_date) so those just get overwritten, not duplicated. streaks
// upserts on user_id too.

import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.')
  process.exit(1)
}
const supabase = createClient(url, key)

const DEMO_EMAILS = ['demo@gmail.com', 'demo2@gmail.com']
const DAYS = 7

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

interface FoodEntrySeed {
  food_name: string
  quantity_g: number
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
  sugar_g: number
  sodium_mg: number
}

interface MealSeed {
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  caption: string
  entries: FoodEntrySeed[]
}

// A rotating set of realistic meals so the seeded week doesn't look copy-pasted.
const BREAKFASTS: MealSeed[] = [
  {
    meal_type: 'breakfast',
    caption: 'oats with banana and peanut butter',
    entries: [
      { food_name: 'Rolled oats', quantity_g: 60, calories: 227, protein_g: 8, carbs_g: 39, fat_g: 4, fiber_g: 6, sugar_g: 1, sodium_mg: 3 },
      { food_name: 'Banana', quantity_g: 118, calories: 105, protein_g: 1.3, carbs_g: 27, fat_g: 0.4, fiber_g: 3.1, sugar_g: 14, sodium_mg: 1 },
      { food_name: 'Peanut butter', quantity_g: 16, calories: 94, protein_g: 4, carbs_g: 3, fat_g: 8, fiber_g: 1, sugar_g: 1.5, sodium_mg: 70 },
    ],
  },
  {
    meal_type: 'breakfast',
    caption: '3 egg omelette with toast',
    entries: [
      { food_name: 'Eggs', quantity_g: 150, calories: 233, protein_g: 19, carbs_g: 1.7, fat_g: 16, fiber_g: 0, sugar_g: 0.8, sodium_mg: 210 },
      { food_name: 'Whole wheat toast', quantity_g: 60, calories: 160, protein_g: 6, carbs_g: 28, fat_g: 2.5, fiber_g: 4, sugar_g: 3, sodium_mg: 280 },
    ],
  },
  {
    meal_type: 'breakfast',
    caption: 'greek yogurt with berries and granola',
    entries: [
      { food_name: 'Greek yogurt', quantity_g: 200, calories: 146, protein_g: 20, carbs_g: 8, fat_g: 4, fiber_g: 0, sugar_g: 7, sodium_mg: 65 },
      { food_name: 'Mixed berries', quantity_g: 80, calories: 42, protein_g: 0.6, carbs_g: 10, fat_g: 0.3, fiber_g: 2.8, sugar_g: 6, sodium_mg: 1 },
      { food_name: 'Granola', quantity_g: 30, calories: 140, protein_g: 3, carbs_g: 18, fat_g: 6, fiber_g: 2, sugar_g: 6, sodium_mg: 40 },
    ],
  },
]

const LUNCHES: MealSeed[] = [
  {
    meal_type: 'lunch',
    caption: 'grilled chicken bowl with rice and veggies',
    entries: [
      { food_name: 'Grilled chicken breast', quantity_g: 150, calories: 248, protein_g: 46, carbs_g: 0, fat_g: 5.4, fiber_g: 0, sugar_g: 0, sodium_mg: 110 },
      { food_name: 'Steamed rice', quantity_g: 150, calories: 195, protein_g: 4, carbs_g: 43, fat_g: 0.4, fiber_g: 0.6, sugar_g: 0.1, sodium_mg: 2 },
      { food_name: 'Mixed vegetables', quantity_g: 100, calories: 65, protein_g: 2.6, carbs_g: 13, fat_g: 0.3, fiber_g: 4, sugar_g: 4, sodium_mg: 33 },
    ],
  },
  {
    meal_type: 'lunch',
    caption: 'dal, rice and salad',
    entries: [
      { food_name: 'Dal (lentil curry)', quantity_g: 200, calories: 232, protein_g: 14, carbs_g: 32, fat_g: 5, fiber_g: 8, sugar_g: 3, sodium_mg: 380 },
      { food_name: 'Steamed rice', quantity_g: 150, calories: 195, protein_g: 4, carbs_g: 43, fat_g: 0.4, fiber_g: 0.6, sugar_g: 0.1, sodium_mg: 2 },
      { food_name: 'Cucumber tomato salad', quantity_g: 100, calories: 25, protein_g: 1, carbs_g: 5, fat_g: 0.2, fiber_g: 1.5, sugar_g: 3, sodium_mg: 5 },
    ],
  },
  {
    meal_type: 'lunch',
    caption: 'turkey sandwich with chips',
    entries: [
      { food_name: 'Turkey sandwich', quantity_g: 220, calories: 380, protein_g: 26, carbs_g: 40, fat_g: 12, fiber_g: 4, sugar_g: 5, sodium_mg: 890 },
      { food_name: 'Potato chips', quantity_g: 30, calories: 160, protein_g: 2, carbs_g: 15, fat_g: 10, fiber_g: 1.3, sugar_g: 0.2, sodium_mg: 170 },
    ],
  },
]

const DINNERS: MealSeed[] = [
  {
    meal_type: 'dinner',
    caption: 'salmon with roasted vegetables',
    entries: [
      { food_name: 'Baked salmon', quantity_g: 170, calories: 354, protein_g: 39, carbs_g: 0, fat_g: 21, fiber_g: 0, sugar_g: 0, sodium_mg: 98 },
      { food_name: 'Roasted vegetables', quantity_g: 150, calories: 120, protein_g: 3, carbs_g: 18, fat_g: 5, fiber_g: 5, sugar_g: 6, sodium_mg: 60 },
    ],
  },
  {
    meal_type: 'dinner',
    caption: 'paneer tikka with roti',
    entries: [
      { food_name: 'Paneer tikka', quantity_g: 150, calories: 340, protein_g: 20, carbs_g: 8, fat_g: 25, fiber_g: 1, sugar_g: 3, sodium_mg: 420 },
      { food_name: 'Roti', quantity_g: 80, calories: 220, protein_g: 6, carbs_g: 40, fat_g: 4, fiber_g: 5, sugar_g: 1, sodium_mg: 200 },
    ],
  },
  {
    meal_type: 'dinner',
    caption: 'spaghetti with meat sauce',
    entries: [
      { food_name: 'Spaghetti with meat sauce', quantity_g: 350, calories: 520, protein_g: 28, carbs_g: 62, fat_g: 17, fiber_g: 5, sugar_g: 9, sodium_mg: 780 },
      { food_name: 'Side salad', quantity_g: 80, calories: 35, protein_g: 1, carbs_g: 6, fat_g: 1, fiber_g: 2, sugar_g: 2, sodium_mg: 40 },
    ],
  },
]

const SNACKS: MealSeed[] = [
  {
    meal_type: 'snack',
    caption: 'apple and almonds',
    entries: [
      { food_name: 'Apple', quantity_g: 180, calories: 95, protein_g: 0.5, carbs_g: 25, fat_g: 0.3, fiber_g: 4.4, sugar_g: 19, sodium_mg: 2 },
      { food_name: 'Almonds', quantity_g: 20, calories: 116, protein_g: 4.3, carbs_g: 4, fat_g: 10, fiber_g: 2.5, sugar_g: 0.9, sodium_mg: 0 },
    ],
  },
  {
    meal_type: 'snack',
    caption: 'protein shake',
    entries: [
      { food_name: 'Whey protein shake', quantity_g: 300, calories: 150, protein_g: 25, carbs_g: 6, fat_g: 2, fiber_g: 0, sugar_g: 3, sodium_mg: 130 },
    ],
  },
]

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length]
}

async function getUserIdByEmail(email: string): Promise<string> {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (error) throw error
  const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
  if (!user) throw new Error(`No auth user found for ${email}`)
  return user.id
}

async function seedFoodForUser(userId: string, email: string) {
  const loggedDates: string[] = []

  for (let dayOffset = DAYS - 1; dayOffset >= 0; dayOffset--) {
    const logged_date = daysAgo(dayOffset)
    loggedDates.push(logged_date)
    const meals: MealSeed[] = [pick(BREAKFASTS, dayOffset), pick(LUNCHES, dayOffset), pick(DINNERS, dayOffset)]
    if (dayOffset % 2 === 0) meals.push(pick(SNACKS, dayOffset))

    // Spread meal_logs across the day (breakfast/lunch/snack/dinner) instead of
    // all defaulting to created_at=now, so the Home "Log + Coach" chat feed
    // (sorted by created_at) reads in a believable morning-to-night order.
    const mealHour: Record<MealSeed['meal_type'], number> = { breakfast: 8, lunch: 13, snack: 16, dinner: 20 }

    for (const meal of meals) {
      const createdAt = new Date(`${logged_date}T00:00:00`)
      createdAt.setHours(mealHour[meal.meal_type], 0, 0, 0)
      const createdAtIso = createdAt.toISOString()

      const { data: mealLog, error: mealErr } = await supabase
        .from('meal_logs')
        .insert({
          user_id: userId,
          logged_date,
          meal_type: meal.meal_type,
          caption: meal.caption,
          created_at: createdAtIso,
          updated_at: createdAtIso,
        })
        .select('id')
        .single()

      if (mealErr || !mealLog) {
        console.error(`  [${email}] meal_logs insert failed (${logged_date} ${meal.meal_type}):`, mealErr?.message)
        continue
      }

      const entryRows = meal.entries.map((e) => ({
        meal_log_id: mealLog.id,
        user_id: userId,
        food_name: e.food_name,
        quantity_g: e.quantity_g,
        calories: e.calories,
        protein_g: e.protein_g,
        carbs_g: e.carbs_g,
        fat_g: e.fat_g,
        fiber_g: e.fiber_g,
        sugar_g: e.sugar_g,
        sodium_mg: e.sodium_mg,
        source: 'manual' as const,
        created_at: createdAtIso,
      }))

      const { error: entryErr } = await supabase.from('food_entries').insert(entryRows)
      if (entryErr) {
        console.error(`  [${email}] food_entries insert failed (${logged_date} ${meal.meal_type}):`, entryErr.message)
        continue
      }

      // A matching chat exchange so Home's "Log + Coach" feed shows a real
      // conversation around each meal card, not just a bare card.
      const totalCal = meal.entries.reduce((s, e) => s + e.calories, 0)
      const replyAt = new Date(createdAt.getTime() + 60_000).toISOString()
      const { error: chatErr } = await supabase.from('chat_messages').insert([
        { user_id: userId, role: 'user', content: `Had ${meal.caption}`, message_type: 'chat', chat_date: logged_date, created_at: createdAtIso },
        { user_id: userId, role: 'assistant', content: `Logged it — about ${Math.round(totalCal)} kcal for ${meal.meal_type}. Nice work staying on track!`, message_type: 'food_log_confirmation', meal_log_id: mealLog.id, chat_date: logged_date, created_at: replyAt },
      ])
      if (chatErr) {
        console.error(`  [${email}] chat_messages insert failed (${logged_date} ${meal.meal_type}):`, chatErr.message)
      }
    }
  }
  console.log(`  [${email}] seeded ${DAYS} days of meals + chat messages`)
  return loggedDates
}

async function seedWaterForUser(userId: string, email: string, waterGoalMl: number) {
  let totalRows = 0
  for (let dayOffset = DAYS - 1; dayOffset >= 0; dayOffset--) {
    const logged_date = daysAgo(dayOffset)
    // 3-5 glasses through the day, roughly summing to the user's goal.
    const glassCount = 3 + (dayOffset % 3)
    const perGlass = Math.round((waterGoalMl / glassCount) * 10) / 10
    const rows = Array.from({ length: glassCount }, (_, i) => {
      const loggedAt = new Date(`${logged_date}T00:00:00`)
      loggedAt.setHours(8 + i * 3, (i * 17) % 60, 0, 0)
      return {
        user_id: userId,
        logged_date,
        amount_ml: Math.max(100, Math.round(perGlass * (0.85 + (i % 2) * 0.3))),
        logged_at: loggedAt.toISOString(),
      }
    })
    const { error } = await supabase.from('water_logs').insert(rows)
    if (error) {
      console.error(`  [${email}] water_logs insert failed (${logged_date}):`, error.message)
      continue
    }
    totalRows += rows.length
  }
  console.log(`  [${email}] seeded ${totalRows} water_logs rows across ${DAYS} days`)
}

async function seedStreakForUser(userId: string, email: string, loggedDates: string[]) {
  // Every seeded day has meals, so for a 7-day seed the streak is simply 7 —
  // but computing it from the actual dates keeps this correct if DAYS changes
  // or a future edit skips a day.
  const sorted = [...loggedDates].sort()
  let longest = 0
  let run = 0
  let prev: string | null = null
  for (const d of sorted) {
    const diffDays = prev ? (new Date(d).getTime() - new Date(prev).getTime()) / 86_400_000 : 1
    run = diffDays === 1 ? run + 1 : 1
    longest = Math.max(longest, run)
    prev = d
  }
  const today = daysAgo(0)
  const current = sorted[sorted.length - 1] === today ? run : 0

  const { error } = await supabase
    .from('streaks')
    .upsert({ user_id: userId, current_streak: current, longest_streak: longest, last_logged_date: sorted[sorted.length - 1] }, { onConflict: 'user_id' })
  if (error) {
    console.error(`  [${email}] streaks upsert failed:`, error.message)
    return
  }
  console.log(`  [${email}] streak set to current=${current} longest=${longest}`)
}

async function seedWeightForUser(userId: string, email: string) {
  // Gentle downward trend from 82kg -> ~79.5kg over 14 days, with small daily noise.
  const startWeight = 82
  const totalLoss = 2.5
  const rows = []
  for (let dayOffset = DAYS - 1; dayOffset >= 0; dayOffset--) {
    const progress = (DAYS - 1 - dayOffset) / (DAYS - 1)
    const noise = (Math.sin(dayOffset * 1.7) * 0.3)
    const weight_kg = Math.round((startWeight - totalLoss * progress + noise) * 10) / 10
    rows.push({
      user_id: userId,
      logged_date: daysAgo(dayOffset),
      weight_kg,
      notes: dayOffset === 0 ? 'Feeling good this week' : null,
    })
  }

  const { error } = await supabase
    .from('weight_logs')
    .upsert(rows, { onConflict: 'user_id,logged_date' })
  if (error) {
    console.error(`  [${email}] weight_logs upsert failed:`, error.message)
    return
  }
  console.log(`  [${email}] seeded ${rows.length} weight entries`)

  const lastWeight = rows[rows.length - 1].weight_kg
  const { error: profileErr } = await supabase
    .from('profiles')
    .update({ current_weight_kg: lastWeight })
    .eq('id', userId)
  if (profileErr) {
    console.warn(`  [${email}] profile current_weight_kg sync failed:`, profileErr.message)
  }
}

async function seedMeasurementsForUser(userId: string, email: string) {
  // Measurements are logged roughly weekly, not daily — 2 points over 7 days
  // (start and today) since a week is too short for the usual ~10-14 day gap.
  const offsets = [DAYS - 1, 0]
  const base = { waist_cm: 88, hips_cm: 101, chest_cm: 102, arms_cm: 34, thighs_cm: 58, neck_cm: 39, body_fat_pct: 22.5 }
  const rows = offsets.map((dayOffset, i) => {
    const shrink = i * 0.6
    return {
      user_id: userId,
      logged_date: daysAgo(dayOffset),
      waist_cm: base.waist_cm - shrink,
      hips_cm: base.hips_cm - shrink * 0.7,
      chest_cm: base.chest_cm - shrink * 0.3,
      arms_cm: base.arms_cm,
      thighs_cm: base.thighs_cm - shrink * 0.4,
      neck_cm: base.neck_cm,
      body_fat_pct: Math.round((base.body_fat_pct - i * 0.4) * 10) / 10,
    }
  })

  const { error } = await supabase
    .from('body_measurements')
    .upsert(rows, { onConflict: 'user_id,logged_date' })
  if (error) {
    console.error(`  [${email}] body_measurements upsert failed:`, error.message)
    return
  }
  console.log(`  [${email}] seeded ${rows.length} body measurement entries`)
}

async function main() {
  for (const email of DEMO_EMAILS) {
    console.log(`Seeding ${email}...`)
    const userId = await getUserIdByEmail(email)

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('water_goal_ml')
      .eq('id', userId)
      .single()
    if (profileErr) {
      console.error(`  [${email}] could not load profile, skipping:`, profileErr.message)
      continue
    }
    const waterGoalMl = profile?.water_goal_ml ?? 2500

    const loggedDates = await seedFoodForUser(userId, email)
    await seedWeightForUser(userId, email)
    await seedMeasurementsForUser(userId, email)
    await seedWaterForUser(userId, email, waterGoalMl)
    await seedStreakForUser(userId, email, loggedDates)
  }
  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
