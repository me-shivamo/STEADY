import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { deflateRawSync } from 'zlib'

import {
  CACHE, dedupeFoods, externalId, foodId, forEachCsvRow, loadFndds, loadPins, NS_STEADY_USDA, selectSubset, SR_BRAND_RE,
  STATUS_REASON_PREFIX, statusReason, unzip, validateFoods, valuesOf, type Bulk, type UsdaFood,
} from '../../scripts/usda/lib'
import { classifyMeasure } from '../../supabase/functions/_shared/portionText'

// v1.2 Phase 7, spec (f) / (h) usdaImport.test.ts: energy selection, the subset rules, dedupe precedence,
// UUIDv5 determinism, and (when the pinned bulk files are in .cache/usda) the real counts and a
// byte-identical regeneration of 055 / 056 / their rollbacks / the manifest.

const REPO = join(__dirname, '..', '..')

function food(p: Partial<UsdaFood> & Pick<UsdaFood, 'dataset' | 'fdcId' | 'description'>): UsdaFood {
  return {
    code: String(p.fdcId), categoryCode: null, category: null, measures: [],
    nutrients: { energy: 100, energyId: 1008, protein: 5, fat: 2, carbs: 15, fiber: 1, fiberId: 1079 },
    ...p,
  }
}

// A minimal zip writer (deflate) so the loaders are tested on real zip bytes.
function zip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text, 'utf8')
    const comp = deflateRawSync(data)
    const nameB = Buffer.from(name, 'utf8')
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8)
    lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameB.length, 26)
    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10)
    ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameB.length, 28); ch.writeUInt32LE(offset, 42)
    locals.push(lh, nameB, comp)
    centrals.push(ch, nameB)
    offset += 30 + nameB.length + comp.length
  }
  const cd = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10)
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, end])
}

describe('pins', () => {
  it('the three bulk files are pinned by sha256 and size, from fdc.nal.usda.gov', () => {
    const pins = loadPins()
    expect(Object.keys(pins).sort()).toEqual(['fndds', 'foundation', 'sr'])
    expect(pins.foundation).toMatchObject({ release: '2026-10-29', format: 'json' })
    expect(pins.sr).toMatchObject({ release: '2018-04', format: 'csv' })
    expect(pins.fndds).toMatchObject({ release: '2024-10-31', format: 'csv' })
    for (const p of Object.values(pins)) expect(p.sha256).toMatch(/^[0-9a-f]{64}$/)
  })
  it('the cache is gitignored', () => {
    expect(readFileSync(join(REPO, '.gitignore'), 'utf8')).toMatch(/^\.cache\/usda\/$/m)
  })
})

describe('zip + csv readers', () => {
  it('unzip inflates entries and keys them by base name; the CSV reader handles quotes, commas and CRLF', () => {
    const z = unzip(zip({ 'dir/a.csv': '"x","y"\r\n"1","he said ""hi"", ok"\r\n2,plain\r\n', 'dir/b.txt': 'hello' }))
    expect([...z.keys()].sort()).toEqual(['a.csv', 'b.txt'])
    const rows: string[][] = []
    forEachCsvRow(z.get('a.csv')!.toString('utf8'), (g) => rows.push([g('x'), g('y')]))
    expect(rows).toEqual([['1', 'he said "hi", ok'], ['2', 'plain']])
  })
})

