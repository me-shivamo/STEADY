import { readFileSync } from 'fs'
import { join } from 'path'

import {
  candidateTier, cuisinePreference, demotesUsdaMeasures, foodCuisine, orderCandidates, phraseCuisine, regionCuisine,
  rowCuisine, type CandidateRank, type Cuisine, type VocabEntry,
} from '../../supabase/functions/_shared/cuisine'
import { CUISINE_VOCAB, CUISINE_VOCAB_DRAFT_ROWS } from '../../supabase/functions/_shared/cuisineVocab'
import { normText } from '../../supabase/functions/_shared/portionText'
import { parseCsv } from '../../scripts/portions/lib'
import { DATA, generate, keyLists, loadVocab, REPO, SNAPSHOT } from '../../scripts/cuisine/lib'

// v1.2 follow-up WP6, pure parts (plan .claude/plans/v1.2-followup-build-plan.md WP6 + review #16 / #26,
// Q13, Q15): phrase and row classification, preference, candidate order with the hard 055 drop, the
// cuisine-aware USDA-measure rule, the generated files, and the DRAFT data's integrity.

const cuisineOf = (p: string) => phraseCuisine(p).cuisine

describe('phraseCuisine: Indian, Western and neutral phrases', () => {
  const cases: Array<[string, Cuisine]> = [
    // Indian dishes and drinks (founder m2: INDB / IFCT names and aliases)
    ['dosa', 'in'], ['masala dosa', 'in'], ['idli', 'in'], ['sambhar', 'in'], ['sambar', 'in'], ['medu vada', 'in'],
    ['paneer', 'in'], ['paneer tikka', 'in'], ['palak paneer', 'in'], ['dal makhani', 'in'], ['dal', 'in'], ['chole', 'in'],
    ['rajma chawal', 'in'], ['aloo ki sabzi', 'in'], ['bhindi sabji', 'in'], ['poha', 'in'], ['upma', 'in'],
    ['chicken biryani', 'in'], ['butter chicken', 'in'], ['egg curry', 'in'], ['chicken 65', 'in'], ['samosa', 'in'],
    ['chai', 'in'], ['masala chai', 'in'], ['filter coffee', 'in'], ['lassi', 'in'], ['mango lassi', 'in'],
    ['ghee', 'in'], ['dahi', 'in'], ['chawal', 'in'], ['roti', 'in'], ['phulka', 'in'], ['aloo paratha', 'in'],
    ['gulab jamun', 'in'], ['maggi noodles', 'in'], ['maggie noodles', 'in'],
    // pizza, burger, fries: USDA first
    ['pizza', 'west'], ['cheese pizza', 'west'], ['veg burger', 'west'], ['big mac', 'west'], ['french fries', 'west'],
    ['chicken nuggets', 'west'], ['pasta', 'west'], ['mac and cheese', 'west'], ['bagel', 'west'], ['pancakes', 'west'],
    ['caesar salad', 'west'], ['chili', 'west'], ['garlic bread', 'west'], ['cheesecake', 'west'], ['fish and chips', 'west'],
    // the region decides (founder m2 examples first)
    ['milk', 'neutral'], ['rice', 'neutral'], ['egg', 'neutral'], ['banana', 'neutral'], ['eggs', 'neutral'],
    ['boiled egg', 'neutral'], ['curd', 'neutral'], ['yogurt', 'neutral'], ['tea', 'neutral'], ['black tea', 'neutral'],
    ['green tea', 'neutral'], ['coffee', 'neutral'], ['cappuccino', 'neutral'], ['apple', 'neutral'], ['bread', 'neutral'],
    ['butter', 'neutral'], ['sugar', 'neutral'], ['water', 'neutral'], ['chicken', 'neutral'], ['cottage cheese', 'neutral'],
    ['omelette', 'neutral'], ['fried rice', 'neutral'], ['sandwich bread', 'neutral'], ['tomato chili sauce', 'neutral'],
    ['quinoa', 'neutral'],
  ]
  it.each(cases)('%s -> %s', (p, c) => expect(cuisineOf(p)).toBe(c))

  it('ignores case and punctuation exactly as the keys do (normText)', () => {
    expect(phraseCuisine('Masala-Dosa!')).toEqual(phraseCuisine('masala dosa'))
    expect(phraseCuisine('Cottage cheese (paneer) cubes').cuisine).toBe('in')
  })

  it('empty, null and unknown text is neutral with nothing matched', () => {
    for (const t of ['', '   ', null, undefined, '!!!', 'zzqx']) expect(phraseCuisine(t)).toEqual({ cuisine: 'neutral', word: null, via: 'none' })
  })
})

