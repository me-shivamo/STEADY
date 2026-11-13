// ── Personal calibration: the server side (founder 2026-11-13, spec k16) ─────────
// Three ways a user's own unit sizes are learned, all written with service_role
// through set_portion_calibration (054), always for THIS user only:
//   (a) a statement typed in chat ("my cup is 350 ml")      handleCalibrationStatement
//   (b) a gram edit on a logged food that had a unit         learnFromEdit
//   (c) an answer to a follow-up question or a size chip     handleCalibrationApi (op 'set')
// and seen / undone through handleCalibrationApi (ops 'list', 'revoke') or by
// typing "what are my portion sizes" / "forget my cup size".
//
// Guards (fixer 2026-11-13): every write is checked against the per-unit R8 bounds
// (a typo or "my spoon is 500 g" is refused, never served); a piece statement is
// accepted only for a food logged by the piece; an edit teaches only when the user
// named the unit, only within x0.33..x3 of the data default, and only at low
// confidence until a second consistent edit confirms it; the stored source_text is
// the canonical description, never the raw message.

import { normalizeName } from './macroResolver.ts'
import {
  calibrationImplausibleReply, calibrationListReply, calibrationRevokedReply, calibrationSavedReply,
  calibrationScopeFromWords, calibrationUnmatchedReply, describeCalibration, type CalibrationIntent,
} from './portionCalibration.ts'
import { categoryChain, categoryOf, R8_BOUNDS, type PortionTables } from './portions.ts'
import {
  calibrationWriteIssues, listCalibrations, loadPortionTables, revokeCalibrations, setCalibration,
  type CalibrationView, type CalibrationWrite, type RevokeBy,
} from './portionStore.ts'
import { UNITS, type Size, type Unit } from './portionText.ts'

// A food row this user may point a calibration at: any verified row, or one of
// their own private rows. Never another user's private row.
// deno-lint-ignore no-explicit-any
async function usableFoodRow(supabase: any, userId: string, id: string): Promise<{ id: string; name: string } | null> {
  const { data, error } = await supabase.from('food_items').select('id, name, status, created_by').eq('id', id).maybeSingle()
  if (error || !data) return null
  if (data.status === 'quarantined') return null
  if (data.status !== 'verified' && data.created_by !== userId) return null
  return { id: data.id, name: data.name }
}

// The user's own row for a phrase (their memory pointer), else the verified exact key.
// deno-lint-ignore no-explicit-any
async function foodRowForPhrase(supabase: any, userId: string, phrase: string): Promise<{ id: string; name: string } | null> {
  const norm = normalizeName(phrase)
  if (!norm) return null
  const [mem, exact] = await Promise.all([
    supabase.from('user_food_memory').select('food_item_id').eq('user_id', userId).eq('normalized_name', norm).maybeSingle(),
    supabase.from('food_items').select('id, name').eq('normalized_name', norm).eq('status', 'verified').maybeSingle(),
  ])
  if (!mem.error && mem.data?.food_item_id) {
    const row = await usableFoodRow(supabase, userId, mem.data.food_item_id)
    if (row) return row
  }
  if (!exact.error && exact.data) return { id: exact.data.id, name: exact.data.name }
  return null
}

// deno-lint-ignore no-explicit-any
async function describeAll(supabase: any, rows: CalibrationView[]): Promise<string[]> {
  const ids = [...new Set(rows.flatMap((r) => (r.food_item_id ? [r.food_item_id] : [])))]
  const names = new Map<string, string>()
  if (ids.length) {
    const { data } = await supabase.from('food_items').select('id, name').in('id', ids)
    // deno-lint-ignore no-explicit-any
    for (const r of data ?? []) names.set((r as any).id, (r as any).name)
  }
  return rows.map((r) => describeCalibration({ ...r, food_name: r.food_item_id ? names.get(r.food_item_id) ?? 'a food' : null }))
}