describe('energy and macros (spec (f) "Energy")', () => {
  it('FNDDS is read by its OLD nutrient numbers: 208 energy, 203 protein, 204 fat, 205 carbs, 291 fibre', () => {
    const csv = (head: string, ...rows: string[]) => [head, ...rows].join('\n') + '\n'
    const z = unzip(zip({
      'f/food.csv': csv('"fdc_id","data_type","description","food_category_id"', '"9","survey_fndds_food","Dal, NFS","3102"'),
      'f/wweia_food_category.csv': csv('"wweia_food_category","wweia_food_category_description"', '"3102","Bean, pea, legume dishes"'),
      'f/survey_fndds_food.csv': csv('"fdc_id","food_code","wweia_category_number"', '"9","41302000","3102"'),
      'f/food_nutrient.csv': csv('"id","fdc_id","nutrient_id","amount"',
        '"1","9","208","120"', '"2","9","203","7"', '"3","9","204","3"', '"4","9","205","16"', '"5","9","291","4"', '"6","9","1008","999"'),
      'f/food_portion.csv': csv('"id","fdc_id","seq_num","portion_description","modifier","gram_weight"',
        '"1","9","1","1 cup","10205","240"', '"2","9","2","Quantity not specified","90000","180"'),
    }))
    const [f] = loadFndds(z)
    expect(f).toMatchObject({ dataset: 'fndds', fdcId: 9, code: '41302000', category: 'Bean, pea, legume dishes' })
    expect(f.nutrients).toEqual({ energy: 120, energyId: 208, protein: 7, fat: 3, carbs: 16, fiber: 4, fiberId: 291 })
    expect(f.measures.map((m) => [m.text, m.grams, m.ref])).toEqual([['1 cup', 240, 'fndds:9:10205'], ['Quantity not specified', 180, 'fndds:9:90000']])
    expect(externalId(f)).toBe('fndds:41302000')
  })
  it('negative carbs are clamped to 0 and flagged; missing fibre is 0 and flagged; 2033 fibre is flagged', () => {
    const neg = valuesOf(food({ dataset: 'foundation', fdcId: 1, description: 'x', nutrients: { energy: 20, energyId: 2048, protein: 1, fat: 1, carbs: -0.4, fiber: null, fiberId: null } }))
    expect(neg.per100).toEqual({ calories: 20, protein_g: 1, carbs_g: 0, fat_g: 1, fiber_g: 0 })
    expect(neg.flags).toEqual(['clamp:carbs', 'fibre:missing'])
    expect(valuesOf(food({ dataset: 'foundation', fdcId: 2, description: 'y', nutrients: { energy: 20, energyId: 1008, protein: 1, fat: 1, carbs: 3, fiber: 1.5, fiberId: 2033 } })).flags).toEqual(['fibre:2033'])
    expect(valuesOf(food({ dataset: 'sr', fdcId: 3, description: 'z', nutrients: { energy: null, energyId: null, protein: 1, fat: 1, carbs: 3, fiber: 0, fiberId: 1079 } })))
      .toMatchObject({ per100: null, missing: ['energy'] })
  })
  it('status_reason records the dataset, release and energy id', () => {
    const f = food({ dataset: 'foundation', fdcId: 5, description: 'x', nutrients: { energy: 50, energyId: 2048, protein: 1, fat: 1, carbs: 10, fiber: 2, fiberId: 1079 } })
    expect(statusReason(f, '2026-10-29', ['clamp:carbs'])).toBe('rules_v1 import:055 foundation:2026-10-29 energy:2048 clamp:carbs')
    expect(statusReason(f, '2026-10-29', [])).toMatch(new RegExp(`^${STATUS_REASON_PREFIX}`))
  })
})

describe('subset rules (spec (f) "Subset")', () => {
  const bulk: Bulk = {
    foundation: [
      food({ dataset: 'foundation', fdcId: 100, code: '9003', description: 'Apples, fuji, raw' }),
      food({ dataset: 'foundation', fdcId: 101, code: '9999', description: 'No energy', nutrients: { energy: null, energyId: null, protein: 1, fat: 1, carbs: 1, fiber: 0, fiberId: 1079 } }),
    ],
    sr: [
      food({ dataset: 'sr', fdcId: 200, code: '9003', description: 'Apples, raw, with skin', category: 'Fruits and Fruit Juices' }),
      food({ dataset: 'sr', fdcId: 201, code: '3001', description: 'Babyfood, apples', category: 'Baby Foods' }),
      food({ dataset: 'sr', fdcId: 202, code: '1', description: "KELLOGG'S, Corn Flakes", category: 'Breakfast Cereals' }),
      food({ dataset: 'sr', fdcId: 203, code: '2', description: 'Burger, plain', category: 'Fast Foods' }),
      food({ dataset: 'sr', fdcId: 204, code: '3', description: 'Acorn stew (Apache)', category: 'American Indian/Alaska Native Foods' }),
      food({ dataset: 'sr', fdcId: 205, code: '4', description: 'Bananas, raw', category: 'Fruits and Fruit Juices' }),
    ],
    fndds: [
      food({ dataset: 'fndds', fdcId: 300, description: 'Formula, ready-to-feed', category: 'Formula, ready-to-feed' }),
      food({ dataset: 'fndds', fdcId: 301, description: 'Banana, raw', category: 'Bananas' }),
    ],
    srNdb: new Map([['9003', 200], ['3001', 201], ['1', 202], ['2', 203], ['3', 204], ['4', 205]]),
  }
  it('drops no-energy Foundation, baby / AI-AN / brand / chain SR rows, SR rows a Foundation food replaced, and FNDDS baby + formula', () => {
    const s = selectSubset(bulk)
    expect(s.kept.map((f) => f.fdcId)).toEqual([100, 205, 301])
    expect(Object.fromEntries(s.excluded.map((e) => [e.food.fdcId, e.reason]))).toEqual({
      101: 'Foundation food with no energy value',
      200: 'SR row replaced by a Foundation food with the same NDB number',
      201: 'baby food',
      202: 'fast food, restaurant or brand row',
      203: 'fast food, restaurant or brand row',
      204: 'American Indian / Alaska Native food',
      300: 'baby food, infant formula or human milk',
    })
  })
  it('the SR brand rule is the prototype\'s: an all-caps word run then a comma', () => {
    expect(SR_BRAND_RE.test("KELLOGG'S, Corn Flakes")).toBe(true)
    expect(SR_BRAND_RE.test('MCDONALD\'S, Big Mac')).toBe(true)
    expect(SR_BRAND_RE.test('Apples, raw')).toBe(false)
    expect(SR_BRAND_RE.test('USDA Commodity, beef')).toBe(false)
  })
})

