import { readFileSync } from 'fs'
import { join } from 'path'

import { buildSeed, engineTables, INPUT_FILES, REPO } from '../../scripts/portions/lib'
import {
  DELTA_FILES, drinkDeltaTables, loadDrinkDelta, RESEARCH_REPORT, unitWordWithDelta, validateDrinkDelta, type DrinkDelta,
} from '../../scripts/portions/drinkDelta'
import { validateParsedFoodV2 } from '../../supabase/functions/_shared/parseSchema'
import {
  computePortion, type EngineInput, type PortionParse, type PortionResult, type PortionTables, type PortionUnitRow, type Region,
} from '../../supabase/functions/_shared/portions'
import { normalizeUnitWord, portionFromDescription } from '../../supabase/functions/_shared/portionText'

// WP4 Indian drink sizes (plan .claude/plans/v1.2-followup-build-plan.md WP4, with review #14 and #15).
// The delta (scripts/portions/data/drinks_delta_*.csv) is PROPOSED data on top of migration 054's seed:
// no 054 input is edited, and nothing in production reads these files yet. Each gap below is proved
// against the real 054 seed first ("today"), then shown with the delta's proposed rows served the way
// PORTION_MODE=eval_only serves them to the eval account ("delta"). Research and sources:
// docs/research/reports/Indian drink sizes.md. Live row ids: scripts/usda/data/verified_fdc_snapshot.csv.

const seed = buildSeed()
const base = engineTables(seed)
const delta = loadDrinkDelta()
const withDelta = drinkDeltaTables(seed, delta)

const P = (count: number, unit: PortionParse['unit'], size: PortionParse['size'] = null, extra: Partial<PortionParse> = {}): PortionParse =>
  ({ count, unit, size, stated_amount: null, stated_unit: null, context: null, fallback_g: 240, ...extra })
const row = (id: string | null, fdc: number | null, name: string, status = 'verified') => ({ id, fdc_id: fdc, status, name })
const priv = (name: string) => row(`private-${name}`, null, name, 'unverified')
type Tables = { tables: PortionTables; foodRows: PortionUnitRow[] }
const run = (t: Tables, parse: PortionParse, phrase: string, r: ReturnType<typeof row>, region: Region, proposed: boolean, extra: Partial<EngineInput> = {}) =>
  computePortion(t.tables, { parse, phrase, row: r, foodRows: t.foodRows, region, proposed, channel: 'text', ...extra })

// live rows (exact keys) for the drink phrases
const CHAI = row('e21a4369-e513-534a-8968-4e4240e871d0', null, 'Tea (home-style chai with milk and sugar)')   // key 'tea', aliases chai / masala chai
const BLACK_TEA = row('4075dd5c-c36c-47d8-8627-14fc4d4927e3', 174155, 'black tea')
const COFFEE = row('00511fec-5452-415f-bc47-205af357e4f6', 171881, 'coffee')
const FILTER_COFFEE = row('88221799-1e89-4c15-b25d-5c0b8b2ad6a1', 171881, 'filter coffee')
const CAPPUCCINO = row('1607ef08-555b-4f70-9661-72428e959a5a', 2710472, 'cappuccino')               // FNDDS: small 360 / medium 480 / large 600 g
const LASSI = row('c4de0397-04fd-42cc-b5b0-d6f052bcaa58', 2490375, 'lassi')
const ORANGE_JUICE = row('9547ab76-cccf-4b4f-a793-d81b8320b985', 171354, 'orange juice')
const CHAAS = row('29c65def-14f9-424e-b9e8-fa04bb2f78fd', 172225, 'buttermilk (chaas)')