describe('phraseCuisine: head noun, cut words and modifiers', () => {
  it('a Western head noun wins over an Indian filling word ("paneer pizza" is a pizza)', () => {
    expect(phraseCuisine('paneer pizza')).toEqual({ cuisine: 'west', word: 'pizza', via: 'head' })
    expect(cuisineOf('masala pasta')).toBe('west')
    expect(cuisineOf('paneer sandwich')).toBe('west')
  })
  it('an Indian head noun wins over a Western word before it', () => {
    expect(cuisineOf('pizza paratha')).toBe('in')
  })
  it('the longer phrase ending at the same place wins ("butter chicken" is not chicken; "thai green curry" is not curry)', () => {
    expect(phraseCuisine('butter chicken').word).toBe('butter chicken')
    expect(phraseCuisine('thai green curry')).toEqual({ cuisine: 'neutral', word: 'green curry', via: 'neutral_food' })
    expect(phraseCuisine('dosa crepe').word).toBe('dosa crepe')
  })
  it('a neutral head is tipped by the other listed words ("masala rice", "masala oats", "amul butter", "toned milk")', () => {
    expect(phraseCuisine('masala rice')).toEqual({ cuisine: 'in', word: 'masala', via: 'modifier' })
    expect(phraseCuisine('jeera rice')).toEqual({ cuisine: 'in', word: 'jeera rice', via: 'head' })   // a listed dish
    expect(cuisineOf('masala oats')).toBe('in')
    expect(cuisineOf('amul butter')).toBe('in')
    expect(cuisineOf('toned milk')).toBe('in')
    expect(cuisineOf('kele milkshake')).toBe('in')
    expect(cuisineOf('bbq chicken')).toBe('west')
  })
  it('modifiers that disagree leave a neutral head neutral (the region decides)', () => {
    expect(phraseCuisine('bbq masala chicken')).toEqual({ cuisine: 'neutral', word: 'chicken', via: 'mixed' })
  })
  it('cuts at the first cut word ("dosa with chutney" is a dosa, "rice with dal" is rice)', () => {
    expect(phraseCuisine('dosa with chutney').word).toBe('dosa')
    expect(cuisineOf('pizza with paneer topping')).toBe('west')
    expect(cuisineOf('rice with dal')).toBe('neutral')
    expect(cuisineOf('paneer in butter sauce')).toBe('in')
    expect(cuisineOf('ghee on parathas')).toBe('in')
  })
  it('keeps a dish name joined by "and" when its head ends the phrase', () => {
    expect(phraseCuisine('mac and cheese').word).toBe('mac and cheese')
    expect(cuisineOf('rice and dal')).toBe('in')
    expect(cuisineOf('bread and butter')).toBe('neutral')
  })
  it('a Hindi grammar word tips a phrase but is never its head', () => {
    expect(phraseCuisine('aloo ki sabzi').word).toBe('sabzi')
    // "ka" is rightmost but a marker: the head is milk (neutral), tipped Indian by the marker
    expect(phraseCuisine('doodh ka')).toEqual({ cuisine: 'in', word: 'doodh', via: 'head' })
    expect(phraseCuisine('milk ka')).toEqual({ cuisine: 'in', word: 'ka', via: 'modifier' })
  })
  it('is deterministic and independent of the vocabulary order', () => {
    const reversed: VocabEntry[] = [...CUISINE_VOCAB].reverse()
    for (const p of ['paneer pizza', 'thai green curry', 'jeera rice', 'mac and cheese', 'masala chai', 'bbq masala chicken']) {
      expect(phraseCuisine(p, reversed)).toEqual(phraseCuisine(p))
      expect(phraseCuisine(p)).toEqual(phraseCuisine(p))
    }
  })
  it('takes the vocabulary as a parameter (a custom list is honoured)', () => {
    const v: VocabEntry[] = [['foo', 'in'], ['bar', 'west'], ['baz', 'neutral']]
    expect(cuisineOf('foo')).toBe('neutral')
    expect(phraseCuisine('foo', v).cuisine).toBe('in')
    expect(phraseCuisine('foo bar', v).cuisine).toBe('west')
    expect(phraseCuisine('foo baz', v)).toEqual({ cuisine: 'in', word: 'foo', via: 'modifier' })
  })
})