describe('validation and dedupe', () => {
  it('any rules v1 issue excludes a row (a 902 kcal fat, a cocktail whose kcal disagrees with its macros)', () => {
    const { valid, invalid } = validateFoods([
      food({ dataset: 'sr', fdcId: 1, description: 'Oil, ghee', nutrients: { energy: 902, energyId: 1008, protein: 0, fat: 100, carbs: 0, fiber: 0, fiberId: 1079 } }),
      food({ dataset: 'sr', fdcId: 2, description: 'Rice, white, cooked', nutrients: { energy: 130, energyId: 1008, protein: 2.7, fat: 0.3, carbs: 28, fiber: 0.4, fiberId: 1079 } }),
    ])
    expect(valid.map((x) => x.food.fdcId)).toEqual([2])
    expect(invalid.map((x) => [x.food.fdcId, x.issues])).toEqual([[1, ['energy_out_of_range']]])
  })
  it('a live verified fdc_id skips the food row; one description keeps Foundation > SR > FNDDS, then the lower fdc_id', () => {
    const rows = [
      food({ dataset: 'fndds', fdcId: 30, description: 'Beets, raw' }),
      food({ dataset: 'sr', fdcId: 20, description: 'Beets, raw' }),
      food({ dataset: 'foundation', fdcId: 10, description: 'Beets, raw' }),
      food({ dataset: 'sr', fdcId: 21, description: 'Pancakes, dry mix' }),
      food({ dataset: 'sr', fdcId: 22, description: 'Pancakes dry mix' }),
      food({ dataset: 'sr', fdcId: 40, description: 'Bagels, plain' }),
    ].map((f) => ({ food: f }))
    const d = dedupeFoods(rows, new Set([40]))
    expect(d.skippedVerified.map((f) => f.fdcId)).toEqual([40])
    expect(d.winners.map((w) => [w.food.fdcId, w.losers.map((l) => l.fdcId)])).toEqual([[10, [20, 30]], [21, [22]]])
    expect(d.duplicates.map((x) => [x.food.fdcId, x.winner.fdcId])).toEqual([[20, 10], [30, 10], [22, 21]])
  })
})

describe('ids', () => {
  it('UUIDv5 of "<dataset>:<NDB or food code>": stable, and different per dataset', () => {
    expect(NS_STEADY_USDA).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    // the SR raw apple 057 keys; pinned so a namespace change cannot slip through
    expect(foodId({ dataset: 'sr', code: '9003' })).toBe('0ae1310c-0f9c-50c7-9695-965cdeee4dfa')
    expect(foodId({ dataset: 'sr', code: '9003' })).toBe(foodId({ dataset: 'sr', code: '9003' }))
    expect(foodId({ dataset: 'foundation', code: '9003' })).not.toBe(foodId({ dataset: 'sr', code: '9003' }))
    expect(externalId({ dataset: 'sr', code: '9003' })).toBe('ndb:9003')
  })
})

describe('USDA measures through the shared classifyMeasure (056)', () => {
  it('FNDDS "Quantity not specified" is the default serving; weights, RACC and jars are not household measures', () => {
    expect(classifyMeasure('Quantity not specified', 200)).toMatchObject({ unit: 'serving', size: 'M', grams: 200, isDefault: true })
    expect(classifyMeasure('Quantity not specified', 0)).toBeNull()
    expect(classifyMeasure('1 RACC', 30)).toBeNull()
    expect(classifyMeasure('1 oz', 28.35)).toBeNull()
    expect(classifyMeasure('1 jar', 113)).toBeNull()
    expect(classifyMeasure('1 medium (3" dia)', 182)).toMatchObject({ unit: 'piece', size: 'M', grams: 182 })
    expect(classifyMeasure('2 tablespoon', 33.9)).toMatchObject({ unit: 'tbsp', grams: 16.95, ml: 15 })
  })
})