// Grams per ONE unit a calibration stands for: grams as given; ml x the category chain's density
// (1.0 when none is known, for this check only). null = an as_size calibration (no amount).
export function calibrationGramsPerUnit(
  c: Pick<CalibrationWrite, 'grams' | 'ml'>, tables: PortionTables | null, category: string | null,
): number | null {
  if (c.grams != null) return Number(c.grams)
  if (c.ml == null) return null
  let d = 1
  if (tables && category) {
    for (const cat of categoryChain(tables, category)) {
      const dd = tables.categories.get(cat)?.density_g_per_ml
      if (dd != null && dd > 0) { d = Number(dd); break }
    }
  }
  return Number(c.ml) * d
}
// The R8 sanity bounds of a unit, or null when the value is inside them.
export function implausible(unit: Unit, gramsPerUnit: number | null): readonly [number, number] | null {
  if (gramsPerUnit === null) return null
  const b = R8_BOUNDS[unit]
  return gramsPerUnit >= b[0] && gramsPerUnit <= b[1] ? null : b
}

export interface CalibrationReply {
  handled: boolean          // false = not a calibration after all: the caller logs the message as usual
  reply?: string
  calibration?: { op: 'set' | 'revoke' | 'list'; id?: string; revoked?: number; items?: CalibrationView[] }
}

type ScopeOf = { scope: 'any' } | { scope: 'category'; category: string } | { scope: 'food'; food_item_id: string; name: string }
// Food words → where a statement or an undo applies. null = the words name nothing we know.
// deno-lint-ignore no-explicit-any
async function resolveScope(supabase: any, userId: string, foodPhrase: string | null, tables: PortionTables): Promise<ScopeOf | null> {
  const sc = calibrationScopeFromWords(foodPhrase, tables.words)
  if (sc.scope === 'any') return { scope: 'any' }
  if (sc.scope === 'category') return { scope: 'category', category: sc.category }
  const row = await foodRowForPhrase(supabase, userId, sc.phrase)
  return row ? { scope: 'food', food_item_id: row.id, name: row.name } : null
}

// (a) A statement in chat. Never throws: a failure answers in fixed copy.
export async function handleCalibrationStatement(
  // deno-lint-ignore no-explicit-any
  supabase: any, userId: string, intent: CalibrationIntent, _rawText: string,
): Promise<CalibrationReply> {
  try {
    if (intent.kind === 'list') {
      const rows = await listCalibrations(supabase, userId)
      return { handled: true, reply: calibrationListReply(await describeAll(supabase, rows)), calibration: { op: 'list', items: rows } }
    }
    if (intent.kind === 'revoke') {
      if (intent.all || !intent.unit) {
        const n = await revokeCalibrations(supabase, userId, { all: true })
        return { handled: true, reply: calibrationRevokedReply(n, null), calibration: { op: 'revoke', revoked: n } }
      }
      // "forget my chai cup size" revokes the chai (tea) cup only; "forget my cup size" every cup
      if (!intent.foodPhrase) {
        const n = await revokeCalibrations(supabase, userId, { unit: intent.unit })
        return { handled: true, reply: calibrationRevokedReply(n, intent.unit), calibration: { op: 'revoke', revoked: n } }
      }
      // the food words name a category ("chai" -> tea) and/or a food row (an edit-learned "your katori of dal"
      // is food-scoped): both are undone, nothing else
      const tables = await loadPortionTables(supabase)
      const cat = tables ? calibrationScopeFromWords(intent.foodPhrase, tables.words) : null
      const row = await foodRowForPhrase(supabase, userId, intent.foodPhrase)
      const scopes: NonNullable<RevokeBy['scope']>[] = []
      if (cat?.scope === 'category') scopes.push({ scope: 'category', category: cat.category })
      if (row) scopes.push({ scope: 'food', food_item_id: row.id })
      let n = 0
      for (const scope of scopes) n += await revokeCalibrations(supabase, userId, { unit: intent.unit, scope })
      return { handled: true, reply: calibrationRevokedReply(n, intent.unit, intent.foodPhrase), calibration: { op: 'revoke', revoked: n } }
    }
    const tables = await loadPortionTables(supabase)
    if (!tables) return { handled: false }
    const sc = await resolveScope(supabase, userId, intent.foodPhrase, tables)
    if (intent.pieceOfFood) {
      // "my roti is 50 g" sets the weight of one piece, so it applies only to a food logged by the piece
      // (roti, egg, idli: the category's serving unit is piece). "my rice is 200 g" / "my dal is 150 g" are
      // far more likely logs, and a piece size for them could never apply: the message goes on as a log.
      if (!sc || sc.scope === 'any') return { handled: false }
      const cat = sc.scope === 'category' ? sc.category : categoryOf(tables, sc.food_item_id, intent.foodPhrase ?? '', sc.name)
      const servingUnit = categoryChain(tables, cat).map((c) => tables.categories.get(c)?.serving_unit).find((x) => !!x) ?? null
      if (servingUnit !== 'piece') return { handled: false }
    }
    if (!sc) return { handled: true, reply: calibrationUnmatchedReply(intent.foodPhrase ?? '') }
    const base = { unit: intent.unit, size: intent.size, grams: intent.grams, ml: intent.ml, as_size: intent.as_size, origin: 'statement' as const }
    const write: CalibrationWrite = sc.scope === 'any' ? { scope: 'any', ...base }
      : sc.scope === 'category' ? { scope: 'category', category: sc.category, ...base }
      : { scope: 'food', food_item_id: sc.food_item_id, ...base }
    const foodName = sc.scope === 'food' ? sc.name : null
    const desc = describeCalibration({ ...write, food_name: foodName })
    const bad = implausible(intent.unit, calibrationGramsPerUnit(write, tables, sc.scope === 'category' ? sc.category : null))
    if (bad) return { handled: true, reply: calibrationImplausibleReply(desc, intent.unit, bad[0], bad[1]) }
    const id = await setCalibration(supabase, userId, { ...write, source_text: desc })
    return { handled: true, reply: calibrationSavedReply(desc, intent.unit, sc.scope === 'any' ? null : intent.foodPhrase), calibration: { op: 'set', id } }
  } catch (e) {
    console.error('[calibration] statement failed:', (e as Error)?.message ?? e)
    return { handled: true, reply: `Sorry — I couldn't save that portion size just now. Please try again in a moment.` }
  }
}