describe('rowCuisine', () => {
  it('a food_item_cuisine tag always wins, including an explicit neutral (the 053 rice copies)', () => {
    expect(rowCuisine({ tag: 'neutral', source: 'usda', recipeRef: 'USDA:168930', key: 'chawal' })).toEqual({ cuisine: 'neutral', basis: 'tag', word: null })
    expect(rowCuisine({ tag: 'west', source: 'indb', key: 'chicken lasagne' }).cuisine).toBe('west')
    // untagged, the same rice copy reads Indian from its key: the plan's explicit tag is needed
    expect(rowCuisine({ source: 'usda', recipeRef: 'USDA:168930', key: 'chawal' })).toEqual({ cuisine: 'in', basis: 'key', word: 'chawal' })
    expect(rowCuisine({ source: 'usda', recipeRef: 'USDA:168930', key: 'cooked white rice' }).cuisine).toBe('neutral')
  })
  it('INDB and IFCT rows are Indian by source (plan backfill), whatever their name', () => {
    expect(rowCuisine({ source: 'indb', key: 'chicken lasagne' })).toEqual({ cuisine: 'in', basis: 'source', word: null })
    expect(rowCuisine({ source: 'ifct', key: 'milk whole cow' }).cuisine).toBe('in')
    // the IFCT paneer copy that carries FNDDS 2705740 (0d4c5ed9)
    expect(rowCuisine({ source: 'ifct', key: 'cottage cheese paneer cubes' }).basis).toBe('source')
  })
  it('053/058 derivations by recipe_ref: INDB / IFCT / STEADY are Indian; USDA copies go by what they are', () => {
    expect(rowCuisine({ source: 'usda', recipeRef: 'STEADY:chai_standard_v1', key: 'tea' })).toEqual({ cuisine: 'in', basis: 'recipe_ref', word: null })
    expect(rowCuisine({ recipeRef: 'INDB:ASC096@fbdb62b' }).cuisine).toBe('in')
    expect(rowCuisine({ recipeRef: 'IFCT:L003' }).cuisine).toBe('in')
    // 058's generic cheese pizza is a copy of USDA SR 173292: Western
    expect(rowCuisine({ source: 'usda', recipeRef: 'USDA:SR:173292', key: 'pizza' })).toEqual({ cuisine: 'west', basis: 'key', word: 'pizza' })
  })
  it('USDA rows holding Indian keys are Indian; commodities stay neutral', () => {
    expect(rowCuisine({ source: 'usda', key: 'dosa' }).cuisine).toBe('in')
    expect(rowCuisine({ source: 'usda', key: 'palak paneer' }).cuisine).toBe('in')
    expect(rowCuisine({ source: 'usda', key: 'coffee' })).toEqual({ cuisine: 'neutral', basis: 'default', word: 'coffee' })
    expect(rowCuisine({ source: 'usda', key: 'big mac' }).cuisine).toBe('west')
  })
  it('a key-less row (055 import) is read by its name', () => {
    expect(rowCuisine({ source: 'usda', key: null, name: 'Biryani with chicken' })).toEqual({ cuisine: 'in', basis: 'name', word: 'biryani' })
    expect(rowCuisine({ source: 'usda', key: '', name: 'Pizza, cheese topping, regular crust' }).cuisine).toBe('west')
    expect(rowCuisine({ source: 'usda', name: 'Milk, whole, 3.25% milkfat, with added vitamin D' }).cuisine).toBe('neutral')
    // a keyed row is read by its key only: the 053 rice copy's name "Cooked white rice (chawal)" is not read
    expect(rowCuisine({ source: 'usda', key: 'cooked white rice', name: 'Cooked white rice (chawal)' }).cuisine).toBe('neutral')
  })
  it('USDA mixed-dish food groups are Western, after the vocabulary (FNDDS files curries there too)', () => {
    const meat = { dataset: 'fndds', code: '3002', description: 'Meat mixed dishes' }
    expect(rowCuisine({ source: 'usda', name: 'Beef stew', usdaCategory: meat })).toEqual({ cuisine: 'west', basis: 'usda_category', word: null })
    expect(rowCuisine({ source: 'usda', name: 'Chicken curry', usdaCategory: { dataset: 'fndds', code: 3004 } }).cuisine).toBe('in')
    expect(rowCuisine({ source: 'usda', name: 'Palak Paneer', usdaCategory: { dataset: 'fndds', code: '3104' } }).cuisine).toBe('in')
    expect(rowCuisine({ source: 'usda', name: 'Chicken pot pie, frozen', usdaCategory: { dataset: 'sr', description: 'Meals, Entrees, and Side Dishes' } }).cuisine).toBe('west')
    expect(rowCuisine({ source: 'usda', name: 'Milk, whole', usdaCategory: { dataset: 'fndds', code: '1002' } }).cuisine).toBe('neutral')
    expect(rowCuisine({ source: 'usda', name: 'Bread, white', usdaCategory: { dataset: 'sr', description: 'Baked Products' } }).cuisine).toBe('neutral')
    // the group rule is for USDA rows only
    expect(rowCuisine({ source: 'ai_estimated', name: 'Beef stew', usdaCategory: meat }).cuisine).toBe('neutral')
  })
})