// ── With the pinned bulk files present (npx tsx scripts/import-usda.ts fetch) ──
const pins = loadPins()
const haveCache = Object.values(pins).every((p) => existsSync(join(CACHE, p.file)))
;(haveCache ? describe : describe.skip)('the real bulk files (pinned)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { renderAll } = require('../../scripts/usda/emit')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { buildPlan, loadBulk } = require('../../scripts/usda/lib')
  let files: Record<string, string>
  // deno-lint-ignore no-explicit-any
  let plan: any
  beforeAll(() => {
    const bulk = loadBulk()
    plan = buildPlan(bulk)
    files = renderAll(bulk)
  }, 120_000)

  it('the subset is 12,290 foods: Foundation 374, SR 6,636, FNDDS 5,280 (spec (f))', () => {
    const by = (d: string) => plan.subset.kept.filter((f: UsdaFood) => f.dataset === d).length
    expect([by('foundation'), by('sr'), by('fndds'), plan.subset.kept.length]).toEqual([374, 6636, 5280, 12290])
  })
  it('every inserted row passed rules v1, has no key, and a unique id, fdc_id and external_id', () => {
    const ids = new Set(plan.foods.map((f: { id: string }) => f.id))
    expect(ids.size).toBe(plan.foods.length)
    expect(new Set(plan.foods.map((f: { fdc_id: number }) => f.fdc_id)).size).toBe(plan.foods.length)
    expect(new Set(plan.foods.map((f: { external_id: string }) => f.external_id)).size).toBe(plan.foods.length)
  })
  it('the 9 fats at 902 kcal are excluded, not admitted by changing the rules (founder j11)', () => {
    expect(plan.invalid.filter((x: { issues: string[] }) => x.issues.includes('energy_out_of_range')).length).toBe(9)
  })
  it('regenerating gives every generated file byte for byte (= import-usda.ts --check)', () => {
    for (const [rel, text] of Object.entries(files)) {
      expect({ rel, same: readFileSync(join(REPO, rel), 'utf8') === text }).toEqual({ rel, same: true })
    }
  })
  it('the manifest the migrations assert is the one the generator computes', () => {
    const man = JSON.parse(files['scripts/usda/manifest.json'])
    expect(man.foods.total).toBe(plan.foods.length)
    expect(man.portions.total).toBe(plan.portions.length)
    expect(files['supabase/pending/055_usda_local_foods.sql']).toContain(`IF v_n <> ${plan.foods.length} THEN`)
    expect(files['supabase/pending/056_usda_local_portions.sql']).toContain(`'${plan.portions.length}'`.slice(1, -1))
  })
  it('no 056 portion slot repeats one 054 keys (fold-in), and at most one default serving per fdc_id', () => {
    const slots = new Set<string>()
    const defaults = new Set<number>()
    for (const p of plan.portions) {
      const k = `${p.fdc_id}|${p.unit}|${p.size}`
      expect(slots.has(k)).toBe(false)
      slots.add(k)
      if (p.is_default) { expect(defaults.has(p.fdc_id)).toBe(false); defaults.add(p.fdc_id) }
    }
    expect(plan.portionReport.covered_by_054).toBeGreaterThan(0)
  })
  it('057\'s target is the imported SR raw apple with skin (NDB 09003), 52 kcal, medium 182 g', () => {
    const apple = plan.foods.find((f: { id: string }) => f.id === '0ae1310c-0f9c-50c7-9695-965cdeee4dfa')
    expect(apple).toMatchObject({ dataset: 'sr', fdc_id: 171688, external_id: 'ndb:9003', calories: 52, protein: 0.26, carbs: 13.81, fat: 0.17, fiber: 2.4 })
    expect(plan.portions.find((p: { fdc_id: number; unit: string; size: string }) => p.fdc_id === 171688 && p.unit === 'piece' && p.size === 'M').grams).toBe(182)
    const m057 = readFileSync(join(REPO, 'supabase/pending/057_apple_identity.sql'), 'utf8')
    expect(m057).toContain("52::numeric, 0.26::numeric, 13.81::numeric, 0.17::numeric, 2.4::numeric")
  })
})