// (c) The app's API: body.portion_calibration = { op: 'list' }
// | { op: 'revoke', id | unit (+ scope, category | food_item_id) | all }
// | { op: 'set', unit, size?, grams | ml | as_size, scope, category?, food_item_id?, origin: 'chip' | 'follow_up' }.
// Any source_text the client sends is ignored: the row stores the canonical description.
export async function handleCalibrationApi(
  // deno-lint-ignore no-explicit-any
  supabase: any, userId: string, req: Record<string, unknown>, allowSet: boolean,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const op = req.op
  try {
    if (op === 'list') {
      const rows = await listCalibrations(supabase, userId)
      return { status: 200, body: { success: true, op, items: rows, descriptions: await describeAll(supabase, rows) } }
    }
    if (op === 'revoke') {
      const id = typeof req.id === 'string' && /^[0-9a-f-]{36}$/i.test(req.id) ? req.id : undefined
      const unit = typeof req.unit === 'string' && (UNITS as readonly string[]).includes(req.unit) ? req.unit as Unit : undefined
      const all = req.all === true
      if (!id && !unit && !all) return { status: 400, body: { success: false, error_code: 'calibration_invalid', issues: ['id_unit_or_all'] } }
      let scope: RevokeBy['scope']
      if (req.scope === 'category' && typeof req.category === 'string') scope = { scope: 'category', category: req.category }
      else if (req.scope === 'food' && typeof req.food_item_id === 'string' && /^[0-9a-f-]{36}$/i.test(req.food_item_id)) scope = { scope: 'food', food_item_id: req.food_item_id }
      else if (req.scope !== undefined && req.scope !== null) return { status: 400, body: { success: false, error_code: 'calibration_invalid', issues: ['scope'] } }
      const n = await revokeCalibrations(supabase, userId, { id, unit, all, scope })
      return { status: 200, body: { success: true, op, revoked: n } }
    }
    if (op === 'set') {
      if (!allowSet) return { status: 200, body: { success: false, error_code: 'portion_calibration_unavailable' } }
      const origin = req.origin === 'follow_up' ? 'follow_up' : req.origin === 'chip' ? 'chip' : null
      const write = {
        scope: req.scope as CalibrationWrite['scope'],
        category: typeof req.category === 'string' ? req.category : null,
        food_item_id: typeof req.food_item_id === 'string' ? req.food_item_id : null,
        unit: req.unit as Unit,
        size: (req.size ?? 'M') as Size,
        grams: typeof req.grams === 'number' ? req.grams : null,
        ml: typeof req.ml === 'number' ? req.ml : null,
        as_size: (typeof req.as_size === 'string' ? req.as_size : null) as Size | null,
        origin: origin as CalibrationWrite['origin'],
      }
      const issues = calibrationWriteIssues(write)
      if (!origin) issues.push('origin')
      if (issues.length) return { status: 400, body: { success: false, error_code: 'calibration_invalid', issues } }
      let foodName: string | null = null
      if (write.scope === 'food') {
        const row = await usableFoodRow(supabase, userId, write.food_item_id!)
        if (!row) return { status: 400, body: { success: false, error_code: 'calibration_invalid', issues: ['food_item_id'] } }
        foodName = row.name
      }
      const tables = await loadPortionTables(supabase)
      if (write.scope === 'category' && !tables?.categories.has(write.category!)) {
        return { status: 400, body: { success: false, error_code: 'calibration_invalid', issues: ['category'] } }
      }
      if (implausible(write.unit, calibrationGramsPerUnit(write, tables, write.scope === 'category' ? write.category : null))) {
        return { status: 400, body: { success: false, error_code: 'calibration_invalid', issues: ['implausible_amount'] } }
      }
      const desc = describeCalibration({ ...write, food_name: foodName })
      const id = await setCalibration(supabase, userId, { ...(write as CalibrationWrite), source_text: desc })
      return { status: 200, body: { success: true, op, id } }
    }
    return { status: 400, body: { success: false, error_code: 'calibration_invalid', issues: ['op'] } }
  } catch (e) {
    console.error('[calibration] api failed:', (e as Error)?.message ?? e)
    return { status: 200, body: { success: false, error_code: 'calibration_failed' } }
  }
}