describe('preference', () => {
  it('the phrase decides; a neutral phrase takes the region (IN -> Indian data, US -> USDA)', () => {
    expect(regionCuisine('IN')).toBe('in')
    expect(regionCuisine('US')).toBe('west')
    expect(cuisinePreference('in', 'US')).toBe('in')      // a US user's dosa is Indian (m2: "for every user")
    expect(cuisinePreference('west', 'IN')).toBe('west')  // an IN user's burger is USDA first
    expect(cuisinePreference('neutral', 'IN')).toBe('in')
    expect(cuisinePreference('neutral', 'US')).toBe('west')
  })
  it('foodCuisine: the row decides only for a neutral phrase', () => {
    expect(foodCuisine('neutral', 'in')).toBe('in')   // "tea" matched to the 053 chai row
    expect(foodCuisine('neutral', 'neutral')).toBe('neutral')
    expect(foodCuisine('in', 'neutral')).toBe('in')
    expect(foodCuisine('west', 'in')).toBe('west')
  })
})

describe('orderCandidates', () => {
  interface C { id: string; r: CandidateRank }
  const c = (id: string, cuisine: Cuisine, tier: CandidateRank['tier']): C => ({ id, r: { cuisine, tier } })
  const ids = (xs: C[]) => xs.map((x) => x.id)
  const order = (xs: C[], pref: 'in' | 'west') => orderCandidates(xs, pref, (x) => x.r)

  it('Indian preference: Indian rows first (recalc, indb, ifct, usda, local, api), then neutral, then Western', () => {
    const xs = [
      c('api', 'in', 'usda_api'), c('west', 'west', 'usda'), c('neutral', 'neutral', 'usda'), c('usdaIn', 'in', 'usda'),
      c('ifct', 'in', 'ifct'), c('indb', 'in', 'indb'), c('recalc', 'in', 'recalc'), c('ai', 'in', 'other'),
    ]
    expect(ids(order(xs, 'in').ordered)).toEqual(['recalc', 'indb', 'ifct', 'usdaIn', 'api', 'ai', 'neutral', 'west'])
  })
  it('Western preference: Western rows first with USDA first, then neutral, then Indian', () => {
    const xs = [c('indb', 'in', 'indb'), c('n', 'neutral', 'ifct'), c('wIndb', 'west', 'indb'), c('wApi', 'west', 'usda_api'),
      c('wLocal', 'west', 'usda_local'), c('w', 'west', 'usda')]
    const r = order(xs, 'west')
    expect(ids(r.ordered)).toEqual(['w', 'wLocal', 'wApi', 'wIndb', 'n', 'indb'])
    expect(r.dropped).toEqual([])
  })
  it('is stable: equal ranks keep their search order', () => {
    const xs = [c('a', 'in', 'indb'), c('b', 'in', 'indb'), c('c', 'in', 'indb'), c('d', 'neutral', 'usda'), c('e', 'neutral', 'usda')]
    expect(ids(order(xs, 'in').ordered)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(ids(order([...xs].reverse(), 'in').ordered)).toEqual(['c', 'b', 'a', 'e', 'd'])
  })
  it('hard rule: an Indian preference with an Indian-data candidate drops every local-USDA (055) candidate', () => {
    const xs = [c('local1', 'in', 'usda_local'), c('indb', 'in', 'indb'), c('local2', 'neutral', 'usda_local'), c('usda', 'neutral', 'usda')]
    const r = order(xs, 'in')
    expect(ids(r.ordered)).toEqual(['indb', 'usda'])
    expect(ids(r.dropped)).toEqual(['local1', 'local2'])
  })
  it('hard rule: no drop without Indian data (a USDA row on an Indian dish is not an Indian value), nor for a Western preference', () => {
    const onlyUsda = [c('usdaDosa', 'in', 'usda'), c('local', 'in', 'usda_local')]
    expect(order(onlyUsda, 'in').dropped).toEqual([])
    expect(ids(order(onlyUsda, 'in').ordered)).toEqual(['usdaDosa', 'local'])
    // an INDB row tagged Western is not an Indian value either
    expect(order([c('lasagne', 'west', 'indb'), c('local', 'in', 'usda_local')], 'in').dropped).toEqual([])
    expect(order([c('indb', 'in', 'indb'), c('local', 'west', 'usda_local')], 'west').dropped).toEqual([])
  })
  it('does not mutate its input and handles an empty list', () => {
    const xs = [c('b', 'neutral', 'usda'), c('a', 'in', 'indb')]
    const copy = [...xs]
    order(xs, 'in')
    expect(xs).toEqual(copy)
    expect(order([], 'in')).toEqual({ ordered: [], dropped: [] })
  })
  it('candidateTier maps a candidate to its tier', () => {
    expect(candidateTier({ source: 'usda', api: true })).toBe('usda_api')
    expect(candidateTier({ source: 'usda', local: true })).toBe('usda_local')
    expect(candidateTier({ source: 'indb', derived: true })).toBe('recalc')
    expect(candidateTier({ source: 'indb' })).toBe('indb')
    expect(candidateTier({ source: 'IFCT' })).toBe('ifct')
    expect(candidateTier({ source: 'usda' })).toBe('usda')
    expect(candidateTier({ source: 'ai_estimated' })).toBe('other')
    expect(candidateTier({})).toBe('other')
  })
})

describe('demotesUsdaMeasures (056 USDA measures vs founder / research rows; Q13)', () => {
  const d = (cuisine: Cuisine, region: 'IN' | 'US', sizeGiven: boolean, cafeDrink = false) => demotesUsdaMeasures({ cuisine, region, sizeGiven, cafeDrink })
  it('Indian food: always, any region, any size word (a US user\'s dosa gets the founder 60 g, not FNDDS 80 g)', () => {
    for (const region of ['IN', 'US'] as const) for (const s of [true, false]) for (const cafe of [true, false]) expect(d('in', region, s, cafe)).toBe(true)
  })
  it('Western food: never (USDA first)', () => {
    for (const region of ['IN', 'US'] as const) for (const s of [true, false]) expect(d('west', region, s)).toBe(false)
  })
  it('neutral food: IN demotes unless a size word was given for a cafe drink; US never', () => {
    expect(d('neutral', 'IN', false)).toBe(true)
    expect(d('neutral', 'IN', true)).toBe(true)           // "large glass of milk": Indian sizes still lead
    expect(d('neutral', 'IN', false, true)).toBe(true)    // "1 cappuccino": Indian cup (l3)
    expect(d('neutral', 'IN', true, true)).toBe(false)    // "large cappuccino": USDA cafe size (l3, Q13)
    expect(d('neutral', 'US', false)).toBe(false)
    expect(d('neutral', 'US', true, true)).toBe(false)
  })
})

describe('generated files', () => {
  it('cuisineVocab.ts, usda_key_cuisine.csv and usda_indian_keys.csv regenerate byte for byte (npx tsx scripts/cuisine/emit.ts --check)', () => {
    for (const [path, text] of generate()) expect({ path: path.slice(REPO.length + 1), same: readFileSync(path, 'utf8') === text }).toEqual({ path: path.slice(REPO.length + 1), same: true })
  })
  it('the compiled vocabulary is the CSVs, sorted, with every row still DRAFT until the founder signs off (Q15)', () => {
    const v = loadVocab()
    expect(CUISINE_VOCAB).toEqual(v.entries)
    expect(CUISINE_VOCAB_DRAFT_ROWS).toBe(v.rows.filter((r) => r.status === 'draft').length)
    const phrases = CUISINE_VOCAB.map((e) => e[0])
    expect(phrases).toEqual([...phrases].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)))
    expect(new Set(phrases).size).toBe(phrases.length)
  })
  it('the generated Indian list is exactly the snapshot rows whose key reads Indian', () => {
    const v = loadVocab()
    const snap = parseCsv(readFileSync(SNAPSHOT, 'utf8'))
    const listed = parseCsv(keyLists(v).indian)
    expect(listed.map((r) => `${r.normalized_name}|${r.food_item_id}`).sort())
      .toEqual(snap.filter((r) => cuisineOf(r.normalized_name) === 'in').map((r) => `${r.normalized_name}|${r.food_item_id}`).sort())
    expect(parseCsv(keyLists(v).all)).toHaveLength(snap.length)
  })
})

