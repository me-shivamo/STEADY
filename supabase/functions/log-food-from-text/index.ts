import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  resolveFoods, placeFoods, memoryModeFromEnv, searchModeFromEnv, effectiveSearch, usdaModeFromEnv, effectiveUsda, aiMacrosModeFromEnv, effectiveAiMacros, unsureReply, estimateNote,
  capRoughConfidence, entryQuantityLabel, stripRoughMarker, weighFoods, parseFromDescription, portionColumns,
  type ParsedFood, type ResolvedFood, type MacroSource, type UnresolvedFood, type ResolveResult,
} from '../_shared/macroResolver.ts'
import { logAiCall } from '../_shared/aiLogger.ts'
import { SYSTEM_PROMPT, SYSTEM_PROMPT_V2, editInstructionV2 } from '../_shared/foodParsePrompt.ts'
import { parsedFoodsFromV2 } from '../_shared/parseV2.ts'
import { effectivePortion, loadRegion, portionModeFromEnv } from '../_shared/portionStore.ts'
import { calibrationLearnedNote, parseCalibrationStatement } from '../_shared/portionCalibration.ts'
import {
  editLessonCandidate, handleCalibrationApi, handleCalibrationStatement, learnFromEdit, loadMealEntries, storedEntryFor,
  type EditLesson,
} from '../_shared/portionCalibrationApi.ts'
import { keptPortion, sameAmount, unitParse } from '../_shared/editPortions.ts'
import type { PortionResult } from '../_shared/portions.ts'
import { parseAiContent, AI_PARSE_FAILED_MESSAGE, type AiContentParse } from '../_shared/parseAiContent.ts'
import { matchPreviousEntries, prevRef } from '../_shared/editMatch.ts'

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

    // v1.2 Phase 5 (PORTION_MODE secret: legacy | shadow | eval_only | table). Unset
    // or misspelt = legacy, and every line below then runs exactly as before:
    // V1 prompt, the parse model's grams, no portion columns.
    const portionEff = effectivePortion(portionModeFromEnv(Deno.env.get('PORTION_MODE')), user.email)
    const portionOn = portionEff.mode !== 'legacy'
    const tableMode = portionEff.mode === 'table'

    // The app's personal-calibration API (founder 2026-11-13, spec k16): list / undo the user's own
    // unit sizes in every mode (they are the user's data: always visible and undoable, founder l4);
    // saving a follow-up or chip answer only where the engine applies it (portion mode not legacy).
    // Applying calibrations in legacy mode too (founder l4a) is the tracked follow-up build.
    if (body.portion_calibration && typeof body.portion_calibration === 'object') {
      const r = await handleCalibrationApi(supabase, user.id, body.portion_calibration, portionOn)
      return json(r.body, r.status)
    }

    if (!text) return json({ error: 'text is required' }, 400)

    // The user's region (profiles.timezone) for the portion engine, read alongside the chat history.
    const regionP = portionOn ? loadRegion(supabase, user.id) : null
    // Table-mode edit: the meal's stored entries, read once (unchanged foods keep their grams; a gram edit
    // may teach a calibration). Filtered by user, so another user's meal reads as empty.
    const storedP = tableMode && editMealLogId ? loadMealEntries(supabase, user.id, editMealLogId) : null

    // Captured now, before any DB writes — used to timestamp the user's chat
    // bubble. Without this, saveChatTurn() (called at the very end, after the
    // meal_log row already exists) would stamp the user's own message LATER
    // than the meal it produced, so on reload the sort-by-created_at would
    // place the meal card above the user's text instead of below it.
    const requestStartedAt = new Date().toISOString()

    // Table mode: "my cup is 350 ml", "forget my cup size", "what are my portion
    // sizes" are handled here, deterministically, before any model call. A message
    // that does not match exactly keeps going to the parse model as a log.
    if (tableMode && !editMealLogId) {
      const intent = parseCalibrationStatement(text)
      if (intent) {
        const r = await handleCalibrationStatement(supabase, user.id, intent, text)
        if (r.handled && r.reply) {
          await saveChatTurn(supabase, user.id, logged_date, text, r.reply, null, requestStartedAt)
          return json({ success: true, type: 'answer', reply: r.reply, water_logged: false, portion_calibration: r.calibration })
        }
      }
    }

    // ── 3. Load today's chat history ───────────────────────────────────────────
    const historyMessages = await loadChatHistory(supabase, user.id, logged_date)

    // ── 4. Build messages array for the AI ────────────────────────────────────
    // System prompt sets the persona. History gives context. User message is new.
    // No data dump — the AI calls tools if it needs data.
    const messages: Array<Record<string, unknown>> = [
      { role: 'system', content: tableMode ? SYSTEM_PROMPT_V2 : SYSTEM_PROMPT },
      { role: 'system', content: `Current date: ${logged_date}. User's timezone context: messages are in local time.` },
    ]

    // On an edit, tell the model what the meal's foods currently are so it can
    // tell "same food, new quantity" apart from "genuinely different food" —
    // without this it re-derives nutrition facts from scratch on every edit,
    // even a pure quantity change. This is belt-and-suspenders: the rescale
    // guard after resolveFoods() enforces the same rule deterministically,
    // so a model that ignores this instruction still can't drift the numbers.
    if (editMealLogId && previousEntries.length > 0 && tableMode) {
      // V2: the same rule, but the model keeps count/unit/size, not grams (none in the lines either).
      messages.push({
        role: 'system',
        content: editInstructionV2(previousEntries.map((e, i) =>
          `- [${prevRef(i)}] "${e.name}"` +
          (e.macro_source === 'label' ? ' [from a nutrition label — these are exact printed values, not estimates]' : '')
        ).join('\n')),
      })
    } else if (editMealLogId && previousEntries.length > 0) {
      // Each food carries a short ref (p1, p2, …) that the model echoes as
      // prev_id on a food it kept, so a RENAMED food still finds its entry
      // (see _shared/editMatch.ts).
      const entryLines = previousEntries.map((e, i) =>
        `- [${prevRef(i)}] "${e.name}": ${e.quantity_g}g → ${e.calories} cal, ${e.protein_g}g protein, ${e.carbs_g}g carbs, ${e.fat_g}g fat` +
        (e.macro_source === 'label' ? ' [from a nutrition label — these are exact printed values, not estimates]' : '')
      ).join('\n')
      messages.push({
        role: 'system',
        content: `This is an EDIT of an existing meal. Its current foods are:\n${entryLines}\n\n` +
          `For each food in the edited text below: if it is the SAME food as one listed above (same identity, ` +
          `possibly a different quantity), keep quantity_g accurate to the new text — do NOT change your ` +
          `identification of what the food is. Only treat a food as new/different if its name or identity in the ` +
          `edited text genuinely changed. The app recalculates macros from quantity_g after this step, so your ` +
          `only job here is correct food identification and gram amounts, exactly as with a fresh log.\n\n` +
          `On each food in "foods" that is the SAME food as one listed above, add "prev_id" set to that food's ref, ` +
          `e.g. "prev_id": "p1" — also when the edited text renames it or fixes a typo (e.g. "Roti" → "Chapati"). ` +
          `Leave prev_id out for a new food, or for a different food that replaced one (e.g. "Roti" → "Paratha"). ` +
          `Use each ref at most once.`,
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
    const { result: parsed, waterLogged, mealDeleted } = await runAgentLoop(supabase, user.id, messages)

    // The AI's reply couldn't be read (truncated/malformed JSON, or empty).
    // This used to be passed off as a chat answer — broken JSON shown in a
    // bubble, saved to history, reported as success. Now it is a real error:
    // a fixed message plus a machine-readable error_code, and nothing saved.
    // HTTP 200 + success:false is the shape the installed app already treats
    // as a failure (it shows its generic "couldn't log" copy), so old builds
    // behave sanely and new builds can branch on error_code.
    if (!parsed.ok) {
      // Except when a tool call already changed the user's data before the
      // final reply broke (log_water inserted, delete_meal deleted). Calling
      // that a failure invites a retry that logs the water twice, and the
      // installed app only refreshes its water card on a success answer. So
      // report what was done, in fixed copy, in the shape every build reads
      // as a normal answer. No chat turn is saved: the model's reply is gone.
      if (waterLogged || mealDeleted) {
        console.error('[log-food-from-text] AI reply was not readable JSON after a write tool ran — answering with fixed copy')
        return json({ success: true, type: 'answer', reply: toolDoneReply(waterLogged, mealDeleted), water_logged: waterLogged })
      }
      console.error('[log-food-from-text] AI reply was not readable JSON — returning ai_parse_failed')
      return json({
        success: false,
        error: AI_PARSE_FAILED_MESSAGE,
        error_code: parsed.code,
        water_logged: waterLogged,
      }, 200)
    }
    const aiResult = parsed.value

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
    // Table mode: the V2 parse names amounts, not grams. Validate each food; a
    // stated amount whose number is not in the user's text is dropped (counted).
    let parsedFoods = aiResult.foods as ParsedFood[]
    if (tableMode) {
      const v2 = parsedFoodsFromV2(aiResult.foods, text)
      parsedFoods = v2.foods
      if (v2.invented > 0) console.log(`[portion] invented_stated ${v2.invented}`)
      if (parsedFoods.length === 0) {
        return json({
          error: "I couldn't find any food in that. Try describing what you ate, e.g. \"2 eggs and toast\".",
        }, 422)
      }
    }

    // On an edit, deterministically rescale any food that's the same as one of
    // the previous entries (by normalized name, or by the prev_id ref the
    // model echoes for a renamed food) — quantity_g × old_per100g,
    // reusing the SAME food_item_id/macro_source rather than re-resolving.
    // This is the enforcement layer for the system-prompt instruction above:
    // even if the model ignores that instruction and re-derives nutrition
    // facts on its own, this guard overrides its output for matched foods, so
    // a pure quantity edit can never change the macro ratio. Foods with no
    // match (genuinely new/changed identity) fall through to the normal
    // resolveFoods() pipeline, exactly as a fresh log would.
    // The card's edit text is built from each entry's quantity_label, so on an
    // edit a rough entry's "· rough estimate" marker comes back in the text.
    // It is a flag, not part of the food: if the parse folded it into a name,
    // strip it before matching/resolving (entryQuantityLabel handles labels).
    const allParsed = parsedFoods.map((f) =>
      editMealLogId && typeof f.name === 'string' ? { ...f, name: stripRoughMarker(f.name) || f.name } : f)
    // The previous entry each food is (by name, else by the model's prev_id
    // for a renamed food), or undefined for a new food or a fresh log.
    const previousFor: Array<PreviousEntry | undefined> = editMealLogId
      ? matchPreviousEntries(allParsed as Array<ParsedFood & { prev_id?: unknown }>, previousEntries)
      : new Array(allParsed.length).fill(undefined)
    const rescaledIndices: number[] = []
    const freshIndices: number[] = []
    const rescaled: ResolvedFood[] = new Array(allParsed.length)

    // Table mode: the grams of a kept food come from the portion engine, run on
    // the previous entry's row (the V2 parse carries no grams). Legacy: none.
    const memoryMode = memoryModeFromEnv(Deno.env.get('RESOLVER_MEMORY'))
    const portionCtx = portionOn ? { ...portionEff, region: await regionP!, userText: text, channel: 'text' as const } : undefined
    const stored = storedP ? await storedP : null
    const storedFor = allParsed.map((f, i) => (previousFor[i] ? storedEntryFor(stored, previousFor[i]!.food_item_id, previousFor[i]!.name) : undefined))
    // a kept food whose amount the edit did not change keeps its stored grams and numbers
    const unchanged = allParsed.map((f, i) => tableMode && !!previousFor[i] && sameAmount(f.portion_parse, storedFor[i], f.name))
    // a food whose unit amount became a weight ("2 katori" -> "300 g") may teach this user's unit
    const lessonOf = allParsed.map((f, i) => (tableMode && !unchanged[i] ? editLessonCandidate(storedFor[i], f.portion_parse) : null))
    // one weighing batch: every food, plus each lesson's data default (the unit on this food, no personal data)
    const lessonIdx = lessonOf.flatMap((l, i) => (l && previousFor[i]?.food_item_id ? [i] : []))
    const weighedAll: Array<PortionResult | null> = tableMode && editMealLogId
      ? await weighFoods(supabase, [
          ...allParsed.map((f, i) => ({
            parse: f.portion_parse ?? parseFromDescription(f),
            phrase: f.name,
            foodItemId: previousFor[i]?.food_item_id ?? null,
            parseG: f.quantity_g,
          })),
          ...lessonIdx.map((i) => ({
            parse: unitParse(lessonOf[i]!.unit, lessonOf[i]!.size), phrase: allParsed[i].name,
            foodItemId: previousFor[i]!.food_item_id, parseG: 0, personal: false,
          })),
        ], { userId: user.id, memory: memoryMode, portion: portionCtx! })
      : []
    const weighed = weighedAll.slice(0, allParsed.length)
    const lessons: EditLesson[] = lessonIdx.flatMap((i, k) => {
      const w = weighed[i]
      const d = weighedAll[allParsed.length + k]
      const l = lessonOf[i]!
      if (!w || w.portion.source !== 'stated') return []
      return [{
        foodItemId: previousFor[i]!.food_item_id!, foodName: previousFor[i]!.name, unit: l.unit, size: l.size,
        gramsPerUnit: w.grams / l.count,
        dataDefaultPerUnit: d && d.portion.source !== 'ai' ? d.grams : null,
      }]
    })

    // Same food, new quantity: the previous entry's numbers × new/old grams.
    // `w` (table mode) is the engine's weight for it; legacy passes none. `keep` (table mode, the amount
    // did not change): ratio 1, the stored grams and numbers exactly.
    const rescaleFromPrevious = (f: ParsedFood, prev: PreviousEntry, w?: PortionResult | null, keep = false, i = -1): ResolvedFood => {
      if (tableMode && (keep || !w)) {
        return {
          ...f, quantity_g: prev.quantity_g, calories: prev.calories, protein_g: prev.protein_g, carbs_g: prev.carbs_g,
          fat_g: prev.fat_g, fiber_g: prev.fiber_g, food_item_id: prev.food_item_id, macro_source: prev.macro_source ?? 'user_created',
          resolution: 'edit_rescale', portion: keptPortion(i >= 0 ? storedFor[i] : undefined, prev.quantity_g), options: [],
        }
      }
      const qf = w ? { ...f, quantity_g: w.grams } : f
      const ratio = qf.quantity_g / prev.quantity_g
      const r1 = (n: number) => Math.round(n * ratio * 10) / 10
      return {
        ...qf,
        calories: r1(prev.calories),
        protein_g: r1(prev.protein_g),
        carbs_g: r1(prev.carbs_g),
        fat_g: r1(prev.fat_g),
        fiber_g: r1(prev.fiber_g),
        food_item_id: prev.food_item_id,
        macro_source: prev.macro_source ?? 'user_created',
        resolution: 'edit_rescale',
        ...(w ? {
          portion: { ...w.portion, source: w.portion.source === 'ai' ? 'edit_rescale' as const : w.portion.source, needs_follow_up: w.needs_follow_up },
          options: w.options,
        } : {}),
      }
    }

    allParsed.forEach((f, i) => {
      const prev = previousFor[i]
      // Only rescale when the food itself carries no fresher ground truth
      // (e.g. a new label_macros from a re-scanned label) and the previous
      // entry actually has a usable macro_source to trust.
      if (prev && !f.label_macros && prev.food_item_id && prev.quantity_g > 0) {
        rescaled[i] = rescaleFromPrevious(f, prev, weighed[i], unchanged[i], i)
        rescaledIndices.push(i)
      } else {
        freshIndices.push(i)
      }
    })

    // Resolve macros from real data (memory → verified base → USDA → AI
    // estimate) for anything not covered by the rescale above. The parse only
    // identified foods + grams for these; numbers are computed here, same as a
    // fresh log. RESOLVER_MEMORY (on | write_only | off) is the memory kill switch;
    // RESOLVER_SEARCH (fts | eval_only | ranked) picks the DB search (Phase 4).
    const freshResolved = freshIndices.length > 0
      ? await resolveFoods(supabase, freshIndices.map((i) => allParsed[i]), {
          openRouterKey: Deno.env.get('OPENROUTER_API_KEY')!,
          fdcApiKey: Deno.env.get('FDC_API_KEY') ?? '',
          userId: user.id,
          memory: memoryMode,
          search: effectiveSearch(searchModeFromEnv(Deno.env.get('RESOLVER_SEARCH')), user.email),
          // RESOLVER_USDA (api | eval_only | local): USDA from the API tiers, or from the rows 055 stored (Phase 7)
          usda: effectiveUsda(usdaModeFromEnv(Deno.env.get('RESOLVER_USDA')), user.email),
          // RESOLVER_AI_MACROS (legacy | eval_only | computed): AI estimates with computed, category-bounded calories
          aiMacros: effectiveAiMacros(aiMacrosModeFromEnv(Deno.env.get('RESOLVER_AI_MACROS')), user.email),
          ...(portionCtx ? { portion: portionCtx } : {}),
        })
      : { foods: [] as ResolvedFood[], totals: null, unresolved: [] as UnresolvedFood[] }

    // An edit must never silently delete a food the meal already had. The
    // edit replaces ALL of the meal's entries, so a food that matches a
    // previous entry but had to be re-resolved (its entry predates the
    // resolver and has no food_item_id — 429 such entries on 2026-11-12) and
    // then got no usable number would vanish from the user's history. It keeps
    // its previous numbers, rescaled, instead. Only genuinely new foods can be
    // left out of an edit.
    const leftOut: UnresolvedFood[] = []
    for (const u of freshResolved.unresolved) {
      const origIdx = freshIndices[u.index]
      const f = allParsed[origIdx]
      const prev = previousFor[origIdx]
      if (prev && !f.label_macros && prev.quantity_g > 0) {
        console.warn(`[edit] no usable estimate for "${f.name}" — keeping its previous entry's numbers`)
        rescaled[origIdx] = rescaleFromPrevious(f, prev, weighed[origIdx], unchanged[origIdx], origIdx)
        rescaledIndices.push(origIdx)
      } else {
        leftOut.push({ ...u, index: origIdx })
      }
    }

    // A rescaled rough estimate is still a rough estimate (D5): keep its low
    // confidence and its flag, or a quantity edit (the likeliest follow-up to
    // "this is a rough estimate") would quietly make it look trustworthy. The
    // app's previous_entries carry neither, so ask the row itself — by the id,
    // server-side, rather than trusting anything else the client sent. Not
    // fatal: without the answer the entry just logs unflagged, as before.
    // Not for an entry the user corrected in Adjust Macros (user_created):
    // those numbers are the user's own now, even though the entry still
    // points at the rough food_items row.
    const roughCandidates = rescaledIndices.filter((i) => rescaled[i].macro_source !== 'user_created')
    const rescaledIds = [...new Set(roughCandidates.map((i) => rescaled[i].food_item_id).filter((id): id is string => !!id))]
    if (rescaledIds.length > 0) {
      const { data: rows, error: roughErr } = await supabase
        .from('food_items')
        .select('id, status_reason')
        .in('id', rescaledIds)
      if (roughErr) console.error('[edit] rough-estimate lookup failed, rescaling unflagged:', roughErr.message)
      const roughIds = new Set(
        (rows ?? [])
          .filter((r: { status_reason: unknown }) => typeof r.status_reason === 'string' && r.status_reason.startsWith('rough_'))
          .map((r: { id: string }) => r.id),
      )
      for (const i of roughCandidates) {
        const f = rescaled[i]
        if (f.food_item_id && roughIds.has(f.food_item_id)) {
          rescaled[i] = { ...f, rough: true, confidence: capRoughConfidence(f.confidence) }
        }
      }
    }

    // Merge back into the message's original order. A food the resolver had
    // to leave out leaves a gap that is dropped, so later foods don't shift.
    const placed: Array<ResolvedFood | undefined> = new Array(allParsed.length)
    rescaledIndices.forEach((origIdx) => { placed[origIdx] = rescaled[origIdx] })
    placeFoods(placed, freshIndices, freshResolved)
    const foods: ResolvedFood[] = placed.filter((f): f is ResolvedFood => f !== undefined)
    // table mode: the resolver's own lines (the cooking-fat rule) go after the user's foods
    const extras = (freshResolved as Partial<ResolveResult>).extras
    if (tableMode && extras?.length) foods.push(...extras)

    // Founder decision D5, "log the rest, flag the unknown": a food with no
    // usable number at all is left out and named in the coach note, and the
    // rest of the meal still logs. Only when NOTHING is left to log do we
    // answer in chat instead — and write nothing: no meal_log, no entries,
    // and on an edit the meal stays exactly as it was (this check runs before
    // the meal update and the entry delete below).
    if (foods.length === 0) {
      const reply = unsureReply(leftOut.map((u) => u.name), 'text')
      if (editMealLogId) return json({ success: false, error: reply }, 200)
      await saveChatTurn(supabase, user.id, logged_date, text, reply, null, requestStartedAt)
      return json({
        success: true,
        type: 'answer',
        reply,
        water_logged: waterLogged,
        needs_clarification: true,
        unresolved: leftOut.map((u) => ({ name: u.name, reason: u.reason })),
      })
    }

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
    // On an edit: the meal's caption, which the edit leaves alone.
    let keptCaption: string | null = null
    let learnedNote: string | null = null

    if (editMealLogId) {
      // Ownership check only. The caption is what the user typed when they
      // logged the meal; the edit text is the AI's own food summary, so
      // writing it over the caption (as this used to) erased their words.
      const { data: existing, error: selErr } = await supabase
        .from('meal_logs')
        .select('id, caption')
        .eq('id', editMealLogId)
        .eq('user_id', user.id)
        .maybeSingle()

      if (selErr) throw selErr
      if (!existing) return json({ error: 'Meal not found' }, 404)
      mealLog = { id: existing.id }
      keptCaption = existing.caption ?? null

      // Table mode: an edit that turns "2 katori" into "300 g" teaches us this user's katori of this
      // food (spec k16 b), within bounds and at low confidence until a second edit confirms it; the reply
      // says what was learned and how to undo it.
      if (tableMode && lessons.length) {
        const learned = await learnFromEdit(supabase, user.id, lessons)
        if (learned.length) {
          console.log(`[calibration] learned ${learned.length} portion size(s) from an edit`)
          const first = lessons.find((l) => l.unit === learned[0].unit)
          learnedNote = calibrationLearnedNote(learned.map((x) => x.desc), `${(first?.foodName ?? '').toLowerCase()} ${learned[0].unit}`.trim())
        }
      }

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

    // Insert food entries. Each references the food_items row the resolver
    // returned: a shared verified row, or one of this user's own private rows
    // (AI estimates and personal USDA picks — since 050 those are never
    // shared). A single batched insert instead of one round trip per food.
    const entryRows = (withPortion: boolean) => foods.map((food) => ({
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
      source: 'ai_text',
      ai_confidence: food.confidence,
      macro_source: food.macro_source,
      // table mode only: what the portion was (054's five columns)
      ...(withPortion ? portionColumns(food) : {}),
    }))
    let { data: savedEntries, error: entriesErr } = await supabase.from('food_entries').insert(entryRows(tableMode)).select()
    // table mode with 054's columns absent (054 rolled back while the flag still says table): the meal is
    // still logged, without the portion columns, instead of failing every insert
    if (entriesErr && tableMode && /portion_(unit|size|count|source|confidence)/.test(String(entriesErr.message ?? ''))) {
      console.error('[portion] food_entries has no portion columns: logged without them')
      ;({ data: savedEntries, error: entriesErr } = await supabase.from('food_entries').insert(entryRows(false)).select())
    }
    if (entriesErr) throw entriesErr

    // The coach_note is the AI's personalised insight about this specific meal.
    // It's saved as the assistant message so it appears in history and is readable.
    // D5: one short sentence naming any rough estimate (and where to adjust it)
    // or any food left out (add it manually), so the user knows which number
    // to check. No installed build renders coach_note, so saveChatTurn also
    // writes that sentence as its own chat row, which Home does show.
    const note = estimateNote(
      foods.filter((f) => f.rough).map((f) => f.name),
      leftOut.map((u) => u.name),
    )
    const baseNote = aiResult.coach_note ?? `Logged ${aiResult.meal_name} — ${Math.round(totals.calories)} cal`
    const coachNote = [baseNote, note, learnedNote].filter((x) => !!x).join(' ')
    // Not on an edit: the meal's chat turn was saved when it was logged.
    // Saving the edit too replayed the food summary as a new user bubble on
    // reload and counted the meal twice in the model's history.
    if (!editMealLogId) {
      await saveChatTurn(supabase, user.id, logged_date, text, coachNote, mealLog.id, requestStartedAt, note)
    }

    return json({
      success: true,
      type: 'log',
      meal_log_id: mealLog.id,
      meal_name: aiResult.meal_name,
      coach_note: coachNote,
      // On an edit, the caption as stored (untouched). caption_kept tells
      // the app it no longer needs to restore the caption itself (builds
      // made before this change did, after older function versions
      // overwrote it).
      input_text: editMealLogId ? keptCaption : text,
      ...(editMealLogId ? { caption_kept: true } : {}),
      logged_date,
      meal_type,
      foods,
      totals,
      entries: savedEntries,
      // Additive (the current app ignores it): foods left out of this log.
      unresolved: leftOut.map((u) => ({ name: u.name, reason: u.reason })),
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
async function runAgentLoop(supabase: any, userId: string, messages: Array<Record<string, unknown>>): Promise<{ result: AiContentParse; waterLogged: boolean; mealDeleted: boolean }> {
  const call1 = await callOpenRouter(supabase, userId, messages, TOOLS)

  // No tool calls → AI responded directly (food log JSON or simple answer)
  if (!call1.tool_calls || call1.tool_calls.length === 0) {
    return { result: parseAiContent(call1.content as string | null), waterLogged: false, mealDeleted: false }
  }

  // AI requested tool calls — execute them against Supabase.
  // Track whether log_water actually succeeded so the client knows to refresh
  // its water store — the water insert happens server-side here, so nothing
  // on the client would otherwise know a new row exists. mealDeleted is the
  // same for delete_meal; the handler needs both if the final reply breaks.
  let waterLogged = false
  let mealDeleted = false

  const toolResults = await Promise.all(
    call1.tool_calls.map(async (tc: Record<string, unknown>) => {
      const fnName = (tc.function as Record<string, unknown>).name as string
      const fnArgs = JSON.parse((tc.function as Record<string, unknown>).arguments as string ?? '{}')
      const result = await executeTool(supabase, userId, fnName, fnArgs)
      if (fnName === 'log_water' && (result as Record<string, unknown>)?.success) {
        waterLogged = true
      }
      if (fnName === 'delete_meal' && (result as Record<string, unknown>)?.success) {
        mealDeleted = true
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
    return { result: parseAiContent(call2Content), waterLogged, mealDeleted }
  }

  // Re-ask with the SAME message list call 2 saw — deliberately not appending
  // call 2's unanswered tool_calls, because the API requires every assistant
  // tool_call to be followed by matching tool-result messages and we have none
  // (that request is exactly what we're declining to run). Adding them produced
  // a 400. tool_choice 'none' removes the option to ask again, so the model has
  // to answer from the tool results already in the conversation.
  const finalCall = await callOpenRouter(supabase, userId, messagesWithTools, TOOLS, 'none')
  return { result: parseAiContent(finalCall.content as string | null), waterLogged, mealDeleted }
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
      // By the user's LOCAL day (logged_date), the same key log_water writes
      // and the app's water card reads. Filtering logged_at by UTC midnight
      // shifted the day by the user's offset: in India, water drunk before
      // 05:30 local landed on the previous day, and the totals disagreed with
      // the water card and with get_daily_summary.
      const { data } = await supabase
        .from('water_logs')
        .select('amount_ml, logged_at')
        .eq('user_id', userId)
        .eq('logged_date', date)
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

// The AI's text content is parsed by parseAiContent (_shared/parseAiContent.ts):
// JSON → used, prose → a chat answer, a broken JSON attempt or nothing → an
// ai_parse_failed error (see the handler, step 5).

// What the user is told when a write tool ran but the model's final reply was
// unreadable. Fixed copy, never the model's text.
function toolDoneReply(waterLogged: boolean, mealDeleted: boolean): string {
  if (waterLogged && mealDeleted) return 'Done — I logged that water and deleted that meal.'
  if (mealDeleted) return 'Done — I deleted that meal.'
  return 'Done — I logged that water.'
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
      // D5's flag line ("X is a rough estimate…") is stored as a plain chat row
      // so Home shows it, but it belongs to its meal (meal_log_id set) and is
      // not a conversational turn: replaying it would rebuild the very
      // "log → prose reply" pattern this function folds away.
      if (m.role === 'assistant' && m.meal_log_id !== null) {
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
// `flagNote` is D5's one-line rough-estimate / left-out flag. It goes into a
// third, separate row on purpose: the installed app's Home feed drops every
// food_log_confirmation row (the meal card stands in for it) and never reads
// coach_note, but it does show assistant 'chat' rows. created_at is left to
// the database's now(), which is later than the meal_log this request
// inserted, so the line sorts directly under its card. meal_log_id ties it to
// the meal, so deleting the meal deletes it too. Inserted on its own because
// a batch whose rows have different keys sends NULL for the missing ones.
// deno-lint-ignore no-explicit-any
async function saveChatTurn(supabase: any, userId: string, date: string, userText: string, aiReply: string, mealLogId: string | null, userSentAt: string, flagNote = ''): Promise<void> {
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
    if (mealLogId && flagNote) {
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
