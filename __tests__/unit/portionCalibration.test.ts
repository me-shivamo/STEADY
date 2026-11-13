import { parseCalibrationStatement, calibrationScopeFromWords } from '../../supabase/functions/_shared/portionCalibration'
import {
  editLessonCandidate, handleCalibrationApi, handleCalibrationStatement, learnFromEdit, loadMealEntries, storedEntryFor,
} from '../../supabase/functions/_shared/portionCalibrationApi'
import { clearPortionCache } from '../../supabase/functions/_shared/portionStore'
import { buildSeed } from '../../scripts/portions/lib'
import { portionFake } from '../../test-utils/portionFake'

// Personal calibration (founder 2026-11-13, spec k16): learned from statements,
// gram edits and chip / follow-up answers; per user; seen and undone.

const words = buildSeed().words

beforeEach(() => {
  clearPortionCache()
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

describe('parseCalibrationStatement', () => {
  it.each([
    ['my cup is 350 ml', { kind: 'set', unit: 'cup', size: 'M', ml: 350, grams: null, as_size: null, foodPhrase: null }],
    ['My cup is 350ml.', { kind: 'set', unit: 'cup', ml: 350 }],
    ['I drink 350 ml of milk in one cup', { kind: 'set', unit: 'cup', ml: 350, foodPhrase: 'milk' }],
    ['I usually drink 250ml chai per cup', { kind: 'set', unit: 'cup', ml: 250, foodPhrase: 'chai' }],
    ['my katori is small', { kind: 'set', unit: 'katori', size: 'M', as_size: 'S', grams: null, ml: null }],
    ['meri katori chhoti hai', { kind: 'set', unit: 'katori', as_size: 'S' }],
    ['my cup is a big one', { kind: 'set', unit: 'cup', as_size: 'L' }],
    ['my dal katori is 200 g', { kind: 'set', unit: 'katori', grams: 200, foodPhrase: 'dal' }],
    ['my katori of dal is 200g', { kind: 'set', unit: 'katori', grams: 200, foodPhrase: 'dal' }],
    ['meri katori 200 ml ki hai', { kind: 'set', unit: 'katori', ml: 200, foodPhrase: null }],
    ['my small bowl is 150 ml', { kind: 'set', unit: 'bowl', size: 'S', ml: 150 }],
    ['my glass is 1.5 l', { kind: 'set', unit: 'glass', ml: 1500 }],
    ['my roti is 50 g', { kind: 'set', unit: 'piece', grams: 50, foodPhrase: 'roti', pieceOfFood: true }],
    ['forget my cup size', { kind: 'revoke', unit: 'cup', all: false }],
    ['reset my portion sizes', { kind: 'revoke', unit: null, all: true }],
    ['what are my portion sizes', { kind: 'list' }],
    ['show my cup size', { kind: 'list' }],
  ] as Array<[string, object]>)('%s', (text, expected) => {
    expect(parseCalibrationStatement(text)).toMatchObject(expected)
  })
  it.each([
    'my lunch was 2 rotis', 'my breakfast is 200 g of poha', '2 cups of milk', 'my protein shake is 300 ml',
    'i have 200 g rice in my bowl', 'I had 350 ml of milk in a cup', 'what did I eat today', 'cup of chai', 'my cup',
  ])('a log or a question is not a statement: %s', (text) => {
    expect(parseCalibrationStatement(text)).toBeNull()
  })
})

describe('calibrationScopeFromWords', () => {
  it('no food words → any food; a category word → that category; anything else → needs a food row', () => {
    expect(calibrationScopeFromWords(null, words)).toEqual({ scope: 'any' })
    expect(calibrationScopeFromWords('milk', words)).toEqual({ scope: 'category', category: 'milk' })
    expect(calibrationScopeFromWords('chai', words)).toEqual({ scope: 'category', category: 'tea' })
    expect(calibrationScopeFromWords('maggi', words)).toEqual({ scope: 'needs_food', phrase: 'maggi' })
  })
})

describe('handleCalibrationStatement', () => {
  const rpcLog: Array<Record<string, unknown>> = []
  const rpc = {
    set_portion_calibration: (a: Record<string, unknown>) => { rpcLog.push(a); return 'cal-new' },
    revoke_portion_calibrations: (a: Record<string, unknown>) => { rpcLog.push(a); return a.p_all ? 3 : 1 },
  }
  beforeEach(() => { rpcLog.length = 0 })

  it('"my cup is 350 ml" saves an any-food cup for THIS user and says how to undo', async () => {
    const sb = portionFake({ rpc })
    const r = await handleCalibrationStatement(sb.client, 'user-1', parseCalibrationStatement('my cup is 350 ml')!, 'my cup is 350 ml')
    expect(r).toMatchObject({ handled: true, calibration: { op: 'set', id: 'cal-new' } })
    expect(r.reply).toMatch(/cup = 350 ml.*forget my cup size/)
    // the stored source_text is the canonical description, never the raw message (chat_messages holds that)
    expect(rpcLog[0]).toMatchObject({ p_user_id: 'user-1', p_scope: 'any', p_unit: 'cup', p_size: 'M', p_ml: 350, p_grams: null, p_origin: 'statement', p_source_text: 'cup = 350 ml' })
  })
  it('an implausible size is refused, never saved: "my spoon is 500 g", "my cup is 3500 ml"', async () => {
    const sb = portionFake({ rpc })
    for (const t of ['my spoon is 500 g', 'my cup is 3500 ml', 'my katori is 5 g']) {
      const r = await handleCalibrationStatement(sb.client, 'user-1', parseCalibrationStatement(t)!, t)
      expect(r.handled).toBe(true)
      expect(r.reply).toMatch(/seems unusual for one (spoon|cup|katori)/)
    }
    expect(rpcLog).toEqual([])
  })
  it('"my rice is 200 g", "my dal is 150 g", "my paneer is 100 g", "my oats is 40g", "my whey is 30 g": logs, not piece sizes', async () => {
    const sb = portionFake({ rpc })
    for (const t of ['my rice is 200 g', 'my dal is 150 g', 'my paneer is 100 g', 'my oats is 40g', 'my whey is 30 g', 'my sugar is 10 g', 'my curd is 200 g']) {
      const intent = parseCalibrationStatement(t)
      expect(intent).toMatchObject({ kind: 'set', unit: 'piece', pieceOfFood: true })
      expect((await handleCalibrationStatement(sb.client, 'user-1', intent!, t)).handled).toBe(false)
    }
    expect(rpcLog).toEqual([])
  })
  it('"forget my chai cup size" undoes the chai (tea) cup only; "forget my cup size" every cup', async () => {
    const sb = portionFake({ rpc })
    const scoped = parseCalibrationStatement('forget my chai cup size')!
    expect(scoped).toEqual({ kind: 'revoke', unit: 'cup', all: false, foodPhrase: 'chai' })
    const r = await handleCalibrationStatement(sb.client, 'user-1', scoped, 'x')
    expect(rpcLog[0]).toMatchObject({ p_user_id: 'user-1', p_unit: 'cup', p_scope: 'category', p_category: 'tea', p_food_item_id: null })
    expect(r.reply).toMatch(/cup size for chai/)
    await handleCalibrationStatement(sb.client, 'user-1', parseCalibrationStatement('forget my cup size')!, 'x')
    expect(rpcLog[1]).toMatchObject({ p_unit: 'cup', p_scope: null, p_category: null, p_food_item_id: null })
  })
  it('"I drink 350 ml of milk in one cup" is scoped to the milk category', async () => {
    const sb = portionFake({ rpc })
    await handleCalibrationStatement(sb.client, 'user-1', parseCalibrationStatement('I drink 350 ml of milk in one cup')!, 'x')
    expect(rpcLog[0]).toMatchObject({ p_scope: 'category', p_category: 'milk', p_unit: 'cup', p_ml: 350 })
  })
  it('a food with no category word is scoped to the user\'s own row for it', async () => {
    const sb = portionFake({ rpc, memory: [{ user_id: 'user-1', normalized_name: 'maggi', food_item_id: 'priv-maggi' }],
      foodItems: [{ id: 'priv-maggi', name: 'maggi', status: 'unverified', created_by: 'user-1' }] })
    const r = await handleCalibrationStatement(sb.client, 'user-1', parseCalibrationStatement('my bowl of maggi is 300 g')!, 'x')
    expect(r.handled).toBe(true)
    expect(rpcLog[0]).toMatchObject({ p_scope: 'food', p_food_item_id: 'priv-maggi', p_grams: 300 })
  })
  it('never points a calibration at another user\'s private row', async () => {
    const sb = portionFake({ rpc, memory: [{ user_id: 'user-1', normalized_name: 'maggi', food_item_id: 'their-maggi' }],
      foodItems: [{ id: 'their-maggi', name: 'maggi', status: 'unverified', created_by: 'user-2' }] })
    const r = await handleCalibrationStatement(sb.client, 'user-1', parseCalibrationStatement('my bowl of maggi is 300 g')!, 'x')
    expect(r.reply).toMatch(/couldn't match "maggi"/)
    expect(rpcLog).toEqual([])
  })
  it('"my roti is 50 g": flatbread category; an unknown word falls through to the log', async () => {
    const sb = portionFake({ rpc })
    expect((await handleCalibrationStatement(sb.client, 'user-1', parseCalibrationStatement('my roti is 50 g')!, 'x')).handled).toBe(true)
    expect(rpcLog[0]).toMatchObject({ p_scope: 'category', p_category: 'flatbread', p_unit: 'piece', p_grams: 50 })
    expect((await handleCalibrationStatement(sb.client, 'user-1', parseCalibrationStatement('my lunch is 300 g')!, 'x')).handled).toBe(false)
  })
  it('list and revoke', async () => {
    const sb = portionFake({ rpc, calibrations: [
      { id: 'c1', user_id: 'user-1', scope: 'any', category: null, food_item_id: null, unit: 'cup', size: 'M', grams: null, ml: 350, as_size: null, origin: 'statement', revoked_at: null, created_at: '2026-11-13' },
      { id: 'c2', user_id: 'user-2', scope: 'any', category: null, food_item_id: null, unit: 'katori', size: 'M', grams: 999, ml: null, as_size: null, origin: 'statement', revoked_at: null, created_at: '2026-11-13' },
    ] })
    const list = await handleCalibrationStatement(sb.client, 'user-1', { kind: 'list' }, 'x')
    expect(list.reply).toBe('Your portion sizes: cup = 350 ml. Say "forget my <unit> size" to undo one.')
    const rev = await handleCalibrationStatement(sb.client, 'user-1', { kind: 'revoke', unit: 'cup', all: false, foodPhrase: null }, 'x')
    expect(rev.reply).toMatch(/forgotten your cup size/)
    expect(rpcLog[0]).toMatchObject({ p_user_id: 'user-1', p_unit: 'cup', p_all: false })
  })
  it('a database failure answers in fixed copy, never throws', async () => {
    const sb = portionFake({ rpc: {} })
    const r = await handleCalibrationStatement(sb.client, 'user-1', parseCalibrationStatement('my cup is 350 ml')!, 'x')
    expect(r).toMatchObject({ handled: true })
    expect(r.reply).toMatch(/couldn't save that portion size/)
  })
})

describe('handleCalibrationApi (chip and follow-up answers, list, undo)', () => {
  const rpcLog: Array<Record<string, unknown>> = []
  const rpc = { set_portion_calibration: (a: Record<string, unknown>) => { rpcLog.push(a); return 'cal-x' }, revoke_portion_calibrations: () => 1 }
  beforeEach(() => { rpcLog.length = 0 })
  it('a chip answer for a verified food saves a food-scoped calibration', async () => {
    const sb = portionFake({ rpc, foodItems: [{ id: 'dal-row', name: 'dal', status: 'verified', created_by: null }] })
    const r = await handleCalibrationApi(sb.client, 'user-1', { op: 'set', scope: 'food', food_item_id: 'dal-row', unit: 'katori', grams: 180, origin: 'chip' }, true)
    expect(r).toEqual({ status: 200, body: { success: true, op: 'set', id: 'cal-x' } })
    expect(rpcLog[0]).toMatchObject({ p_user_id: 'user-1', p_scope: 'food', p_food_item_id: 'dal-row', p_grams: 180, p_origin: 'chip' })
  })
  it.each([
    [{ op: 'set', scope: 'any', unit: 'ladle', grams: 10, origin: 'chip' }, 'unit'],
    [{ op: 'set', scope: 'any', unit: 'cup', grams: 10, ml: 10, origin: 'chip' }, 'exactly_one_of_grams_ml_as_size'],
    [{ op: 'set', scope: 'category', unit: 'cup', grams: 10, origin: 'chip' }, 'scope'],
    [{ op: 'set', scope: 'any', unit: 'cup', grams: 10, origin: 'statement' }, 'origin'],
    [{ op: 'set', scope: 'category', category: 'nonsense', unit: 'cup', grams: 10, origin: 'chip' }, 'category'],
    [{ op: 'nope' }, 'op'],
    [{ op: 'revoke' }, 'id_unit_or_all'],
  ] as Array<[Record<string, unknown>, string]>)('rejects %j', async (req, issue) => {
    const sb = portionFake({ rpc })
    const r = await handleCalibrationApi(sb.client, 'user-1', req, true)
    expect(r.status).toBe(400)
    expect(r.body.issues).toContain(issue)
    expect(rpcLog).toEqual([])
  })
  it('refuses another user\'s private food row', async () => {
    const sb = portionFake({ rpc, foodItems: [{ id: 'their-row', name: 'x', status: 'unverified', created_by: 'user-2' }] })
    const r = await handleCalibrationApi(sb.client, 'user-1', { op: 'set', scope: 'food', food_item_id: 'their-row', unit: 'cup', grams: 10, origin: 'chip' }, true)
    expect(r.body.issues).toEqual(['food_item_id'])
  })
  it('set is unavailable when the caller says so (not table mode)', async () => {
    const sb = portionFake({ rpc })
    const r = await handleCalibrationApi(sb.client, 'user-1', { op: 'set', scope: 'any', unit: 'cup', grams: 10, origin: 'chip' }, false)
    expect(r.body).toEqual({ success: false, error_code: 'portion_calibration_unavailable' })
  })
})

describe('learnFromEdit (a gram edit on a logged food that had a unit)', () => {
  const rpcLog: Array<Record<string, unknown>> = []
  const rpc = { set_portion_calibration: (a: Record<string, unknown>) => { rpcLog.push(a); return 'cal-e' } }
  beforeEach(() => { rpcLog.length = 0 })
  const stated = (amount: number, unit: 'g' | 'ml') => ({ count: 1, unit: null, size: null, stated_amount: amount, stated_unit: unit, context: null, fallback_g: null })
  const entry = (extra: Record<string, unknown>) => ({
    meal_log_id: 'm1', user_id: 'user-1', food_item_id: 'dal-row', food_name: 'Dal', quantity_g: 300, quantity_label: '2 katori',
    portion_unit: 'katori', portion_size: 'M', portion_count: 2, portion_source: 'food', portion_confidence: 0.85, ...extra,
  })
  const lesson = (gramsPerUnit: number, dataDefaultPerUnit: number | null = 150) =>
    ({ foodItemId: 'dal-row', foodName: 'Dal', unit: 'katori' as const, size: 'M' as const, gramsPerUnit, dataDefaultPerUnit })

  it('which edits may teach: the user named the unit and the old grams came from data or the user', async () => {
    const sb = portionFake({ foodEntries: [entry({}), entry({ food_item_id: 'milk-row', food_name: 'milk', portion_unit: 'g', portion_source: 'stated' })] })
    const stored = await loadMealEntries(sb.client, 'user-1', 'm1')
    expect(editLessonCandidate(storedEntryFor(stored, 'dal-row', 'Dal'), stated(300, 'g'))).toEqual({ unit: 'katori', size: 'M', count: 2 })
    expect(editLessonCandidate(storedEntryFor(stored, 'milk-row', 'milk'), stated(300, 'ml'))).toBeNull()        // no unit before
    expect(editLessonCandidate(storedEntryFor(stored, 'dal-row', 'Dal'), { ...stated(300, 'g'), unit: 'katori' })).toBeNull()   // a unit now
    // a no-amount log weighed in the engine's default katori ('serving_default') never teaches "your katori"
    for (const src of ['serving_default', 'ai', 'edit_rescale', 'stated', null]) {
      expect(editLessonCandidate(entry({ portion_source: src }) as never, stated(300, 'g'))).toBeNull()
    }
    // another user's meal reads as empty
    const other = portionFake({ foodEntries: [entry({ user_id: 'user-2' })] })
    expect(await loadMealEntries(other.client, 'user-1', 'm1')).toEqual([])
  })
  it('the first edit is stored as an unconfirmed "edit" (low confidence); a second edit within 15% confirms it', async () => {
    const sb = portionFake({ rpc })
    const first = await learnFromEdit(sb.client, 'user-1', [lesson(150)])
    expect(first).toEqual([{ desc: 'katori = 150 g (for Dal)', unit: 'katori', confirmed: false }])
    expect(rpcLog[0]).toMatchObject({ p_user_id: 'user-1', p_scope: 'food', p_food_item_id: 'dal-row', p_unit: 'katori', p_size: 'M', p_grams: 150, p_origin: 'edit', p_source_text: 'katori = 150 g (for Dal)' })
    const sb2 = portionFake({ rpc, calibrations: [{ id: 'c1', user_id: 'user-1', scope: 'food', category: null, food_item_id: 'dal-row', unit: 'katori', size: 'M', grams: 150, ml: null, as_size: null, origin: 'edit', revoked_at: null }] })
    const second = await learnFromEdit(sb2.client, 'user-1', [lesson(160)])
    expect(second[0].confirmed).toBe(true)
    expect(rpcLog[1]).toMatchObject({ p_grams: 160, p_origin: 'edit_confirmed' })
  })
  it('a typo never becomes the user\'s katori: outside the unit bounds or x0.33..x3 of the data default', async () => {
    const sb = portionFake({ rpc })
    expect(await learnFromEdit(sb.client, 'user-1', [lesson(1500)])).toEqual([])   // "3000 g" for 2 katori
    expect(await learnFromEdit(sb.client, 'user-1', [lesson(25)])).toEqual([])     // "50 g" for 2 katori: 0.17 x the default
    expect(await learnFromEdit(sb.client, 'user-1', [lesson(45, 150)])).toEqual([]) // 0.3 x
    expect(rpcLog).toEqual([])
  })
})