describe('the Indian keys held by rows that carry USDA data (review #16: by vocabulary, not by hand)', () => {
  const listed = parseCsv(readFileSync(join(DATA, 'usda_indian_keys.csv'), 'utf8'))
  const keys = new Set(listed.map((r) => r.normalized_name))
  it('covers the plan\'s backfill list and every key review #16 found missing from it', () => {
    const plan = ['dosa', 'samosa', 'sambhar', 'medu vada', 'palak paneer', 'paneer tikka', 'paneer parantha', 'dosa crepe']
    const review16 = ['buttermilk kadhi', 'buttermilk curry', 'kodo millet upma', 'medu vada urad dal fritter', 'paneer',
      'cottage cheese paneer cubes', 'lassi', 'dahi', 'chutney', 'ghee on parathas']
    for (const k of [...plan, ...review16]) expect({ k, listed: keys.has(k) }).toEqual({ k, listed: true })
  })
  it('names the plan\'s row ids for the keys it listed by hand', () => {
    const id = (k: string) => listed.find((r) => r.normalized_name === k)?.food_item_id.slice(0, 8)
    expect([id('dosa'), id('samosa'), id('sambhar'), id('medu vada'), id('palak paneer'), id('paneer tikka'), id('paneer parantha')])
      .toEqual(['98ec8567', '2b57d4e1', '211d91b8', '24a866dc', '1a343a80', '1807172a', '1e06517d'])
    expect(id('cottage cheese paneer cubes')).toBe('0d4c5ed9')
  })
  it('lists no Western or neutral key', () => {
    for (const k of ['pizza', 'paneer pizza', 'coffee', 'egg', 'cooked white rice', 'butter', 'buttermilk']) expect(keys.has(k)).toBe(false)
  })
})