// ── (b) Learning from a gram edit ─────────────────────────────────────────────
// The meal's entries as stored (read ONCE per table-mode edit, before anything is
// weighed): the edit path uses them to keep unchanged foods as they were and to
// learn from a changed one. Filtered by user: the meal must be this user's.
export interface StoredEntry {
  food_item_id: string | null
  food_name: string | null
  quantity_g: number | null
  quantity_label: string | null
  portion_unit: string | null
  portion_size: string | null
  portion_count: number | null
  portion_source: string | null
  portion_confidence: number | null
}
// deno-lint-ignore no-explicit-any
export async function loadMealEntries(supabase: any, userId: string, mealLogId: string): Promise<StoredEntry[] | null> {
  try {
    const { data, error } = await supabase.from('food_entries')
      .select('food_item_id, food_name, quantity_g, quantity_label, portion_unit, portion_size, portion_count, portion_source, portion_confidence')
      .eq('meal_log_id', mealLogId).eq('user_id', userId)
    if (error) throw new Error(error.message)
    return data ?? []
  } catch (e) {
    console.error('[calibration] meal entries unavailable:', (e as Error)?.message ?? e)
    return null
  }
}
export function storedEntryFor(entries: StoredEntry[] | null, foodItemId: string | null, name: string): StoredEntry | undefined {
  if (!entries || !foodItemId) return undefined
  const norm = normalizeName(name)
  return entries.find((r) => r.food_item_id === foodItemId && normalizeName(r.food_name ?? '') === norm)
    ?? entries.find((r) => r.food_item_id === foodItemId)
}