describe('the delta is valid, proposed-only and outside 054', () => {
  it('validates against the 054 seed (ids, promotion-safe keys and defaults, neutral categories, compare-and-swap re-points)', () => {
    expect(() => validateDrinkDelta(seed, delta)).not.toThrow()
  })
  it('every row ships proposed with no approved_by, a source_ref and the research report as evidence', () => {
    // 4 IN count-only, 6 IN cafe (cup + piece S/M/L), 3 US cafe, 5 US tea, 5 US coffee, 3 lassi, 2 shake, 2 cold coffee,
    // and the rows that keep the count-only cups off drinks that inherit them: 2 espresso, 1 iced tea, 2 bubble tea
    expect(delta.rows.length).toBe(35)
    for (const r of delta.rows) {
      expect(r.status).toBe('proposed')
      expect(r.approved_by).toBeNull()
      expect(r.source_ref).toMatch(/^(research|mapping):drink-sizes#[a-z-]+$/)
      expect(r.evidence).toContain(RESEARCH_REPORT)
    }
  })
  it('every source_ref anchor is a section of the research report', () => {
    const report = readFileSync(join(REPO, RESEARCH_REPORT), 'utf8')
    for (const ref of new Set(delta.rows.map((r) => r.source_ref.split(':')[1]))) expect(report).toContain(`\`${ref}\``)
  })
  it('no delta file is an 054 input, so 054\'s inputs_sha256 and emit054 --check cannot change', () => {
    for (const f of DELTA_FILES) expect(INPUT_FILES as readonly string[]).not.toContain(f)
    expect(buildSeed().rows.length).toBe(seed.rows.length)   // loading and merging the delta never mutates the seed
  })
  it('rejects what a later migration must never carry', () => {
    const bad = (mutate: (d: DrinkDelta) => DrinkDelta) => () => validateDrinkDelta(seed, mutate(loadDrinkDelta()))
    expect(bad((d) => ({ ...d, rows: d.rows.map((r, i) => (i === 0 ? { ...r, status: 'active' } : r)) }))).toThrow(/status active/)
    expect(bad((d) => ({ ...d, categories: d.categories.map((c) => ({ ...c, density_g_per_ml: 1.04 })) }))).toThrow(/density must be empty/)
    expect(bad((d) => ({ ...d, categories: d.categories.map((c) => ({ ...c, serving_unit: 'piece' })) }))).toThrow(/serving_unit must be empty/)
    expect(bad((d) => ({ ...d, words: d.words.map((w) => ({ ...w, replaces: w.replaces ? 'juice' : null })) }))).toThrow(/054 has it in beverage, not juice/)
    expect(bad((d) => ({ ...d, unitWords: [...d.unitWords, { word: 'tumbler', unit: 'glass', size: null, count: null, note: '' }] }))).toThrow(/already reads it/)
    expect(bad((d) => ({ ...d, rows: [...d.rows, { ...d.rows[0], source_ref: 'mapping:drink-sizes#dup', id: 'x', is_default: false }] }))).toThrow(/two active rows/)
  })
  it('rejects a word move that is not neutral', () => {
    const bad = (mutate: (d: DrinkDelta) => DrinkDelta) => () => validateDrinkDelta(seed, mutate(loadDrinkDelta()))
    const word = (w: DrinkDelta['words'][number]) => (d: DrinkDelta) => ({ ...d, words: [...d.words, w] })
    // a re-point must keep 054's priority (a new priority changes which word wins elsewhere)
    expect(bad((d) => ({ ...d, words: d.words.map((w) => (w.word === 'lassi' ? { ...w, priority: 99 } : w)) }))).toThrow(/priority \/ head_only must stay/)
    // the target must be a NEW child of the word's current category, so the chain keeps every row it had
    expect(bad(word({ word: 'water', category: 'iced_tea', priority: 80, head_only: false, replaces: 'beverage', note: '' }))).toThrow(/parent is tea, not beverage/)
    expect(bad(word({ word: 'water', category: 'juice', priority: 80, head_only: false, replaces: 'beverage', note: '' }))).toThrow(/not a new delta category/)
    // the AI kcal clamp is per category (aiMacros: ranges.get(category)), so leaving a clamped category drops it
    const frappe = (d: DrinkDelta) => ({
      ...d,
      categories: [...d.categories, { ...d.categories[0], category: 'frappe_x', parent: 'cafe_coffee', s_ratio: 0.75, l_ratio: 1.46 }],
      words: [...d.words, { word: 'frappe', category: 'frappe_x', priority: 90, head_only: false, replaces: 'cafe_coffee', note: '' }],
    })
    expect(bad(frappe)).toThrow(/leaves cafe_coffee, which has a kcal clamp/)
    // an insert must be a phrase 054 already reads through a shorter word that ends it
    expect(bad(word({ word: 'boba', category: 'bubble_tea', priority: 85, head_only: false, replaces: null, note: '' }))).toThrow(/054 reads no category for it/)
    expect(bad(word({ word: 'tea kettle', category: 'iced_tea', priority: 85, head_only: false, replaces: null, note: '' }))).toThrow(/does not end it/)
    expect(bad(word({ word: 'tea masala', category: 'iced_tea', priority: 85, head_only: false, replaces: null, note: '' }))).toThrow(/head-only 'masala'/)
  })
})

describe('ships dark: with the delta loaded, real users (proposed rows off) get exactly today\'s answers', () => {
  // grams, source, confidence, unit, size, options and needs_follow_up are all compared. Only the category LABEL
  // may differ: for the seven re-pointed words (lassi, shake, milkshake, smoothie, cold coffee, iced coffee,
  // espresso) and for phrases that end in an inserted word (iced tea, ice tea, bubble tea, boba tea).
  const strip = (r: PortionResult | null) => (r ? { ...r, category: undefined } : null)
  const units: Array<PortionParse['unit']> = [null, 'piece', 'cup', 'glass', 'mug', 'katori', 'bowl', 'cutting', 'can']
  // phrases that END in a delta word but are not 054 words themselves, so the 054 word list alone misses them
  const DELTA_PHRASES = ['peach iced tea', 'lemon ice tea', 'long island iced tea', 'taro bubble tea', 'brown sugar boba tea',
    'double espresso', 'mango lassi', 'chocolate milkshake', 'banana shake', 'mango smoothie', 'cold coffee with ice cream', 'vietnamese iced coffee']
  it('every 054 category word and delta word x 9 units x 2 regions x home/restaurant, plus the live drink rows', () => {
    const rows = [...seed.words.map((w) => [w.word, priv(w.word)] as const),
      ...[...delta.words.map((w) => w.word), ...DELTA_PHRASES].map((p) => [p, priv(p)] as const),
      ...[CHAI, BLACK_TEA, COFFEE, FILTER_COFFEE, CAPPUCCINO, LASSI, ORANGE_JUICE, CHAAS].map((r) => [r.name!, r] as const)]
    let n = 0
    for (const [phrase, r] of rows) for (const u of units) for (const region of ['IN', 'US'] as const) for (const context of [null, 'restaurant'] as const) {
      const parse = P(1, u, null, { context })
      expect(strip(run(withDelta, parse, phrase, r, region, false))).toEqual(strip(run(base, parse, phrase, r, region, false)))
      n++
    }
    expect(n).toBeGreaterThan(9000)
  }, 60_000)
  it('only the re-pointed words change their category label, each to a new child of its old category', () => {
    const label = (t: Tables, w: string) => run(t, P(1, 'glass'), w, priv(w), 'IN', false)!.category
    const changed = seed.words.filter((w) => label(withDelta, w.word) !== label(base, w.word)).map((w) => w.word).sort()
    expect(changed).toEqual(['cold coffee', 'espresso', 'iced coffee', 'lassi', 'milkshake', 'shake', 'smoothie'])
    const parent = new Map(delta.categories.map((c) => [c.category, c.parent]))
    for (const p of [...delta.words.map((w) => w.word), ...DELTA_PHRASES]) {
      const before = label(base, p)
      const after = label(withDelta, p)
      if (after !== before) expect([p, parent.get(after!)]).toEqual([p, before])
    }
  })
})

describe('gaps proved against today\'s 054 seed, and what the proposed rows give (eval_only)', () => {
  // [label, parse, row, region, today [grams, source], delta [grams, source]]; fallback_g 240 = the parse's own guess (R8)
  type Case = [string, PortionParse, ReturnType<typeof row>, Region, [number, string], [number, string]]
  const cases: Case[] = [
    // count-only drinks: the V2 parse labels "1 chai" unit piece, and no drink category has a piece row, so R8 answers
    ['IN "1 chai" = the 128 g founder cup', P(1, 'piece'), CHAI, 'IN', [240, 'ai'], [128, 'category']],
    ['IN "2 chai"', P(2, 'piece'), CHAI, 'IN', [240, 'ai'], [256, 'category']],
    ['IN "1 black tea" (120 ml teacup)', P(1, 'piece'), BLACK_TEA, 'IN', [240, 'ai'], [124.8, 'category']],
    ['IN "1 coffee" (150 ml cup)', P(1, 'piece'), COFFEE, 'IN', [240, 'ai'], [155, 'category']],
    ['IN "1 filter coffee"', P(1, 'piece'), FILTER_COFFEE, 'IN', [240, 'ai'], [155, 'category']],
    ['IN "1 orange juice" (200 ml glass)', P(1, 'piece'), ORANGE_JUICE, 'IN', [240, 'ai'], [211, 'category']],
    ['IN "1 chaas" (200 ml glass)', P(1, 'piece'), CHAAS, 'IN', [240, 'ai'], [204.2, 'category']],
    // Indian cafe sizes: today the live cappuccino row serves FNDDS's US 16 fl oz medium (founder l3)
    ['IN "1 cappuccino" = an Indian regular 250 ml', P(1, 'piece'), CAPPUCCINO, 'IN', [480, 'food'], [253.6, 'category']],
    ['IN "1 small cappuccino"', P(1, 'piece', 'S'), CAPPUCCINO, 'IN', [360, 'food'], [182.6, 'category']],
    ['IN "1 large cappuccino"', P(1, 'piece', 'L'), CAPPUCCINO, 'IN', [600, 'food'], [355.1, 'category']],
    ['IN "1 latte" (no live key)', P(1, 'piece'), priv('latte'), 'IN', [240, 'ai'], [257.5, 'category']],
    ['IN "1 cup latte" (low-confidence hint today)', P(1, 'cup'), priv('latte'), 'IN', [247.2, 'volume'], [257.5, 'category']],
    // lassi, shakes, cold coffee: count-only falls to R8; a cafe or shop glass is the 200 ml home glass
    ['IN "1 lassi"', P(1, 'piece'), LASSI, 'IN', [240, 'ai'], [200, 'category']],
    ['IN "1 mango lassi" (private row)', P(1, 'piece'), priv('mango lassi'), 'IN', [240, 'ai'], [200, 'category']],
    ['IN "1 glass lassi" at a shop', P(1, 'glass', null, { context: 'restaurant' }), LASSI, 'IN', [200, 'category'], [300, 'category']],
    ['IN "1 mango shake"', P(1, 'piece'), priv('mango shake'), 'IN', [240, 'ai'], [330, 'category']],
    ['IN "mango shake" (no amount)', P(1, null), priv('mango shake'), 'IN', [200, 'serving_default'], [330, 'serving_default']],
    ['IN "1 glass shake" at a cafe', P(1, 'glass', null, { context: 'restaurant' }), priv('chocolate milkshake'), 'IN', [200, 'category'], [330, 'category']],
    ['IN "1 cold coffee"', P(1, 'piece'), priv('cold coffee'), 'IN', [240, 'ai'], [300, 'category']],
    ['IN "cold coffee" (no amount)', P(1, null), priv('cold coffee'), 'IN', [200, 'serving_default'], [300, 'serving_default']],
    // US tea and coffee (FNDDS 2024): count-only falls to R8; the US mug is the Indian 200 ml tea mug or the 250 ml hint
    ['US "1 coffee" = FNDDS 12 fl oz default', P(1, 'piece'), COFFEE, 'US', [240, 'ai'], [372, 'category']],
    ['US "1 large coffee" = FNDDS 20 fl oz', P(1, 'piece', 'L'), COFFEE, 'US', [240, 'ai'], [620, 'category']],
    ['US "1 mug coffee"', P(1, 'mug'), COFFEE, 'US', [258.3, 'volume'], [372, 'category']],
    ['US "1 tea"', P(1, 'piece'), BLACK_TEA, 'US', [240, 'ai'], [374.4, 'category']],
    ['US "1 mug tea" (today the Indian tea mug)', P(1, 'mug'), BLACK_TEA, 'US', [208, 'volume'], [374.4, 'category']],
    ['US "1 latte" (private row)', P(1, 'piece'), priv('latte'), 'US', [240, 'ai'], [370.8, 'category']],
    ['US "1 cappuccino": FNDDS default 360 vs the 480 medium served today (founder)', P(1, 'piece'), CAPPUCCINO, 'US', [480, 'food'], [365.2, 'category']],
  ]
  it.each(cases)('%s', (_label, parse, r, region, [g0, s0], [g1, s1]) => {
    const phrase = r.name!
    // today: the same answer with or without proposed rows (054's 7 proposed rows are condiments)
    for (const proposed of [false, true]) {
      const t = run(base, parse, phrase, r, region, proposed)!
      expect([t.grams, t.portion.source]).toEqual([g0, s0])
    }
    const d = run(withDelta, parse, phrase, r, region, true)!
    expect([d.grams, d.portion.source]).toEqual([g1, s1])
    expect(d.portion.ref).toMatch(/drink-sizes#/)
  })
  it('the count-only fixes also stop the follow-up question R8 forces today', () => {
    expect(run(base, P(1, 'piece'), CHAI.name!, CHAI, 'IN', true)!.needs_follow_up).toBe(true)
    expect(run(withDelta, P(1, 'piece'), CHAI.name!, CHAI, 'IN', true)).toMatchObject({ needs_follow_up: false, band: 'medium' })
  })
  it('a shop lassi glass is grade H, so the app still asks', () => {
    expect(run(withDelta, P(1, 'glass', null, { context: 'restaurant' }), 'lassi', LASSI, 'IN', true)).toMatchObject({ band: 'low', needs_follow_up: true })
  })
  it('US cup confidence rises from the untagged generic cup to the FNDDS cup (grams unchanged)', () => {
    const t = run(base, P(1, 'cup'), 'black tea', BLACK_TEA, 'US', true)!
    const d = run(withDelta, P(1, 'cup'), 'black tea', BLACK_TEA, 'US', true)!
    expect([t.grams, t.portion.source, t.needs_follow_up]).toEqual([249.6, 'volume', true])
    expect([d.grams, d.portion.source, d.needs_follow_up]).toEqual([249.6, 'category', false])
  })
})

describe('the count-only cups reach every drink that inherits them; three child categories keep them off', () => {
  // A category row serves the whole chain under it (portions.ts categoryChain), and R4 region-tagged category rows
  // outrank R5 untagged food rows. So the tea / coffee piece rows above would also answer "1 espresso", "1 iced tea"
  // and "1 bubble tea", confidently (medium band, no follow-up). Each case: today (054), the delta WITHOUT the child
  // rows (what the parent rows alone would serve), and the delta.
  const CHILD = ['espresso', 'iced_tea', 'bubble_tea']
  const parentOnly = drinkDeltaTables(seed, { ...delta, rows: delta.rows.filter((r) => !CHILD.includes(r.category!)) })
  type Case = [string, PortionParse, string, Region, [number, string], number, [number, string]]
  const cases: Case[] = [
    ['IN "1 espresso" = one 30 ml shot', P(1, 'piece'), 'espresso', 'IN', [240, 'ai'], 154.5, [30.9, 'category']],
    ['IN "espresso" (no amount): today the 150 ml coffee cup', P(1, null), 'espresso', 'IN', [154.5, 'serving_default'], 154.5, [30.9, 'serving_default']],
    ['US "1 espresso" = FNDDS 60 g', P(1, 'piece'), 'espresso', 'US', [240, 'ai'], 370.8, [61.8, 'category']],
    ['IN "1 iced tea" = 300 ml chain median', P(1, 'piece'), 'iced tea', 'IN', [240, 'ai'], 124.8, [312, 'category']],
    ['IN "peach iced tea" (no amount): today the 120 ml teacup', P(1, null), 'peach iced tea', 'IN', [124.8, 'serving_default'], 124.8, [312, 'serving_default']],
    ['IN "1 ice tea" (BK / McCafe spelling)', P(1, 'piece'), 'ice tea', 'IN', [240, 'ai'], 124.8, [312, 'category']],
    ['IN "1 bubble tea" = FNDDS 435 g', P(1, 'piece'), 'bubble tea', 'IN', [240, 'ai'], 124.8, [435, 'category']],
    ['US "1 boba tea" = FNDDS 435 g', P(1, 'piece'), 'boba tea', 'US', [240, 'ai'], 374.4, [435, 'category']],
  ]
  it.each(cases)('%s', (_label, parse, phrase, region, [g0, s0], gParent, [g1, s1]) => {
    const r = priv(phrase)
    const t = run(base, parse, phrase, r, region, true)!
    expect([t.grams, t.portion.source]).toEqual([g0, s0])
    expect(run(parentOnly, parse, phrase, r, region, true)!.grams).toBe(gParent)
    const d = run(withDelta, parse, phrase, r, region, true)!
    expect([d.grams, d.portion.source]).toEqual([g1, s1])
    expect(d.portion.ref).toMatch(/drink-sizes#(espresso|iced-tea|bubble-tea)/)
  })
  it('a US iced tea needs no row: the US count-only tea is FNDDS\'s own iced-tea default (360 g)', () => {
    expect(run(withDelta, P(1, 'piece'), 'iced tea', priv('iced tea'), 'US', true)).toMatchObject({ grams: 374.4, portion: { source: 'category' } })
  })
  it('a sized espresso scales from the shot, not from the coffee cup', () => {
    expect(run(withDelta, P(1, 'piece', 'L'), 'espresso', priv('espresso'), 'IN', true)!.grams).toBeLessThan(60)
  })
})

describe('kulhad and other unit words: a vocabulary gap the parse validator cannot close today', () => {
  it('054\'s vocabulary does not know kulhad, steel glass or half cup', () => {
    for (const w of ['kulhad', 'kulhar', 'kullad', 'steel glass', 'half cup', 'aadha glass']) expect(normalizeUnitWord(w)).toBeNull()
  })
  it('so the V2 validator keeps the MODEL\'s unit for "1 kulhad chai": a piece goes to R8', () => {
    const v = validateParsedFoodV2({ name: 'chai', count: 1, unit: 'piece', unit_word: 'kulhad', size: null, stated_amount: null, stated_unit: null,
      stated_per_unit: null, prep: null, cooking_fat: null, context: null, fallback_g: 150, confidence: 0.8 }, '1 kulhad chai')
    expect(v.food!.portion.unit).toBe('piece')
    expect(run(base, v.food!.portion, 'chai', CHAI, 'IN', true)).toMatchObject({ grams: 150, portion: { source: 'ai' } })
  })
  it('with the delta vocabulary, kulhad is the Indian teacup whatever the model says: 128 g of chai', () => {
    const w = unitWordWithDelta('kulhad')!
    expect(w).toMatchObject({ unit: 'cup', size: null })
    expect(run(withDelta, P(1, w.unit), 'chai', CHAI, 'IN', true)).toMatchObject({ grams: 128, portion: { source: 'food' } })
    expect(unitWordWithDelta('small kulhad')).toMatchObject({ unit: 'cup', size: 'S' })
    expect(unitWordWithDelta('half cup')).toMatchObject({ unit: 'cup', count: 0.5 })
    expect(unitWordWithDelta('steel glass')).toMatchObject({ unit: 'glass' })
    expect(unitWordWithDelta('katori')).toEqual(normalizeUnitWord('katori'))   // everything else is 054's vocabulary
  })
})

describe('no gap, so no row (review #15)', () => {
  it('IN cup / cutting / mug of chai and a no-amount chai are the founder rows already', () => {
    for (const t of [base, withDelta]) {
      expect(run(t, P(1, 'cup'), 'chai', CHAI, 'IN', true)!.grams).toBe(128)
      expect(run(t, P(1, 'cutting'), 'chai', CHAI, 'IN', true)!.grams).toBe(75)
      expect(run(t, P(1, 'mug'), 'chai', CHAI, 'IN', true)!.grams).toBe(200)
      expect(run(t, P(1, null), 'chai', CHAI, 'IN', true)).toMatchObject({ grams: 128, portion: { source: 'serving_default' } })
    }
  })
  it('IN "coffee" with no amount is already the 150 ml cup (the serving-unit fallback, review #15)', () => {
    for (const t of [base, withDelta]) expect(run(t, P(1, null), 'coffee', COFFEE, 'IN', true)!.grams).toBe(155)
  })
  it('a home glass of lassi, shake or juice is already the 200 ml Indian glass (NIN lassi glass 200 ml)', () => {
    for (const t of [base, withDelta]) {
      expect(run(t, P(1, 'glass'), 'lassi', LASSI, 'IN', true)!.grams).toBe(200)
      expect(run(t, P(1, 'glass'), 'mango shake', priv('mango shake'), 'IN', true)!.grams).toBe(200)
      expect(run(t, P(1, 'glass'), 'orange juice', ORANGE_JUICE, 'IN', true)!.grams).toBe(211)
    }
  })
  it('chhota / bada glass and "half cup" in a V1 description already parse', () => {
    expect(normalizeUnitWord('chhota glass')).toMatchObject({ unit: 'glass', size: 'S' })
    expect(normalizeUnitWord('bada glass')).toMatchObject({ unit: 'glass', size: 'L' })
    expect(portionFromDescription('half cup', 'chai')).toMatchObject({ count: 0.5, unit: 'cup' })
  })
  it('an explicit chain size keeps its volume in both regions, with or without the delta (R1)', () => {
    const grande = P(1, null, null, { stated_amount: 473, stated_unit: 'ml', stated_per_unit: true })
    for (const t of [base, withDelta]) {
      expect(run(t, grande, 'cappuccino', CAPPUCCINO, 'IN', true)).toMatchObject({ grams: 479.9, portion: { source: 'stated' } })
      expect(run(t, grande, 'latte', priv('latte'), 'US', true)).toMatchObject({ grams: 487.2, portion: { source: 'stated' } })
    }
  })
  it('a US cup of coffee is already the USDA 248 g cup (the delta only relabels it)', () => {
    expect(run(base, P(1, 'cup'), 'coffee', COFFEE, 'US', true)).toMatchObject({ grams: 248, portion: { source: 'food' } })
    expect(run(withDelta, P(1, 'cup'), 'coffee', COFFEE, 'US', true)!.grams).toBe(248)
  })
  it('KNOWN, not fixable in data: a US user\'s "1 cup tea" is the Indian chai row\'s founder 128 g (R3 beats any region row; WP6)', () => {
    for (const t of [base, withDelta]) expect(run(t, P(1, 'cup'), 'tea', CHAI, 'US', true)).toMatchObject({ grams: 128, portion: { source: 'food' } })
  })
})