describe('DRAFT data integrity (scripts/cuisine/data)', () => {
  const vocabRows = loadVocab().rows
  const indbNames = (JSON.parse(readFileSync(join(REPO, 'scripts', 'data', 'indb.json'), 'utf8')) as Array<{ name: string }>).map((x) => ` ${normText(x.name)} `)
  const liveKeys = parseCsv(readFileSync(join(REPO, 'scripts', 'usda', 'data', 'live_keys_snapshot.csv'), 'utf8')).map((r) => ` ${normText(r.phrase)} `)
  it('every "indb" / "live_key" evidence claim is true', () => {
    const bad: string[] = []
    for (const r of vocabRows) {
      if (r.basis.includes('indb') && !indbNames.some((n) => n.includes(` ${r.phrase} `))) bad.push(`${r.phrase}: indb`)
      if (r.basis.includes('live_key') && !liveKeys.some((k) => k.includes(` ${r.phrase} `))) bad.push(`${r.phrase}: live_key`)
    }
    expect(bad).toEqual([])
  })
  it('every listed phrase classifies as its own list says (no entry is shadowed out of existence)', () => {
    const bad = vocabRows.filter((r) => !r.marker && phraseCuisine(r.phrase).cuisine !== r.cuisine).map((r) => `${r.phrase}: ${r.cuisine}`)
    expect(bad).toEqual([])
  })

  const regionRows = parseCsv(readFileSync(join(DATA, 'region_keys.csv'), 'utf8'))
  const neutral = new Set(vocabRows.filter((r) => r.cuisine === 'neutral').map((r) => r.phrase))
  it('region keys: each phrase is a listed neutral food, with exactly one IN and one US row', () => {
    const byPhrase = new Map<string, string[]>()
    for (const r of regionRows) byPhrase.set(r.phrase, [...(byPhrase.get(r.phrase) ?? []), r.region])
    for (const [p, regions] of byPhrase) {
      expect({ p, neutral: neutral.has(p), classified: cuisineOf(p) }).toEqual({ p, neutral: true, classified: 'neutral' })
      expect({ p, regions: [...regions].sort() }).toEqual({ p, regions: ['IN', 'US'] })
    }
    // founder m2's examples and the task's list are all covered
    for (const p of ['milk', 'rice', 'egg', 'banana', 'curd', 'tea', 'coffee']) expect(byPhrase.has(p)).toBe(true)
  })
  it('region keys: actions, targets and status are well formed', () => {
    for (const r of regionRows) {
      expect(['region_row', 'keep_today', 'after_055', 'blocked']).toContain(r.action)
      expect(r.status).toBe('draft')
      expect(r.note.length).toBeGreaterThan(0)
      if (r.action === 'blocked') expect(r.target_food_item_id).toBe('')
      else expect(r.target_food_item_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
      if (r.action === 'region_row' || r.action === 'keep_today') expect(r.target_key).not.toBe('')
    }
  })
  it('region keys: targets agree with the snapshots and the pending 055 file', () => {
    const snap = new Map(parseCsv(readFileSync(SNAPSHOT, 'utf8')).map((r) => [r.normalized_name, r.food_item_id]))
    const p055 = readFileSync(join(REPO, 'supabase', 'pending', '055_usda_local_foods.sql'), 'utf8')
    const m052 = readFileSync(join(REPO, 'supabase', 'migrations', '052_food_search.sql'), 'utf8')
    for (const r of regionRows) {
      if (r.action === 'after_055') expect({ id: r.target_food_item_id, in055: p055.includes(`'${r.target_food_item_id}'::uuid`) }).toEqual({ id: r.target_food_item_id, in055: true })
      if (r.target_key && snap.has(r.target_key)) expect({ key: r.target_key, id: r.target_food_item_id }).toEqual({ key: r.target_key, id: snap.get(r.target_key) })
    }
    // the IFCT milk row is the one founder 052 decision 2 points 'milk' at
    expect(regionRows.find((r) => r.phrase === 'milk' && r.region === 'IN')?.target_food_item_id).toBe('3857270e-27e9-487c-bc51-bb97dea319c7')
    expect(m052).toContain("'3857270e-27e9-487c-bc51-bb97dea319c7'::uuid, 'milk whole cow'")
  })
})