// Sources where the unit was the user's own word and the grams came from data or the user: an edit of
// such an entry says something about THEIR unit. Not serving_default (the engine chose the unit), not ai /
// edit_rescale (no data behind the old grams), not stated / label / rule / legacy.
export const LEARNABLE_SOURCES: ReadonlySet<string> = new Set(['food', 'category', 'volume', 'memory', 'user_calibration'])
const EDIT_RATIO_MIN = 0.33
const EDIT_RATIO_MAX = 3
const EDIT_CONFIRM_TOLERANCE = 0.15

export interface EditLesson {
  foodItemId: string
  foodName: string
  unit: Unit
  size: Size
  gramsPerUnit: number          // the new amount per previous unit, weighed by the engine (ml x density for a volume)
  dataDefaultPerUnit: number | null   // the engine's data answer for (unit, size) on this food, no personal sources
}

// Which edits may teach: the previous entry had a unit the user named (and a learnable source), and the
// new parse states a weight or volume with no unit ("2 katori" -> "300 g").
export function editLessonCandidate(
  prev: StoredEntry | undefined, parse: { unit: Unit | null; stated_amount: number | null; stated_unit: string | null } | undefined,
): { unit: Unit; size: Size; count: number } | null {
  if (!prev || !parse || parse.unit !== null || parse.stated_amount == null || !parse.stated_unit) return null
  if (!(UNITS as readonly string[]).includes(prev.portion_unit ?? '') || prev.portion_unit === 'serving') return null
  if (!LEARNABLE_SOURCES.has(prev.portion_source ?? '')) return null
  const count = Number(prev.portion_count)
  if (!(count > 0)) return null
  const size = (['S', 'M', 'L'].includes(prev.portion_size ?? '') ? prev.portion_size : 'M') as Size
  return { unit: prev.portion_unit as Unit, size, count }
}

// Writes what the edits taught, food-scoped. A lesson outside the R8 bounds or outside x0.33..x3 of the
// data default is dropped (a typo must not become the user's katori). The first lesson is stored as
// origin 'edit' (served at low confidence: the app asks before trusting it); a second edit within 15% of
// the stored value stores 'edit_confirmed'. Never throws; returns what was learned, for the reply.
export async function learnFromEdit(
  // deno-lint-ignore no-explicit-any
  supabase: any, userId: string, lessons: EditLesson[],
): Promise<Array<{ desc: string; unit: Unit; confirmed: boolean }>> {
  const ok = lessons.filter((l) => {
    if (implausible(l.unit, l.gramsPerUnit)) return false
    if (l.dataDefaultPerUnit && l.dataDefaultPerUnit > 0) {
      const k = l.gramsPerUnit / l.dataDefaultPerUnit
      if (k < EDIT_RATIO_MIN || k > EDIT_RATIO_MAX) return false
    }
    return true
  })
  if (ok.length === 0) return []
  try {
    const ids = [...new Set(ok.map((l) => l.foodItemId))]
    const { data, error } = await supabase.from('user_portion_calibrations')
      .select('food_item_id, unit, size, grams, origin')
      .eq('user_id', userId).eq('scope', 'food').in('food_item_id', ids).is('revoked_at', null)
    if (error) throw new Error(error.message)
    const writes = ok.map(async (l) => {
      // deno-lint-ignore no-explicit-any
      const prior = (data ?? []).find((c: any) => c.food_item_id === l.foodItemId && c.unit === l.unit && c.size === l.size)
      const priorG = prior?.grams == null ? null : Number(prior.grams)
      const confirmed = priorG !== null && priorG > 0 && Math.abs(l.gramsPerUnit - priorG) <= EDIT_CONFIRM_TOLERANCE * priorG
      const grams = Math.round(l.gramsPerUnit * 10) / 10
      const write: CalibrationWrite = {
        scope: 'food', food_item_id: l.foodItemId, unit: l.unit, size: l.size, grams,
        origin: confirmed ? 'edit_confirmed' : 'edit',
      }
      const desc = describeCalibration({ ...write, food_name: l.foodName })
      await setCalibration(supabase, userId, { ...write, source_text: desc })
      return { desc, unit: l.unit, confirmed }
    })
    return await Promise.all(writes)
  } catch (err) {
    console.error('[calibration] learning from the edit failed:', (err as Error)?.message ?? err)
    return []
  }
}
