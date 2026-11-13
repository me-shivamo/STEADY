"""Renderers for migration 053: the SQL migration, its rollback, the founder review report, out/derivations.json
and the expected-ids block of scripts/eval/search-check.sql. Pure functions of the plan built by recalc.py, so
`recalc.py check` can regenerate them byte for byte.

Every number the SQL writes is a literal produced here; the database never recomputes a value. That makes the
migration file itself the reviewable record of the change (and lets `check` prove it is what the inputs give).
"""
import json
import math
import re
from decimal import Decimal

MIG = '053'


# ── literals ──────────────────────────────────────────────────────────────────────────────────────
def q(s):
    return 'NULL' if s is None else "'" + str(s).replace("'", "''") + "'"


def jq(obj):
    return 'NULL' if obj is None else q(json.dumps(obj, sort_keys=True, ensure_ascii=False, default=str)) + '::jsonb'


def n(x):
    return 'NULL' if x is None else str(x)


def u(x):
    return 'NULL' if x is None else f"'{x}'::uuid"


def values_block(items):
    """VALUES rows with a trailing comment each; the comma/semicolon goes BEFORE the comment."""
    out = []
    for k, (row, comment) in enumerate(items):
        sep = ';' if k == len(items) - 1 else ','
        out.append(f"{row}{sep}" + (f"   -- {comment}" if comment else ''))
    return '\n'.join(out)


def j_vals(v):
    return {k: (float(v[k]) if v.get(k) is not None else None) for k in ('kcal', 'protein', 'carbs', 'fat', 'fiber')}


# ── rules v1, Python twin (validate.ts foodItemIssues / SQL food_item_issues) ─────────────────────────
ALCOHOL = (r'wine|beer|whiske?y|vodka|rum|gin|brandy|liqueur|cocktail|sake|alcohol|cider|tequila|champagne|lager|ale|'
           r'toddy|feni|scotch|bourbon|peg|daru|old monk|mojito|margarita|martini|sangria|breezer|arrack|liquor|spirits?')
FATWORDS = (r'oils?|ghee|butter|lard|vanaspati|dalda|makhan|makkhan|margarine|shortening|mayonnaise|mayo|dressing|aioli|'
            r'baghar|tadka|tarka|tartare|thousand island')
ZEROWORDS = (r'water|pani|paani|tea|coffee|salt|soda|diet|zero|sugar.?free|vitamins?|multivitamin|tablets?|capsules?|'
             r'creatine|ors|electrolytes?|sweetener|stevia|supplement')


def _w(alts):
    return re.compile(r'(?<![^\W_])(?:' + alts + r')(?![^\W_])', re.I)


ALC_RE, FAT_RE, ZERO_RE = _w(ALCOHOL), _w(FATWORDS), _w(ZEROWORDS)


def food_item_issues_py(source, name, v):
    """Codes in validate.ts ISSUE_ORDER. The jest test runs the real validate.ts on the same rows; this twin
    only lets `validate` fail fast offline."""
    k = float(v['kcal'])
    p, c, f, fb = (float(v[x] or 0) for x in ('protein', 'carbs', 'fat', 'fiber'))
    nm, out = name or '', []
    if k < 0 or k > 900:
        out.append('energy_out_of_range')
    if min(p, c, f, fb) < 0 or max(p, c, f, fb) > 100:
        out.append('macro_out_of_range')
    if p + c + f > 100.5:
        out.append('macro_sum_over_100')
    base = 4 * p + 9 * f
    lo, hi, tol = base + 4 * max(c - fb, 0), base + 4 * c + 4 * fb + (315 if ALC_RE.search(nm) else 0), 0.2 * k + 20
    if k < lo - tol or k > hi + tol:
        out.append('atwater_mismatch')
    if source == 'indb' and f >= 30 and k > 0 and 9 * f >= 0.85 * k and p + c < 20 and not FAT_RE.search(nm):
        out.append('fat_dominant_dish')
    if k == 0 and not ZERO_RE.search(nm):
        out.append('zero_energy')
    if (k, p, c, f) == (200, 8, 25, 8):
        out.append('generic_placeholder')
    return out


HISTORY = r'(?:public\.)?(?:food_entries|saved_entries|daily_summaries|meal_logs)\b'
_WRITE_RE = re.compile(r'\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?|ALTER\s+TABLE|DROP\s+TABLE'
                       r'(?:\s+IF\s+EXISTS)?|COPY)\s+' + HISTORY, re.I)


def history_writes(sql):
    """Statements that would write a history table (the migration may only LOCK and SELECT them)."""
    body = '\n'.join(l.split('--', 1)[0] for l in sql.splitlines())   # comments may name the tables
    return sorted(set(m.group(0) for m in _WRITE_RE.finditer(body)))


# ── shared fragments ───────────────────────────────────────────────────────────────────────────────
LOCKS = """-- Lock order = account deletion's. DELETE FROM auth.users fires its RI triggers in name order: profiles_id_fkey
-- (cascade) before food_items_created_by_fkey (SET NULL), and the cascade's own child actions on meal_logs /
-- food_entries / daily_summaries / saved_entries / user_food_memory are queued to the end of the outer statement.
-- So a deletion locks profiles -> food_items -> the history tables -> user_food_memory (live pg_trigger, checked
-- 2026-11-13; 050's header says the same). food_items therefore comes FIRST here, before any other table and
-- before §1's foreign key to it: a deletion running at the same moment waits behind us or we wait behind it,
-- never both (the old history-first order deadlocked in a local reproduction). The history tables are locked
-- SHARE (reads go on, writes wait about a second) so the fingerprints below can only change if THIS transaction
-- wrote them; LOCK TABLE a, b, c takes them in that order, the same as the food_entries -> daily_summaries
-- trigger. food_aliases is on no other path, so it goes last."""

# Why a DO block: `supabase db push` sends the file as one extended-protocol batch. That batch is a single
# implicit transaction (all or nothing, held until the final Sync), but it is not a transaction *block*, and a
# top-level LOCK TABLE refuses to run outside one ("LOCK TABLE can only be used in transaction blocks",
# SQLSTATE 25P01: the first live push of 053 on 2026-11-13 stopped right here and changed nothing). Inside a
# function body Postgres skips that check, and the locks are still held until the implicit transaction ends,
# i.e. for the whole migration. psql -1 (the local harness) accepts both forms, which is why it did not catch it.
LOCK_SQL = """DO $locks$ BEGIN
  LOCK TABLE public.food_items       IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.food_entries, public.daily_summaries, public.saved_entries IN SHARE MODE;
  LOCK TABLE public.user_food_memory IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.food_aliases     IN SHARE ROW EXCLUSIVE MODE;
END $locks$;"""

FP = """CREATE TEMP TABLE {name} ON COMMIT DROP AS SELECT
  (SELECT count(*) || ':' || md5(coalesce(string_agg(concat_ws(':', id, food_item_id, quantity_g, calories, protein_g, carbs_g, fat_g, fiber_g), ',' ORDER BY id), ''))
     FROM public.food_entries) AS e,
  (SELECT count(*) || ':' || md5(coalesce(string_agg(concat_ws(':', id, total_calories, total_protein_g, total_carbs_g, total_fat_g), ',' ORDER BY id), ''))
     FROM public.daily_summaries) AS d,
  (SELECT count(*) || ':' || md5(coalesce(string_agg(id || entries::text, ',' ORDER BY id), ''))
     FROM public.saved_entries) AS s;"""

FP_NOW = """(SELECT count(*) || ':' || md5(coalesce(string_agg(concat_ws(':', id, food_item_id, quantity_g, calories, protein_g, carbs_g, fat_g, fiber_g), ',' ORDER BY id), '')) FROM public.food_entries),
    (SELECT count(*) || ':' || md5(coalesce(string_agg(concat_ws(':', id, total_calories, total_protein_g, total_carbs_g, total_fat_g), ',' ORDER BY id), '')) FROM public.daily_summaries),
    (SELECT count(*) || ':' || md5(coalesce(string_agg(id || entries::text, ',' ORDER BY id), '')) FROM public.saved_entries)"""

FACTS = ('source', 'name', 'external_id', 'created_by', 'calories_per_100g', 'protein_per_100g', 'carbs_per_100g',
         'fat_per_100g', 'fiber_per_100g', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'fdc_id', 'portions')


def facts(alias):
    return '(' + ', '.join(f'{alias}.{c}' for c in FACTS) + ')'


def probes(plan):
    """search_foods(q, 1) must return the generated row: the spec's list plus the founder-decision phrases."""
    by_key = {r['key']: r['id'] for r in plan['new_rows']}
    alias_t = {a['alias']: a['target'] for a in plan['aliases'] if a['kind'] != 'retire'}
    want = [('roti', by_key['roti'], 'exact'), ('chapati', by_key['chapati'], 'exact'),
            ('chapati roti', by_key['chapati roti'], 'exact'), ('wheat roti', by_key['wheat roti'], 'exact'),
            ('phulka', by_key['phulka'], 'exact'), ('roti chapati', alias_t['roti chapati'], 'alias'),
            ('chole', by_key['chole'], 'exact'), ('cooked white rice', by_key['cooked white rice'], 'exact'),
            ('rice', alias_t['rice'], 'alias'),
            ('dal', by_key['dal'], 'exact'), ('daal', by_key['daal'], 'exact'), ('dal tadka', by_key['dal tadka'], 'exact'),
            ('dal lentil curry', alias_t['dal lentil curry'], 'alias'), ('moong dal', by_key['moong dal'], 'exact'),
            ('chana dal', by_key['chana dal'], 'exact'), ('paratha', by_key['paratha'], 'exact'),
            ('aloo paratha', by_key['aloo paratha'], 'exact'), ('poori', by_key['poori'], 'exact'),
            ('bhatura', by_key['bhatura'], 'exact'), ('sev', by_key['sev omapodi karapusa'], 'trgm'),
            ('dhokla', by_key['dhokla'], 'exact'), ('cooked rice', by_key['cooked rice'], 'exact'),
            ('steamed white rice', by_key['steamed white rice'], 'exact'), ('rajma', alias_t['rajma'], 'alias'),
            ('tea', by_key['tea'], 'exact'), ('chai', alias_t['chai'], 'alias'),
            ('masala chai', alias_t['masala chai'], 'alias'), ('eggs', alias_t['eggs'], 'alias'),
            ('chawal', by_key['chawal'], 'exact')]
    return want


# fts mode (RESOLVER_SEARCH=fts, the live default) reads exact keys, then name search ordered by id, never aliases.
# Gated: the founder-decision keys (trivially exact) and 'chai', which has no key and must still be offered by
# name search. Reported only: the alias phrases and the keys quarantined with no replacement, so the push log
# shows what each of them meets in fts mode.
FTS_GATED_KEYS = ('roti', 'chapati', 'chapati roti', 'wheat roti', 'phulka', 'dal', 'daal', 'dal tadka', 'moong dal',
                  'chana dal', 'chole', 'paratha', 'aloo paratha', 'poori', 'bhatura', 'dhokla', 'cooked rice',
                  'cooked basmati rice', 'steamed white rice', 'boiled rice uble chawal', 'cooked white rice', 'chawal',
                  'tea')
FTS_REPORTED = ('rice', 'chawal rice', 'masala chai', 'milk tea', 'eggs', 'roti chapati', 'rajma', 'upma',
                'sabudana khichdi', 'dal lentil curry', 'vada pav', 'bajra roti', 'butter roti')


# ── the resolver's portion lookup, Python twin ───────────────────────────────────────────────────────
# macroResolver.ts correctPortionFromMeasures + UNIT_SYNONYMS + parseCount, as of 2026-11-13. It decides what a
# stored portion is worth on an exact / alias / memory hit (the matcher never runs there). The report states what
# every founder portion resolves to with it, and out/derivations.json carries the same table so the jest test
# (__tests__/unit/recalc053.test.ts) checks each line against the REAL function: if the resolver changes, that
# test fails and this twin (and the report) must be brought back in line.
UNIT_SYNONYMS = (
    (r'\b(bowls?|cups?|glass(es)?|mugs?)\b', r'\bcups?\b'),
    (r'\b(pieces?|slices?|items?|pcs?)\b', r'\b(pieces?|items?|slices?)\b'),
    (r'\b(tbsps?|tablespoons?)\b', r'\b(tbsps?|tablespoons?)\b'),
    (r'\b(tsps?|teaspoons?)\b', r'\b(tsps?|teaspoons?)\b'),
)


def _parse_count(desc):
    d = desc.lower().strip()
    if re.match(r'(half|1/2)\b', d):
        return 0.5
    if re.match(r'(quarter|1/4)\b', d):
        return 0.25
    m = re.match(r'(\d+(?:\.\d+)?)', d)
    if m:
        return float(m.group(1))
    if re.match(r'(a|an|one|some)\b', d):
        return 1.0
    return None


def correct_portion(quantity_description, portions):
    """Grams the resolver gives a hit for this quantity phrase, or None = the parser's own gram guess stands."""
    if not portions or not quantity_description:
        return None
    if re.search(r'\d\s*(g|gram|grams|kg|ml|l|litre|liter|oz|ounce|ounces)\b', quantity_description, re.I):
        return None
    count = _parse_count(quantity_description)
    if count is None:
        return None
    syn = next((s for s in UNIT_SYNONYMS if re.search(s[0], quantity_description, re.I)), None)
    if syn is None:
        return None
    portion = next((p for p in portions if re.search(syn[1], p['description'], re.I) and p['gramWeight'] > 0), None)
    if portion is None:
        return None
    amount = _parse_count(portion['description'])
    amount = 1.0 if amount is None else amount
    if amount <= 0:
        return None
    per_unit = portion['gramWeight'] / amount
    grams = math.floor(count * per_unit * 10 + 0.5) / 10                      # Math.round(x) = floor(x + 0.5)
    return grams if grams > 0 else None


# The quantity phrases users (and the parser) write for these foods; each founder family is resolved for all of them.
# The last four are a count followed by the food's own word, the way the parser usually writes breads ("2 rotis":
# live roti / chapati entries mostly carry that label, not "2 pieces"); the resolver reads no unit in them.
PORTION_PHRASES = ('1 katori', '1 bowl', '1 small bowl', '1 cup', '1 glass', '1 mug', '1 plate', '1 cutting',
                   '1 piece', '2 pieces', '2 roti', '2 rotis', '3 chapati', '2 phulka')
# One row per founder family, by key (every row of a family carries the same portions; validate checks that).
PORTION_FAMILIES = (('dal and legume curries', 'dal'), ('rice', 'cooked rice'), ('chai', 'tea'),
                    ('roti family', 'roti'), ('phulka', 'phulka'))


def portion_matching(plan):
    by_key = {r['key']: r for r in plan['new_rows']}
    out = []
    for fam, key in PORTION_FAMILIES:
        r = by_key[key]
        for ph in PORTION_PHRASES:
            out.append(dict(family=fam, key=key, phrase=ph, portions=r['portions'], grams=correct_portion(ph, r['portions'])))
    return out


def fts_probes(plan):
    by_key = {r['key']: r['id'] for r in plan['new_rows']}
    alias_t = {a['alias']: a['target'] for a in plan['aliases'] if a['kind'] != 'retire'}
    return [(k, by_key[k]) for k in FTS_GATED_KEYS] + [('chai', alias_t['chai'])]


FTS_SERVED = """coalesce(
      (SELECT ARRAY[fi.id] FROM public.food_items fi WHERE fi.normalized_name = {q} AND fi.status = 'verified'),
      (SELECT array_agg(x.id ORDER BY x.id) FROM (SELECT fi.id FROM public.food_items fi
         WHERE fi.status = 'verified' AND fi.calories_per_100g IS NOT NULL
           AND to_tsvector('english', fi.name) @@ websearch_to_tsquery('english', {q})
         ORDER BY fi.id LIMIT 3) x))"""


# ── migration ─────────────────────────────────────────────────────────────────────────────────────
def migration_sql(plan, params, sha):
    snap = plan['snapshot']
    der = plan['derivations']
    new = plan['new_rows']
    old = plan['old_rows']
    al = plan['aliases']
    pc = plan['portion_changes']
    rows = {r['id']: r for r in snap['rows']}
    sup = [o for o in old if o['kind'] == 'supersede']
    qo = [o for o in old if o['kind'] == 'quarantine_only']
    prod = params['production']
    L = []
    w = L.append
    dv = {d['variant_key']: d for d in der}
    by_key = {r['key']: r for r in new}
    k_roti, k_chai = dv['roti_plain']['values']['kcal'], dv['chai_standard']['values']['kcal']
    p = {k: fmt_port(by_key[k]['portions']) for k in ('roti', 'phulka', 'dal', 'cooked rice', 'tea')}
    retired = ', '.join(f"'{a['alias']}'" for a in al if a['kind'] == 'retire')
    w(f"-- 053_recalc_indian_v1.sql — GENERATED by scripts/recalc/recalc.py emit; inputs_sha256 {sha}; do not edit")
    w(f"""-- v1.2 "Recalculate Indian dishes" (recalc_v1). Spec: .claude/plans/v1.2-recalc-053-spec.md, whose §(h) founder
-- decisions (2026-11-12, addendum 2026-11-13) override its body. Review report: docs/reviews/053-recalc-indian-v1.md. Rollback:
-- supabase/rollback/053_recalc_indian_v1_down.sql. Snapshot these literals were checked against: {snap['taken_at']}.
--
-- WHY: INDB publishes each recipe at its RAW weight (no cooking yield) and counts the whole pan of frying oil as
--   eaten, so a puri was 738 kcal/100 g (lab: 396) and a dal 50-100 depending on how the book listed its water.
--   recalc_v1 rebuilds every INDB recipe from its lines (all 1,014 reproduce at 2 dp), drops the frying oil,
--   adds back the oil a food really absorbs (alpha = {prod['alpha']:.3f} g per g of dough dry matter) and brings the
--   dish to the moisture it is served at (per cooking type, fitted on half the lab dishes and tested on the
--   other half: median energy error 35% -> 19.8%, bias +45% -> +1.4%; Chiplonkar & Agte 2007, 38 dishes).
--
-- FOUNDER DECISIONS IN THIS FILE (spec §(h), 2026-11-12, and its 2026-11-13 addendum):
--   dal = mixed dal at medium thickness (84.3% water) for dal / daal / dal tadka; named dals keep their recipe.
--   chole / rajma = the same rule as dal; 'chole' is an exact key on a copy of the chickpea curry row (11-13).
--   Every dal and legume-curry row: {p['dal']}
--   (11-13; the old rows carried a 240 g US cup or nothing).
--   roti = plain phulka, no ghee, {k_roti} kcal/100 g, {p['roti']}, for roti / chapati / chapati roti /
--   wheat roti and the 'roti chapati' alias; 'phulka' = its own exact key on a copy row, {p['phulka']} (11-13).
--   rice = cooked white rice 130 (USDA FDC 168930) for cooked / basmati / steamed white / boiled rice, the exact
--   key 'chawal' and the 052 'rice' alias row 5f20d673 (superseded by a copy row: 053 changes no row in place),
--   all {p['cooked rice']} (11-13; was the US cup, 186 g).
--   tea = a new standard home chai per 120 ml cup (60 g whole milk + 60 g water + 8 g sugar = 128 g,
--   {k_chai} kcal/100 g; 11-13), {p['tea']};
--   key 'tea', aliases chai / masala chai / milk tea. Chicken: no default. Defaults accepted: recipe oil as
--   written, dhokla at confidence C, butter roti / bajra roti / vada pav quarantined with no replacement,
--   'eggs' -> egg. Named dals outside the shipped templates and the rice dal porridge wait for batch 2 (11-13).
--   Portions are matched by the resolver as it is today (UNIT_SYNONYMS): bowl / cup / glass / mug all read the
--   first "cup" portion; katori, plate and cutting are not units there yet (Phase 5), see the review report.
--
-- HOW (works the same with RESOLVER_SEARCH = fts, eval_only or ranked):
--   * Each existing exact key gets its OWN new row ("copy row") with the new numbers: the fts resolver reads only
--     exact keys, never aliases, so moving a key into an alias would have dropped "chapati" or "phulka" to
--     search. All copy rows of one derivation carry identical numbers; food_derivation_items says which.
--   * Old rows are QUARANTINED, never deleted or changed: food_entries keeps pointing at them and every logged
--     meal keeps its numbers (fingerprints below prove food_entries, daily_summaries and saved_entries are
--     untouched). Their key moves to parked_normalized_name; the new row takes it.
--   * Aliases and user_food_memory follow each old row to its own successor in the same transaction. An 052
--     alias whose words become a new exact key ({retired}) retires: the key serves, in every mode, the
--     numbers per 100 g the alias would have served after 053 (its row's successor), where the alias worked in
--     ranked mode only; each retire note records what the alias served before 053.
--   * fts mode is checked as the resolver runs it (§12 i): exact key, else the 3 lowest-id verified rows whose
--     name matches. Ids of copy rows are new, so that list can change; the check pins the phrases that must
--     still reach their row. Aliases (rice, rajma, masala chai, eggs...) serve in ranked mode only.
--   * source stays usda / indb / ifct (no constraint or Edge Function change). New rows: verified, ownerless,
--     status_reason 'reviewed:053:recalc_v1:<variant>', INDB-derived ones external_id '<code>@recalc_v1'.
--   * Provenance (lines, oil, yield, moisture basis, lab score) lives in food_derivations; every action is one
--     food_value_changes row (counts only for memory, never a user id).
--
-- RUNS ONCE: refuses if backup._backup_food_items_053 exists. The rollback renames those backups, so after R1 +
--   `migration repair --status reverted 053` the next push re-applies this file: it re-verifies its own
--   rolled-back rows (same UUIDv5 ids) when their facts are unchanged, and keeps the provenance tables and log.
-- REFUSES ON DRIFT: every touched row, copy source and alias is compared with the snapshot first (§3).
-- A MIGRATIONS-ONLY REPLAY (db reset, preview branch, CI) has none of these rows: it creates the tables and
--   changes nothing (same guard idea as 050 §10 / 052 §6).
-- LOCKS (§0, first statement after the guard): food_items SHARE ROW EXCLUSIVE, then food_entries, daily_summaries,
--   saved_entries SHARE, then user_food_memory and food_aliases SHARE ROW EXCLUSIVE: account deletion's order;
--   held to commit (well under a second at ~2.7k food rows). lock_timeout 5 s fails fast.
-- TRANSACTION: the CLI applies the file as one implicit transaction (no BEGIN/COMMIT here).
""")
    w("SELECT pg_catalog.set_config('lock_timeout', '5s', true);")
    w("""
DO $pre$
BEGIN
  IF pg_catalog.to_regclass('backup._backup_food_items_053') IS NOT NULL THEN
    RAISE EXCEPTION '053 runs once: backup._backup_food_items_053 exists (the 053 down script renames it; see its header)';
  END IF;
  IF pg_catalog.to_regclass('public.food_aliases') IS NULL
     OR pg_catalog.to_regprocedure('public.search_foods(text,integer)') IS NULL THEN
    RAISE EXCEPTION '053 requires 052 (food_aliases + search_foods)';
  END IF;
END
$pre$;
""")
    # locks first (see LOCKS), then §1 tables
    w("-- ── §0 Locks (before anything else, in account deletion's order) ─────────────────────────────────────")
    w(LOCKS)
    w(LOCK_SQL)
    w("""
-- ── §1 Provenance tables (IF NOT EXISTS: a re-apply after the down script keeps their history) ──────
CREATE TABLE IF NOT EXISTS public.food_derivations (
  id                  uuid PRIMARY KEY,                      -- UUIDv5(recalc_v1|variant)
  calc_version        text NOT NULL,
  variant_key         text NOT NULL,
  recipe_ref          text NOT NULL,                         -- 'INDB:ASC096@fbdb62b' | 'USDA:168930' | 'IFCT:L003' | 'STEADY:chai_standard_v1'
  method              text NOT NULL CHECK (method IN ('recipe_recalc', 'copy_reference')),
  cooking_class       text,
  moisture_rule       text CHECK (moisture_rule IN ('target', 'keep', 'components', 'asis')),
  moisture_target_pct numeric,
  moisture_basis      text,                                  -- 'class:legume_curry@recalc_v1' | 'lab:113' | 'keep:…' | 'copy:<id>'
  yield_factor        numeric,                               -- cooked weight / kept raw weight (EuroFIR)
  alpha               numeric,                               -- g oil absorbed per g dry matter (fried only)
  frying_oil_removed_g numeric,                              -- the pan of oil INDB counted as eaten
  kcal numeric NOT NULL, protein_g numeric NOT NULL, carbs_g numeric NOT NULL, fat_g numeric NOT NULL,
  fiber_g numeric NOT NULL, water_g numeric,
  fat_components      jsonb NOT NULL,                        -- {"ingredient","added","absorbed"} g per 100 g
  base_per_100g       jsonb,                                 -- the same dish with no added fat (a less/more-oil option later)
  energy_basis        text NOT NULL DEFAULT 'FNP77:4P+9F+4CHOavl+2FIB',
  confidence          char(1) NOT NULL CHECK (confidence IN ('A', 'B', 'C')),
  referee             jsonb,                                 -- lab dish, held-out and production errors
  lines               jsonb NOT NULL,                        -- every recipe line: grams, water, kept / frying oil / dropped
  inputs_sha256       text NOT NULL,
  review_note         text NOT NULL,
  approved_by         text NOT NULL,
  created_in          text NOT NULL DEFAULT '053',
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (calc_version, variant_key)
);
CREATE TABLE IF NOT EXISTS public.food_derivation_items (
  food_item_id  uuid PRIMARY KEY REFERENCES public.food_items(id) ON DELETE RESTRICT,
  derivation_id uuid NOT NULL REFERENCES public.food_derivations(id),
  is_canonical  boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX IF NOT EXISTS food_derivation_items_canonical_uidx
  ON public.food_derivation_items (derivation_id) WHERE is_canonical;      -- new aliases target this row
CREATE TABLE IF NOT EXISTS public.food_value_changes (
  id            bigserial PRIMARY KEY,
  migration     text NOT NULL,
  change_kind   text NOT NULL CHECK (change_kind IN ('insert_derived', 'supersede', 'quarantine_only', 'key_park',
                  'key_take', 'alias_repoint', 'alias_insert', 'alias_retire', 'memory_repoint', 'memory_drop',
                  'portion_change', 'rollback')),
  food_item_id  uuid, successor_id uuid, derivation_id uuid, key text, alias text, n_rows int,
  relation      text CHECK (relation IN ('same_food_revised', 'wrong_state_for_phrase', 'wrong_food_for_phrase', 'new_variant')),
  before        jsonb, after jsonb,
  reason        text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()                         -- never a user id in this table
);
COMMENT ON TABLE public.food_derivations IS
  'How a recalculated or copied food_items row got its numbers (053 recalc_v1 onward). One row per variant; '
  'food_derivation_items lists the food_items rows (one per exact key) that carry it. Written by reviewed migrations only.';
COMMENT ON TABLE public.food_derivation_items IS
  'food_items row -> the derivation its numbers come from. Copy rows of one derivation carry identical numbers.';
COMMENT ON TABLE public.food_value_changes IS
  'Append-only log of reviewed changes to reference food values (053+): one row per action, counts only for '
  'user_food_memory, never a user id. The 053 down script replays it in reverse and appends rollback rows.';
-- Privileges (048/049): the public default ACL gives anon/authenticated arwdDxtm on every new table and rwU on
-- every new sequence. These are server-side records: RLS on with no policies, nothing for the API roles, and
-- SELECT for service_role (scripts/audit).
ALTER TABLE public.food_derivations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_derivation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_value_changes    ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.food_derivations, public.food_derivation_items, public.food_value_changes
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.food_value_changes_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.food_derivations, public.food_derivation_items, public.food_value_changes TO service_role;
""")
    w("-- ── §2 History fingerprints and the plan (generated; the §0 locks are held) ─────────────────────────")
    w(FP.format(name='_fp053'))
    w("CREATE TEMP TABLE _state053 (go boolean NOT NULL, verified_before bigint) ON COMMIT DROP;")
    w("INSERT INTO _state053 VALUES (true, (SELECT count(*) FROM public.food_items WHERE status = 'verified'));")
    # plan
    w("""-- _plan053: every pre-053 row 053 quarantines, with what the snapshot says it holds (§3 compares) and its
-- successor (NULL = quarantine only). expect_memory = the snapshot's pointer count (checked for drops only).""")
    w("CREATE TEMP TABLE _plan053 (old_id uuid PRIMARY KEY, kind text NOT NULL, new_id uuid, relation text, "
      "expect_key text NOT NULL, expect_status text NOT NULL, expect_kcal numeric NOT NULL, expect_memory int NOT NULL, "
      "reason text NOT NULL, variant text NOT NULL) ON COMMIT DROP;")
    mem = {m['old_id']: m['n'] for m in plan['memory']}
    w("INSERT INTO _plan053 VALUES")
    w(values_block([(f"  ({u(o['old_id'])}, {q(o['kind'])}, {u(o['new_id'])}, {q(o['relation'])}, {q(o['expect_key'])}, "
                      f"{q(o['expect_status'])}, {o['expect_kcal']}, {mem.get(o['old_id'], 0)}, {q(o['reason'])}, {q(o['variant'])})",
                      rows[o['old_id']]['name'][:40]) for o in old]))
    w("""-- _new053: the rows 053 inserts. Numbers per 100 g, kcal = 4P + 9F + 4C + 2fib of the stored macros for every
-- recalculated row; copy rows carry their source row's numbers unchanged.""")
    w("CREATE TEMP TABLE _new053 (id uuid PRIMARY KEY, derivation_id uuid NOT NULL, variant text NOT NULL, name text NOT NULL, "
      "source text NOT NULL, external_id text, fdc_id bigint, key text NOT NULL UNIQUE, kcal numeric NOT NULL, "
      "protein numeric NOT NULL, carbs numeric NOT NULL, fat numeric NOT NULL, fiber numeric NOT NULL, portions jsonb, "
      "is_canonical boolean NOT NULL, predecessor uuid, status_reason text NOT NULL, key_reason text NOT NULL) ON COMMIT DROP;")
    w("INSERT INTO _new053 VALUES")
    w(',\n'.join(f"  ({u(r['id'])}, {u(r['derivation_id'])}, {q(r['variant'])}, {q(r['name'])}, {q(r['source'])}, "
                 f"{q(r['external_id'])}, {n(r['fdc_id'])}, {q(r['key'])}, {r['values']['kcal']}, {r['values']['protein']}, "
                 f"{r['values']['carbs']}, {r['values']['fat']}, {r['values']['fiber']}, {jq(r['portions'])}, "
                 f"{'true' if r['is_canonical'] else 'false'}, {u(r['predecessor'])}, {q(r['status_reason'])}, "
                 f"{q(r['key_reason'])})"
                 for r in new) + ';')
    w("""-- _ref053: rows 053 copies from or points a new alias at. They must still hold exactly what the snapshot says
-- (a copy of a row that moved would copy the wrong numbers). A copy source 053 also supersedes (5f20d673, the 052
-- 'rice' alias row: its copy rows carry the founder's new rice portions) is checked here before the change and,
-- after it, as an old row in §12 (b); the others must come out of 053 unchanged (§12 c).""")
    w("CREATE TEMP TABLE _ref053 (id uuid PRIMARY KEY, expect_key text NOT NULL, kcal numeric NOT NULL, protein numeric, "
      "carbs numeric, fat numeric, fiber numeric, portions jsonb) ON COMMIT DROP;")
    w("INSERT INTO _ref053 VALUES")
    w(values_block([(f"  ({u(i)}, {q(rows[i]['key'])}, {rows[i]['kcal']}, {rows[i]['protein']}, {rows[i]['carbs']}, "
                      f"{rows[i]['fat']}, {rows[i]['fiber']}, {jq(rows[i]['portions'])})", rows[i]['name'][:40])
                     for i in plan['refs']]))
    w("""-- _alias053: 'repoint' = an 052 alias that follows its target to that row's own successor (so "roti chapati"
-- still serves the row holding the key "chapati roti", 052's reordered-words rule), its note extended with what it
-- serves now; 'insert' = a new alias; 'retire' = an 052 alias whose words become an exact key on a copy row of the
-- very row it served (""" + retired + """): exact keys win, and the fts resolver reads keys only, never aliases.
-- new_target is the row that serves the phrase afterwards (for 'retire', the key row; logged, never written).""")
    w("CREATE TEMP TABLE _alias053 (alias text PRIMARY KEY, kind text NOT NULL, expect_target uuid, new_target uuid NOT NULL, "
      "note text NOT NULL) ON COMMIT DROP;")
    w("INSERT INTO _alias053 VALUES")
    w(',\n'.join(f"  ({q(a['alias'])}, {q(a['kind'])}, {u(a['expect'])}, {u(a['target'])}, {q(a['note'])})" for a in al) + ';')
    w("CREATE TEMP TABLE _portion053 (food_item_id uuid PRIMARY KEY, predecessor uuid, before jsonb, after jsonb, "
      "approved_by text NOT NULL) ON COMMIT DROP;")
    w("INSERT INTO _portion053 VALUES")
    w(',\n'.join(f"  ({u(p['food_item_id'])}, {u(p['predecessor'])}, {jq(p['before'])}, {jq(p['after'])}, {q(p['approved_by'])})"
                 for p in pc) + ';')

    # §3–§11 in one block
    w("""
-- ── §3–§11 Apply (one block, so a migrations-only replay can skip it as a whole) ───────────────────────
DO $apply$
DECLARE
  v_bad text; v_n bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.food_items fi JOIN _plan053 p ON p.old_id = fi.id)
     AND (SELECT count(*) FROM public.food_items WHERE status = 'verified') < 1500 THEN
    UPDATE _state053 SET go = false;
    RAISE NOTICE '053: no production food rows here (migrations-only replay): tables created, no row changed';
    RETURN;
  END IF;

  -- §3 compare-and-swap against data/snapshot.json: any drift aborts with the rows listed
  SELECT string_agg(left(p.old_id::text, 8) || ' ' || coalesce(fi.status, 'missing') || '/' ||
                    coalesce(coalesce(fi.normalized_name, fi.parked_normalized_name), '-') || '/' ||
                    coalesce(fi.calories_per_100g::text, '-'), '; ' ORDER BY p.old_id) INTO v_bad
    FROM _plan053 p LEFT JOIN public.food_items fi ON fi.id = p.old_id
   WHERE fi.id IS NULL OR fi.created_by IS NOT NULL
      OR coalesce(fi.normalized_name, fi.parked_normalized_name) IS DISTINCT FROM p.expect_key
      OR fi.status IS DISTINCT FROM p.expect_status OR fi.calories_per_100g IS DISTINCT FROM p.expect_kcal;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '053: rows changed since the snapshot (re-take data/snapshot.json and regenerate): %', v_bad;
  END IF;
  SELECT string_agg(left(r.id::text, 8), ', ' ORDER BY r.id) INTO v_bad
    FROM _ref053 r LEFT JOIN public.food_items fi ON fi.id = r.id
   WHERE fi.id IS NULL OR fi.status <> 'verified' OR fi.normalized_name IS DISTINCT FROM r.expect_key
      OR (fi.calories_per_100g, fi.protein_per_100g, fi.carbs_per_100g, fi.fat_per_100g, fi.fiber_per_100g)
         IS DISTINCT FROM (r.kcal, r.protein, r.carbs, r.fat, r.fiber)
      OR fi.portions IS DISTINCT FROM r.portions;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '053: copy sources / alias targets changed since the snapshot: %', v_bad;
  END IF;
  SELECT string_agg(a.alias || ' -> ' || coalesce(left(fa.food_item_id::text, 8), 'absent'), ', ' ORDER BY a.alias) INTO v_bad
    FROM _alias053 a LEFT JOIN public.food_aliases fa ON fa.alias = a.alias
   WHERE (a.kind IN ('repoint', 'retire') AND fa.food_item_id IS DISTINCT FROM a.expect_target)
      OR (a.kind = 'insert'  AND fa.alias IS NOT NULL);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '053: food_aliases changed since the snapshot: %', v_bad;
  END IF;
  SELECT string_agg(fi.normalized_name || ' held by ' || left(fi.id::text, 8), ', ') INTO v_bad
    FROM public.food_items fi JOIN _new053 nw ON fi.normalized_name = nw.key
   WHERE fi.id NOT IN (SELECT old_id FROM _plan053);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '053: a key 053 assigns is held by a row outside the plan: %', v_bad;
  END IF;
  -- A new id may already exist only as this migration's own rolled-back row with unchanged facts (re-apply).
  SELECT string_agg(left(fi.id::text, 8), ', ') INTO v_bad
    FROM public.food_items fi JOIN _new053 nw ON nw.id = fi.id
   WHERE fi.status <> 'quarantined' OR fi.status_reason IS DISTINCT FROM 'reviewed:rollback_053'
      OR (fi.source, fi.name, fi.external_id, fi.fdc_id, fi.calories_per_100g, fi.protein_per_100g, fi.carbs_per_100g,
          fi.fat_per_100g, fi.fiber_per_100g, fi.portions, fi.created_by)
         IS DISTINCT FROM (nw.source, nw.name, nw.external_id, nw.fdc_id, nw.kcal, nw.protein, nw.carbs, nw.fat,
                           nw.fiber, nw.portions, NULL::uuid);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '053: generated ids already exist with other facts (bump calc_version for new numbers): %', v_bad;
  END IF;
  SELECT string_agg(left(p.old_id::text, 8) || ' has ' || c.n || ' (snapshot ' || p.expect_memory || ')', ', ') INTO v_bad
    FROM _plan053 p CROSS JOIN LATERAL (SELECT count(*) n FROM public.user_food_memory m WHERE m.food_item_id = p.old_id) c
   WHERE p.kind = 'quarantine_only' AND c.n <> p.expect_memory;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '053: memory pointers to quarantine-only rows changed since the snapshot: %', v_bad;
  END IF;

  -- §4 backups (schema backup has no API-role access since 050). They hold user ids (memory): drop them in a
  --    later reviewed migration once 053 has settled, as D13 does for 050's.
  CREATE TABLE backup._backup_food_items_053 AS
    SELECT fi.* FROM public.food_items fi WHERE fi.id IN (SELECT old_id FROM _plan053);
  CREATE TABLE backup._backup_food_aliases_053 AS TABLE public.food_aliases;
  CREATE TABLE backup._backup_user_food_memory_053 AS
    SELECT m.* FROM public.user_food_memory m WHERE m.food_item_id IN (SELECT old_id FROM _plan053);
  REVOKE ALL ON backup._backup_food_items_053, backup._backup_food_aliases_053, backup._backup_user_food_memory_053
    FROM PUBLIC, anon, authenticated, service_role;
  COMMENT ON TABLE backup._backup_food_items_053 IS
    'food_items rows 053 quarantined, as they were before it. Source for supabase/rollback/053_recalc_indian_v1_down.sql.';
  COMMENT ON TABLE backup._backup_user_food_memory_053 IS
    'user_food_memory rows that pointed at a 053-quarantined row. Holds user ids: drop in a later reviewed migration.';
""")
    # §5 derivations
    w("  -- §5 provenance (generated VALUES; ON CONFLICT keeps the first copy on a re-apply, §12 compares it)")
    w("  INSERT INTO public.food_derivations (id, calc_version, variant_key, recipe_ref, method, cooking_class, moisture_rule,")
    w("    moisture_target_pct, moisture_basis, yield_factor, alpha, frying_oil_removed_g, kcal, protein_g, carbs_g, fat_g,")
    w("    fiber_g, water_g, fat_components, base_per_100g, confidence, referee, lines, inputs_sha256, review_note, approved_by)")
    w("  VALUES")
    vals = []
    for d in der:
        v = d['values']
        vals.append(f"    ({u(d['id'])}, {q(d['calc_version'])}, {q(d['variant_key'])}, {q(d['recipe_ref'])}, "
                    f"{q(d['method_sql'])}, {q(d['cooking_class'])}, {q(d['moisture_rule'])}, {n(d['moisture_target_pct'])}, "
                    f"{q(d['moisture_basis'])}, {n(d['yield_factor'])}, {n(d['alpha'])}, {n(d['frying_oil_removed_g'])}, "
                    f"{v['kcal']}, {v['protein']}, {v['carbs']}, {v['fat']}, {v['fiber']}, {n(v.get('water'))},\n"
                    f"     {jq(d['fat_components'])}, {jq(d['base_per_100g'])}, {q(d['confidence'])}, {jq(d['referee'])},\n"
                    f"     {jq(d['lines'])},\n     {q(sha)}, {q(d['review_note'])}, {q(d['approved_by'])})")
    w(',\n'.join(vals))
    w("  ON CONFLICT (id) DO NOTHING;")
    w("""
  -- §6 park every old key first: food_items_normalized_name_uidx is not deferrable, so the new rows cannot take
  --    a key while its old holder still has it. (Quarantined fried rows already have theirs parked.)
  UPDATE public.food_items fi
     SET parked_normalized_name = coalesce(fi.normalized_name, fi.parked_normalized_name), normalized_name = NULL
   WHERE fi.id IN (SELECT old_id FROM _plan053);

  -- §7 the new rows (verified, ownerless reference data; legacy per-serving columns mirror per 100 g)
  INSERT INTO public.food_items AS fi
    (id, external_id, source, name, calories, protein_g, carbs_g, fat_g, fiber_g, serving_size_g, created_by,
     normalized_name, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fiber_per_100g, fdc_id,
     portions, status, status_reason, status_changed_at, parked_normalized_name)
  SELECT nw.id, nw.external_id, nw.source, nw.name, nw.kcal, nw.protein, nw.carbs, nw.fat, nw.fiber, 100, NULL,
         nw.key, nw.kcal, nw.protein, nw.carbs, nw.fat, nw.fiber, nw.fdc_id,
         nw.portions, 'verified', nw.status_reason, now(), NULL
    FROM _new053 nw
  ON CONFLICT (id) DO UPDATE                -- re-apply after the down script: re-verify our own rolled-back row
     SET status = 'verified', status_reason = EXCLUDED.status_reason, status_changed_at = now(),
         normalized_name = EXCLUDED.normalized_name, parked_normalized_name = NULL
   WHERE fi.status = 'quarantined' AND fi.status_reason = 'reviewed:rollback_053';
  INSERT INTO public.food_derivation_items (food_item_id, derivation_id, is_canonical)
  SELECT nw.id, nw.derivation_id, nw.is_canonical FROM _new053 nw
  ON CONFLICT (food_item_id) DO NOTHING;

  -- §8 aliases: follow the old row to its own successor (note extended); retire the ones that became exact keys;
  --    then the new aliases (none equals a key, §12)
  UPDATE public.food_aliases fa SET food_item_id = a.new_target, note = a.note
    FROM _alias053 a WHERE a.kind = 'repoint' AND fa.alias = a.alias AND fa.food_item_id = a.expect_target;
  DELETE FROM public.food_aliases fa USING _alias053 a
   WHERE a.kind = 'retire' AND fa.alias = a.alias AND fa.food_item_id = a.expect_target;
  INSERT INTO public.food_aliases (alias, food_item_id, note)
  SELECT a.alias, a.new_target, a.note FROM _alias053 a WHERE a.kind = 'insert';

  -- §9 memory follows its row; pointers at a quarantine-only row are dropped (expected 0, checked in §3)
  WITH m AS (
    UPDATE public.user_food_memory um SET food_item_id = p.new_id
      FROM _plan053 p WHERE um.food_item_id = p.old_id AND p.new_id IS NOT NULL
    RETURNING p.old_id, p.new_id)
  INSERT INTO public.food_value_changes (migration, change_kind, food_item_id, successor_id, n_rows, reason)
  SELECT '053', 'memory_repoint', m.old_id, m.new_id, count(*), 'user_food_memory follows its row to the 053 successor'
    FROM m GROUP BY m.old_id, m.new_id;
  WITH m AS (
    DELETE FROM public.user_food_memory um USING _plan053 p
     WHERE um.food_item_id = p.old_id AND p.new_id IS NULL
    RETURNING p.old_id)
  INSERT INTO public.food_value_changes (migration, change_kind, food_item_id, n_rows, reason)
  SELECT '053', 'memory_drop', m.old_id, count(*), 'pointer at a row quarantined with no replacement'
    FROM m GROUP BY m.old_id;

  -- §10 quarantine the old rows (facts untouched; §12 compares them with the backup)
  UPDATE public.food_items fi SET status = 'quarantined', status_reason = p.reason, status_changed_at = now()
    FROM _plan053 p WHERE fi.id = p.old_id;

  -- §11 the change log: one row per action, before/after values, never a user id
  INSERT INTO public.food_value_changes (migration, change_kind, food_item_id, derivation_id, key, after, reason)
  SELECT '053', 'insert_derived', nw.id, nw.derivation_id, nw.key,
         jsonb_build_object('kcal', nw.kcal, 'protein', nw.protein, 'carbs', nw.carbs, 'fat', nw.fat, 'fiber', nw.fiber,
                            'portions', nw.portions, 'source', nw.source, 'name', nw.name),
         nw.status_reason
    FROM _new053 nw;
  INSERT INTO public.food_value_changes (migration, change_kind, food_item_id, successor_id, derivation_id, key, relation,
                                         before, after, reason)
  SELECT '053', p.kind, p.old_id, p.new_id, nw.derivation_id, p.expect_key, p.relation,
         jsonb_build_object('kcal', b.calories_per_100g, 'protein', b.protein_per_100g, 'carbs', b.carbs_per_100g,
                            'fat', b.fat_per_100g, 'fiber', b.fiber_per_100g, 'portions', b.portions, 'status', b.status,
                            'status_reason', b.status_reason),
         CASE WHEN nw.id IS NOT NULL THEN jsonb_build_object('kcal', nw.kcal, 'protein', nw.protein, 'carbs', nw.carbs,
                            'fat', nw.fat, 'fiber', nw.fiber, 'portions', nw.portions) END,
         p.reason
    FROM _plan053 p JOIN backup._backup_food_items_053 b ON b.id = p.old_id LEFT JOIN _new053 nw ON nw.id = p.new_id;
  INSERT INTO public.food_value_changes (migration, change_kind, food_item_id, key, reason)
  SELECT '053', 'key_park', p.old_id, p.expect_key, 'key parked on the quarantined row'
    FROM _plan053 p JOIN backup._backup_food_items_053 b ON b.id = p.old_id WHERE b.normalized_name IS NOT NULL;
  INSERT INTO public.food_value_changes (migration, change_kind, food_item_id, successor_id, key, reason)
  SELECT '053', 'key_take', nw.id, NULL, nw.key, nw.key_reason
    FROM _new053 nw;
  INSERT INTO public.food_value_changes (migration, change_kind, food_item_id, successor_id, alias, reason)
  SELECT '053', 'alias_' || a.kind, a.expect_target, a.new_target, a.alias, a.note
    FROM _alias053 a;
  INSERT INTO public.food_value_changes (migration, change_kind, food_item_id, successor_id, before, after, reason)
  SELECT '053', 'portion_change', pc.food_item_id, NULL, pc.before, pc.after, 'approved by ' || pc.approved_by
    FROM _portion053 pc;
END
$apply$;
""")
    # §12 checks
    pr = probes(plan)
    w("-- ── §12 Self-checks (any failure rolls back everything above) ───────────────────────────────────────")
    w("DO $chk$")
    w("DECLARE")
    w("  v_bad text; v_n bigint; v_m bigint; v_top record; pr record; v_ids uuid[];   -- not r: _ref053 r below")
    w("BEGIN")
    w("""  IF NOT (SELECT go FROM _state053) THEN
    RAISE NOTICE '053 ok: schema only (no production rows)';
    RETURN;
  END IF;
  -- (a) every new row passes rules v1 and carries the plan's numbers, key, portions and derivation
  SELECT string_agg(fi.name || ' ' || array_to_string(public.food_item_issues(fi.source, fi.name, fi.calories_per_100g,
           fi.protein_per_100g, fi.carbs_per_100g, fi.fat_per_100g, fi.fiber_per_100g), ','), '; ') INTO v_bad
    FROM _new053 nw JOIN public.food_items fi ON fi.id = nw.id
   WHERE public.food_item_issues(fi.source, fi.name, fi.calories_per_100g, fi.protein_per_100g, fi.carbs_per_100g,
                                 fi.fat_per_100g, fi.fiber_per_100g) <> '{}';
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION '053: new rows fail rules v1: %', v_bad; END IF;
  SELECT string_agg(left(nw.id::text, 8) || ' ' || nw.key, ', ') INTO v_bad
    FROM _new053 nw LEFT JOIN public.food_items fi ON fi.id = nw.id
    LEFT JOIN public.food_derivation_items di ON di.food_item_id = nw.id
    LEFT JOIN public.food_derivations d ON d.id = nw.derivation_id
   WHERE fi.id IS NULL OR fi.status <> 'verified' OR fi.created_by IS NOT NULL
      OR fi.normalized_name IS DISTINCT FROM nw.key OR fi.parked_normalized_name IS NOT NULL
      OR (fi.calories_per_100g, fi.protein_per_100g, fi.carbs_per_100g, fi.fat_per_100g, fi.fiber_per_100g)
         IS DISTINCT FROM (nw.kcal, nw.protein, nw.carbs, nw.fat, nw.fiber)
      OR (fi.calories, fi.protein_g, fi.carbs_g, fi.fat_g, fi.fiber_g) IS DISTINCT FROM (nw.kcal, nw.protein, nw.carbs, nw.fat, nw.fiber)
      OR fi.portions IS DISTINCT FROM nw.portions OR fi.source IS DISTINCT FROM nw.source
      OR di.derivation_id IS DISTINCT FROM nw.derivation_id OR di.is_canonical IS DISTINCT FROM nw.is_canonical
      OR (d.kcal, d.protein_g, d.carbs_g, d.fat_g, d.fiber_g) IS DISTINCT FROM (nw.kcal, nw.protein, nw.carbs, nw.fat, nw.fiber);
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION '053: new rows differ from the plan: %', v_bad; END IF;
  SELECT string_agg(d.variant_key, ', ') INTO v_bad FROM public.food_derivations d
   WHERE d.id IN (SELECT derivation_id FROM _new053) AND d.method = 'recipe_recalc'
     AND abs(d.kcal - (4 * d.protein_g + 9 * d.fat_g + 4 * d.carbs_g + 2 * d.fiber_g)) > 0.5;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION '053: kcal <> 4P + 9F + 4C + 2fib for: %', v_bad; END IF;

  -- (b) old rows: quarantined, unkeyed (key parked), facts identical to the backup
  SELECT string_agg(left(p.old_id::text, 8), ', ') INTO v_bad
    FROM _plan053 p JOIN public.food_items f ON f.id = p.old_id JOIN backup._backup_food_items_053 b ON b.id = p.old_id
   WHERE f.status <> 'quarantined' OR f.normalized_name IS NOT NULL OR f.parked_normalized_name IS DISTINCT FROM p.expect_key
      OR f.status_reason IS DISTINCT FROM p.reason""")
    w(f"      OR {facts('f')}\n         IS DISTINCT FROM\n         {facts('b')};")
    w("""  IF v_bad IS NOT NULL THEN RAISE EXCEPTION '053: old rows not cleanly quarantined: %', v_bad; END IF;
  SELECT count(*) INTO v_n FROM backup._backup_food_items_053;
  IF v_n <> (SELECT count(*) FROM _plan053) THEN RAISE EXCEPTION '053: backup has % rows, plan %', v_n, (SELECT count(*) FROM _plan053); END IF;

  -- (c) every pre-053 key is held by exactly one verified row (its successor), unless quarantine-only (none)
  SELECT string_agg(p.expect_key || ' x' || c.n, ', ') INTO v_bad
    FROM _plan053 p CROSS JOIN LATERAL (SELECT count(*) n, min(fi.id::text) id FROM public.food_items fi
                                         WHERE fi.normalized_name = p.expect_key AND fi.status = 'verified') c
   WHERE (p.new_id IS NOT NULL AND (c.n <> 1 OR c.id <> p.new_id::text)) OR (p.new_id IS NULL AND c.n <> 0);
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION '053: keys not held exactly once by their successor: %', v_bad; END IF;
  SELECT count(*) INTO v_n FROM public.food_items WHERE status = 'verified';
  SELECT (SELECT verified_before FROM _state053) + (SELECT count(*) FROM _new053)
       - (SELECT count(*) FROM backup._backup_food_items_053 WHERE status = 'verified') INTO v_m;
  IF v_n <> v_m THEN RAISE EXCEPTION '053: verified rows % (expected before + new - removed = %)', v_n, v_m; END IF;
  SELECT string_agg(left(r.id::text, 8), ', ') INTO v_bad FROM _ref053 r JOIN public.food_items fi ON fi.id = r.id
   WHERE r.id NOT IN (SELECT old_id FROM _plan053)
     AND (fi.status <> 'verified' OR fi.normalized_name IS DISTINCT FROM r.expect_key
      OR (fi.calories_per_100g, fi.portions) IS DISTINCT FROM (r.kcal, r.portions));
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION '053: a reference row changed: %', v_bad; END IF;

  -- (d) aliases: as planned (retired ones gone); verified targets only; none equals a key; none disagrees with
  --     the key of its words
  SELECT string_agg(a.alias, ', ') INTO v_bad FROM _alias053 a LEFT JOIN public.food_aliases fa ON fa.alias = a.alias
   WHERE (a.kind <> 'retire' AND (fa.food_item_id IS DISTINCT FROM a.new_target OR fa.note IS DISTINCT FROM a.note))
      OR (a.kind = 'retire' AND fa.alias IS NOT NULL);
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION '053: aliases not as planned: %', v_bad; END IF;
  SELECT string_agg(fa.alias, ', ') INTO v_bad FROM public.food_aliases fa JOIN public.food_items fi ON fi.id = fa.food_item_id
   WHERE fi.status <> 'verified' OR fi.calories_per_100g IS NULL;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION '053: aliases point at non-verified rows: %', v_bad; END IF;
  SELECT string_agg(fa.alias, ', ') INTO v_bad FROM public.food_aliases fa JOIN public.food_items fi ON fi.normalized_name = fa.alias;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION '053: aliases equal to an exact key never fire: %', v_bad; END IF;
  SELECT string_agg(fa.alias || ' (key ' || fi.normalized_name || ')', ', ') INTO v_bad
    FROM public.food_aliases fa JOIN public.food_items fi ON fi.normalized_name IS NOT NULL AND fi.id <> fa.food_item_id
     AND (SELECT array_agg(x ORDER BY x) FROM regexp_split_to_table(fi.normalized_name, ' ') x)
       = (SELECT array_agg(x ORDER BY x) FROM regexp_split_to_table(fa.alias, ' ') x);
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION '053: aliases disagree with the exact key of the same words: %', v_bad; END IF;

  -- (e) memory: nothing points at an old row; nothing points at a quarantined row anywhere (audit --check rule)
  SELECT count(*) INTO v_n FROM public.user_food_memory m WHERE m.food_item_id IN (SELECT old_id FROM _plan053);
  IF v_n > 0 THEN RAISE EXCEPTION '053: % memory pointers still target a superseded row', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.user_food_memory m JOIN public.food_items fi ON fi.id = m.food_item_id
   WHERE fi.status = 'quarantined';
  IF v_n > 0 THEN RAISE EXCEPTION '053: % memory pointers target quarantined rows', v_n; END IF;

  -- (f) history untouched: same fingerprints as at the start (the tables were SHARE-locked throughout)
  IF (SELECT ROW(e, d, s) FROM _fp053) IS DISTINCT FROM ROW(
    """ + FP_NOW + """) THEN
    RAISE EXCEPTION '053: food_entries / daily_summaries / saved_entries changed';
  END IF;

  -- (g) privileges: the provenance tables are server-side only
  IF has_table_privilege('anon', 'public.food_derivations', 'SELECT')
     OR has_table_privilege('authenticated', 'public.food_derivations', 'SELECT')
     OR has_table_privilege('anon', 'public.food_value_changes', 'SELECT')
     OR has_table_privilege('authenticated', 'public.food_value_changes', 'SELECT')
     OR has_table_privilege('authenticated', 'public.food_derivation_items', 'SELECT')
     OR has_table_privilege('service_role', 'public.food_value_changes', 'INSERT')
     OR has_sequence_privilege('authenticated', 'public.food_value_changes_id_seq', 'USAGE')
     OR NOT has_table_privilege('service_role', 'public.food_derivations', 'SELECT') THEN
    RAISE EXCEPTION '053: provenance tables reachable by an API role (or not readable by service_role)';
  END IF;

  -- (h) search: what each phrase serves now (exact keys work in every RESOLVER_SEARCH mode; aliases in ranked)""")
    w("  FOR pr IN SELECT * FROM (VALUES")
    w(',\n'.join(f"      ({q(qq)}, {u(i)}, {q(k)})" for qq, i, k in pr) + ") AS t(q, id, kind)")
    w("""  LOOP
    SELECT * INTO v_top FROM public.search_foods(pr.q, 1);
    IF v_top.id IS DISTINCT FROM pr.id OR v_top.match_kind IS DISTINCT FROM pr.kind THEN
      RAISE EXCEPTION '053: search_foods(%) top = % (%), expected % (%)', pr.q, v_top.id, v_top.match_kind, pr.id, pr.kind;
    END IF;
  END LOOP;""")
    chai = next(r['id'] for r in new if r['key'] == 'tea')
    fts_vals = ',\n'.join(f"      ({q(qq)}, {u(i)})" for qq, i in fts_probes(plan))
    fts_served = FTS_SERVED.format(q='pr.q')
    fts_served_p = FTS_SERVED.format(q='p.q').replace('\n', '\n      ')
    fts_rep = ','.join(q(x) for x in FTS_REPORTED)
    rice_new = [r['id'] for r in new if r['variant'] == 'rice_white_usda168930']
    rice_port = next(r['portions'] for r in new if r['variant'] == 'rice_white_usda168930')
    rice_aliases = sorted(a['alias'] for a in al if a['kind'] == 'repoint' and a['target'] in rice_new)
    w(f"""  -- masala chai: the alias makes it top 1 in ranked mode; in a 5-row list the tail slot ('chai') keeps it too
  IF NOT EXISTS (SELECT 1 FROM public.search_foods('masala chai', 5) x WHERE x.id = {u(chai)}) THEN
    RAISE EXCEPTION '053: search_foods(masala chai, 5) does not offer the chai row';
  END IF;
  -- rice: every rice key and every 052 rice alias ({', '.join(rice_aliases)}) serve the same numbers and the
  -- founder's portions ({fmt_port(rice_port)}), and no verified row still serves the US cup for FDC 168930
  SELECT count(DISTINCT (fi.calories_per_100g, fi.protein_per_100g, fi.carbs_per_100g, fi.fat_per_100g, fi.fiber_per_100g,
                         fi.portions::text)) INTO v_n
    FROM public.food_items fi
   WHERE fi.id IN ({', '.join(u(i) for i in rice_new)})
      OR fi.id IN (SELECT food_item_id FROM public.food_aliases WHERE alias IN ({', '.join(q(a) for a in rice_aliases)}));
  IF v_n <> 1 THEN RAISE EXCEPTION '053: the rice family serves % different number sets', v_n; END IF;
  SELECT string_agg(left(fi.id::text, 8), ', ') INTO v_bad FROM public.food_items fi
   WHERE fi.source = 'usda' AND fi.fdc_id = 168930 AND fi.status = 'verified'
     AND fi.portions IS DISTINCT FROM {jq(rice_port)};
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION '053: verified FDC 168930 rows with other portions: %', v_bad; END IF;

  -- (i) fts mode (RESOLVER_SEARCH=fts, the live default), the resolver's own two reads: the verified exact key,
  --     else the 3 lowest-id verified rows whose NAME matches websearch_to_tsquery('english', q). Aliases are not
  --     read, and copy rows have new ids, so this is where a phrase can silently lose its row ('chawal' did).
  FOR pr IN SELECT * FROM (VALUES
{fts_vals}) AS t(q, id)
  LOOP
    v_ids := {fts_served};
    IF v_ids IS NULL OR NOT (pr.id = ANY (v_ids)) THEN
      RAISE EXCEPTION '053: fts mode: % is offered %, not %', pr.q, v_ids, pr.id;
    END IF;
  END LOOP;
  FOR pr IN SELECT p.q, (SELECT string_agg(fi.name || ' ' || fi.calories_per_100g, ' | ' ORDER BY fi.id)
                           FROM public.food_items fi WHERE fi.id = ANY ({fts_served_p})) AS top
             FROM unnest(ARRAY[{fts_rep}]) AS p(q)
  LOOP
    RAISE NOTICE '053 fts % -> %', pr.q, coalesce(pr.top, 'no database row (USDA / estimate)');
  END LOOP;
  FOR pr IN SELECT p.q, string_agg(s.name || ' ' || s.calories_per_100g || ' [' || s.match_kind || ']', ' | ') AS top
             FROM unnest(ARRAY['boiled rice','chole','sabudana khichdi','khichdi','upma','medu vada','pakora',
                               'vada pav','bajra roti','butter roti','masala chai','dal chawal']) AS p(q)
             CROSS JOIN LATERAL public.search_foods(p.q, 3) s GROUP BY p.q
  LOOP
    RAISE NOTICE '053 probe % -> %', pr.q, pr.top;
  END LOOP;
  RAISE NOTICE '053 ok: % new rows, % quarantined, % aliases repointed, % added, % memory pointers moved',
    (SELECT count(*) FROM _new053), (SELECT count(*) FROM _plan053),
    (SELECT count(*) FROM _alias053 WHERE kind = 'repoint'), (SELECT count(*) FROM _alias053 WHERE kind = 'insert'),
    (SELECT coalesce(sum(n_rows), 0) FROM public.food_value_changes
      WHERE migration = '053' AND change_kind = 'memory_repoint' AND created_at = now());   -- this run only
END
$chk$;
""")
    w("""COMMENT ON COLUMN public.food_items.status_reason IS
  'rules_v1_pass | auto_050:<codes> | manual_050:<why> | unshared_050 | private | legacy_per_serving | auto_v1:<codes> (Phase 3 resolver) | rough_v1:<codes> (Phase 3 resolver: an AI guess still failing the rules after the retry, logged flagged and low-confidence and never remembered; an impossible guess is repaired first, a merely doubtful one is kept as given; <codes> are what the guess failed) | gate:<status> (guard downgrade) | reviewed:<note> (051+) | reviewed:053:recalc_v1:<variant> (053 recalculated/copied row; provenance in food_derivations) | reviewed:053:superseded:<relation>:<successor id8> | reviewed:053:quarantine_only:<why> | reviewed:rollback_053 (053 down script)';

NOTIFY pgrst, 'reload schema';""")
    return '\n'.join(L) + '\n'


# ── rollback ──────────────────────────────────────────────────────────────────────────────────────
def rollback_sql(plan, sha):
    new = plan['new_rows']
    ins_alias = [a['alias'] for a in plan['aliases'] if a['kind'] == 'insert']
    ret_alias = [a['alias'] for a in plan['aliases'] if a['kind'] == 'retire']
    q_only = [o['old_id'] for o in plan['old_rows'] if o['kind'] == 'quarantine_only']
    ret_txt = ', '.join(f"'{a}'" for a in ret_alias)
    no_pred = ' / '.join(sorted(r['key'] for r in new if r['predecessor'] is None))
    pairs = ',\n      '.join(f"({u(r['id'])}, {u(r['predecessor'])})" for r in new)
    retired_back = (f"""  WITH x AS (
    INSERT INTO public.food_aliases (alias, food_item_id, note, created_at)
    SELECT b.alias, b.food_item_id, b.note, b.created_at FROM backup._backup_food_aliases_053 b
     WHERE b.alias IN ({', '.join(q(a) for a in ret_alias)})
       AND NOT EXISTS (SELECT 1 FROM public.food_aliases a WHERE a.alias = b.alias)
    RETURNING alias)
  INSERT INTO public.food_value_changes (migration, change_kind, n_rows, reason)
  SELECT '053', 'rollback', count(*), 'down: aliases 053 retired (their words were 053 keys) restored' FROM x;
""" if ret_alias else '')
    return f"""-- 053_recalc_indian_v1_down.sql — GENERATED by scripts/recalc/recalc.py emit; inputs_sha256 {sha}; do not edit
-- Undo supabase/migrations/053_recalc_indian_v1.sql (rollback level R1 of spec §(f)).
--
-- WHY THIS FILE LIVES OUTSIDE migrations/: the CLI applies every file there in order, so a down script there
--   would undo 053 on the next push. Here it is inert until a person runs it on purpose.
-- CHEAPER FIRST: one dish is R0 = regenerate with that dish removed from scripts/recalc/data/targets.csv, which
--   produces a forward migration. This file reverts ALL of 053. Run it BEFORE any 052 or 050 rollback (it needs
--   food_aliases, and 050's status columns). Only with Shivam's approval.
-- HOW TO RUN: psql -v ON_ERROR_STOP=1 -f supabase/rollback/053_recalc_indian_v1_down.sql (or the SQL editor), then
--   `supabase migration repair --status reverted 053`. The next `db push` re-applies 053 (it re-verifies its
--   own rolled-back rows); move the migration file away first to keep it off.
-- THE RANKING GATE GOES WITH IT: scripts/eval/search-check.sql's expected ids are 053's (the generator rewrote
--   them to the successors and the chawal / phulka / tea / chai lines). Against a database without 053 (before the push, or
--   after this file) it reports a false failure, so revert its cases block to the version before 053 in the same
--   change, and restore it if 053 is re-applied.
--
-- WHAT IT DOES (in one transaction, same lock order as 053):
--   1. the 053 rows: key parked, quarantined with status_reason 'reviewed:rollback_053' (never deleted: entries
--      logged on them since 053 keep their numbers);
--   2. the rows 053 quarantined get back their exact pre-053 status, reason and key from the 053 backup;
--   3. aliases that still point at a 053 row go back to their pre-053 target and note; the aliases 053 added are
--      removed; the 052 aliases 053 retired ({ret_txt}: their words became 053 keys) come back;
--   4. memory pointers at a 053 row go back to the row it superseded when that row was VERIFIED before 053.
--      Pointers at a 053 row with no verified predecessor are dropped, counted: the {no_pred} rows have
--      no predecessor, and the 7 fried successors (poori, bhatura, sev, both pakoras, INDB medu vada...) replaced
--      rows that were already quarantined, which user_food_memory_check_target refuses as a target (moving them
--      back would abort the whole rollback). Before 053 those phrases had no usable row to remember either.
--      Pointers 053 itself dropped (only ever on a quarantine-only row; §3 pinned that count, expected 0) come
--      back from the backup, and only those: never a pointer the user deleted after 053, never one of a user
--      who has since deleted the account (the foreign key would abort the rollback);
--   5. food_value_changes gets one 'rollback' row per action (counts only);
--   6. self-checks (keys, statuses, aliases, memory, fingerprints of food_entries / daily_summaries /
--      saved_entries), then the 053 backups are renamed *_rb_<UTC timestamp> so 053 can run again later.
-- WHAT IT DOES NOT DO: touch food_entries, daily_summaries or saved_entries; delete any food_items row; drop the
--   provenance tables (food_derivations keeps the record of what 053 shipped). Drop the renamed backups (they
--   hold user ids) in a later reviewed migration.
-- RE-RUNNABLE: with no backup._backup_food_items_053 it checks that no 053 row is still verified and stops with
--   a NOTICE. A failed run rolls back as a whole (BEGIN/COMMIT below), so it can simply be run again.

BEGIN;
SELECT pg_catalog.set_config('lock_timeout', '5s', true);   -- fail fast instead of queueing behind a long query

DO $rb$
DECLARE
  v_bad text; v_n bigint; v_ts text := to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYYMMDD"T"HH24MISS');
  v_fp text[]; v_fp2 text[];
BEGIN
  IF pg_catalog.to_regclass('public.food_derivation_items') IS NULL THEN
    RAISE NOTICE '053 down: 053 was never applied here; nothing to do';
    RETURN;
  END IF;
  IF pg_catalog.to_regclass('backup._backup_food_items_053') IS NULL THEN
    SELECT count(*) INTO v_n FROM public.food_items fi JOIN public.food_derivation_items di ON di.food_item_id = fi.id
     WHERE fi.status = 'verified' AND fi.status_reason LIKE 'reviewed:053:%';
    IF v_n > 0 THEN
      RAISE EXCEPTION '053 down: % 053 rows are live but backup._backup_food_items_053 is missing; restore it first', v_n;
    END IF;
    RAISE NOTICE '053 down: already rolled back (no 053 backup, no live 053 row); nothing to do';
    RETURN;
  END IF;

  -- account deletion's lock order, food_items first (the 053 header's §0 explains why)
  LOCK TABLE public.food_items       IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.food_entries, public.daily_summaries, public.saved_entries IN SHARE MODE;
  LOCK TABLE public.user_food_memory IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.food_aliases     IN SHARE ROW EXCLUSIVE MODE;
  SELECT ARRAY[
    {FP_NOW}] INTO v_fp;

  CREATE TEMP TABLE _rb053 (new_id uuid PRIMARY KEY, old_id uuid) ON COMMIT DROP;   -- 053 row -> the row it superseded
  INSERT INTO _rb053 VALUES
      {pairs};

  -- 1. park the 053 keys and quarantine the 053 rows (keys first: the unique key index is not deferrable)
  WITH x AS (
    UPDATE public.food_items fi
       SET parked_normalized_name = coalesce(fi.normalized_name, fi.parked_normalized_name), normalized_name = NULL,
           status = 'quarantined', status_reason = 'reviewed:rollback_053', status_changed_at = now()
     WHERE fi.id IN (SELECT new_id FROM _rb053) AND fi.status <> 'quarantined'
    RETURNING fi.id)
  INSERT INTO public.food_value_changes (migration, change_kind, food_item_id, n_rows, reason)
  SELECT '053', 'rollback', NULL, count(*), 'down: 053 rows quarantined (reviewed:rollback_053), keys parked' FROM x;

  -- 2. the superseded rows get their pre-053 status, reason and key back
  WITH x AS (
    UPDATE public.food_items f
       SET status = b.status, status_reason = b.status_reason, status_changed_at = b.status_changed_at,
           normalized_name = b.normalized_name, parked_normalized_name = b.parked_normalized_name
      FROM backup._backup_food_items_053 b
     WHERE f.id = b.id
       AND (f.status, f.status_reason, f.normalized_name, f.parked_normalized_name)
           IS DISTINCT FROM (b.status, b.status_reason, b.normalized_name, b.parked_normalized_name)
    RETURNING f.id)
  INSERT INTO public.food_value_changes (migration, change_kind, n_rows, reason)
  SELECT '053', 'rollback', count(*), 'down: superseded rows restored from backup._backup_food_items_053' FROM x;

  -- 3. aliases: back to the pre-053 target and note where they still point at a 053 row; 053's own aliases
  --    removed; the ones 053 retired restored (after step 1 parked their words' keys)
  WITH x AS (
    UPDATE public.food_aliases a SET food_item_id = b.food_item_id, note = b.note
      FROM backup._backup_food_aliases_053 b
     WHERE a.alias = b.alias AND a.food_item_id IN (SELECT new_id FROM _rb053)
       AND (a.food_item_id, a.note) IS DISTINCT FROM (b.food_item_id, b.note)
    RETURNING a.alias)
  INSERT INTO public.food_value_changes (migration, change_kind, n_rows, reason)
  SELECT '053', 'rollback', count(*), 'down: aliases repointed to their pre-053 targets' FROM x;
  WITH x AS (
    DELETE FROM public.food_aliases a
     WHERE a.alias IN ({', '.join(q(a) for a in ins_alias)})
       AND NOT EXISTS (SELECT 1 FROM backup._backup_food_aliases_053 b WHERE b.alias = a.alias)
    RETURNING a.alias)
  INSERT INTO public.food_value_changes (migration, change_kind, n_rows, reason)
  SELECT '053', 'rollback', count(*), 'down: aliases added by 053 removed' FROM x;
{retired_back}
  -- 4. memory (header, step 4). First drop the pointers that have no verified pre-053 row to go back to, THEN
  --    move the rest back (the target trigger accepts only a usable row, and step 2 already re-verified those).
  WITH x AS (
    DELETE FROM public.user_food_memory m USING _rb053 r
     WHERE m.food_item_id = r.new_id
       AND NOT EXISTS (SELECT 1 FROM backup._backup_food_items_053 b WHERE b.id = r.old_id AND b.status = 'verified')
    RETURNING m.id)
  INSERT INTO public.food_value_changes (migration, change_kind, n_rows, reason)
  SELECT '053', 'rollback', count(*), 'down: memory pointers at 053 rows with no verified predecessor dropped' FROM x;
  WITH x AS (
    UPDATE public.user_food_memory m SET food_item_id = r.old_id
      FROM _rb053 r WHERE m.food_item_id = r.new_id AND r.old_id IS NOT NULL
    RETURNING m.id)
  INSERT INTO public.food_value_changes (migration, change_kind, n_rows, reason)
  SELECT '053', 'rollback', count(*), 'down: memory pointers returned to the superseded rows' FROM x;
  WITH x AS (
    INSERT INTO public.user_food_memory
    SELECT b.* FROM backup._backup_user_food_memory_053 b
     WHERE b.food_item_id IN ({', '.join(u(i) for i in q_only)})       -- what 053 dropped (quarantine-only rows)
       AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = b.user_id)
       AND EXISTS (SELECT 1 FROM public.food_items fi WHERE fi.id = b.food_item_id AND fi.status = 'verified')
       AND NOT EXISTS (SELECT 1 FROM public.user_food_memory m
                        WHERE m.id = b.id OR (m.user_id = b.user_id AND m.normalized_name = b.normalized_name))
    ON CONFLICT DO NOTHING
    RETURNING id)
  INSERT INTO public.food_value_changes (migration, change_kind, n_rows, reason)
  SELECT '053', 'rollback', count(*), 'down: memory pointers dropped by 053 restored' FROM x;

  -- 6. self-checks
  SELECT string_agg(left(b.id::text, 8), ', ') INTO v_bad
    FROM backup._backup_food_items_053 b JOIN public.food_items f ON f.id = b.id
   WHERE (f.status, f.status_reason, f.normalized_name, f.parked_normalized_name)
         IS DISTINCT FROM (b.status, b.status_reason, b.normalized_name, b.parked_normalized_name)
      OR {facts('f')} IS DISTINCT FROM {facts('b')};
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION '053 down: rows not restored: %', v_bad; END IF;
  SELECT count(*) INTO v_n FROM public.food_items WHERE id IN (SELECT new_id FROM _rb053) AND status = 'verified';
  IF v_n > 0 THEN RAISE EXCEPTION '053 down: % 053 rows still verified', v_n; END IF;
  SELECT string_agg(b.alias, ', ') INTO v_bad FROM backup._backup_food_aliases_053 b
    LEFT JOIN public.food_aliases a ON a.alias = b.alias
   WHERE (a.food_item_id, a.note) IS DISTINCT FROM (b.food_item_id, b.note);
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION '053 down: aliases not back to their pre-053 targets: %', v_bad; END IF;
  SELECT string_agg(a.alias, ', ') INTO v_bad FROM public.food_aliases a JOIN public.food_items fi ON fi.id = a.food_item_id
   WHERE fi.status <> 'verified';
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION '053 down: aliases point at non-verified rows: %', v_bad; END IF;
  SELECT count(*) INTO v_n FROM public.user_food_memory m JOIN public.food_items fi ON fi.id = m.food_item_id
   WHERE fi.status = 'quarantined';
  IF v_n > 0 THEN RAISE EXCEPTION '053 down: % memory pointers target quarantined rows', v_n; END IF;
  SELECT ARRAY[
    {FP_NOW}] INTO v_fp2;
  IF v_fp IS DISTINCT FROM v_fp2 THEN RAISE EXCEPTION '053 down: food_entries / daily_summaries / saved_entries changed'; END IF;

  -- rename the backups so 053 can be applied again later (its RUNS ONCE guard looks for these names)
  EXECUTE format('ALTER TABLE backup._backup_food_items_053 RENAME TO %I', '_backup_food_items_053_rb_' || v_ts);
  EXECUTE format('ALTER TABLE backup._backup_food_aliases_053 RENAME TO %I', '_backup_food_aliases_053_rb_' || v_ts);
  EXECUTE format('ALTER TABLE backup._backup_user_food_memory_053 RENAME TO %I', '_backup_user_food_memory_053_rb_' || v_ts);
  INSERT INTO public.food_value_changes (migration, change_kind, reason)
  VALUES ('053', 'rollback', 'down: complete; backups renamed with suffix _rb_' || v_ts);
  RAISE NOTICE '053 down ok: backups renamed *_rb_%', v_ts;
END
$rb$;

NOTIFY pgrst, 'reload schema';   -- delivered at COMMIT

COMMIT;
"""


# ── out/derivations.json (also the jest test's input) ───────────────────────────────────────────────
def derivations_json(plan, sha):
    rows = []
    for r in plan['new_rows']:
        rows.append(dict(id=r['id'], derivation_id=r['derivation_id'], variant=r['variant'], name=r['name'],
                         source=r['source'], key=r['key'], external_id=r['external_id'], fdc_id=r['fdc_id'],
                         per100g={k: float(v) for k, v in r['values'].items() if v is not None and k != 'water'},
                         portions=r['portions'], is_canonical=r['is_canonical'], predecessor=r['predecessor']))
    ders = []
    for d in plan['derivations']:
        x = {k: v for k, v in d.items() if k not in ('copy_source', 'values')}
        x['per100g'] = {k: (float(v) if v is not None else None) for k, v in d['values'].items()}
        ders.append(x)
    return dict(_note='Generated by scripts/recalc/recalc.py emit. __tests__/unit/recalc053.test.ts runs every row '
                      'through validate.ts foodItemIssues(), and every portion_matching line through the real '
                      'macroResolver.ts correctPortionFromMeasures() (grams null = the parser\'s own guess stands).',
                inputs_sha256=sha, calc_version='recalc_v1',
                rows=rows, derivations=ders, portion_matching=portion_matching(plan),
                quarantined=[dict(id=o['old_id'], kind=o['kind'], successor=o['new_id'], reason=o['reason'])
                             for o in plan['old_rows']],
                aliases=[dict(alias=a['alias'], kind=a['kind'], target=a['target'], was=a['expect'])
                         for a in plan['aliases']])


# ── scripts/eval/search-check.sql expected ids ────────────────────────────────────────────────────────
def search_check(text, plan):
    """Rewrite the cases block: ids of superseded rows -> their successor; the founder-decision phrases get
    their rule and row from targets.csv (search_check column). Idempotent, so `check` can diff it."""
    start = text.index('WITH cases(q, want, rule) AS (VALUES')
    end = text.index('\nSELECT c.rule', start)
    block = text[start:end]
    succ = plan['successor']
    block = re.sub(r"'([0-9a-f-]{36})'::uuid", lambda m: f"'{succ.get(m.group(1), m.group(1))}'::uuid", block)
    over = {}
    by_key = {r['key']: r['id'] for r in plan['new_rows']}
    for d in plan['derivations']:
        for part in filter(None, (d.get('search_check') or '').split(';')):
            qq, rule = part.split('=')
            # a phrase that is itself a new key expects that key's own row (chawal -> the 'chawal' copy row);
            # anything else expects the derivation's canonical row (chai / masala chai -> the 'tea' row)
            over[qq] = (rule, by_key.get(qq, d['canonical_row']))
    for a in plan['aliases']:
        if a['kind'] == 'insert' and a['variant'] and a['variant'].startswith('alias_'):
            over.setdefault(a['alias'], ('alias', a['target']))
    for qq, (rule, rid) in over.items():
        pat = re.compile(r"\(" + re.escape(q(qq)) + r",(\s*)(?:'[0-9a-f-]{36}'::uuid|NULL),\s*'[a-z0-9]+'\)")
        if not pat.search(block):
            raise SystemExit(f'search-check.sql has no case line for {qq!r}; add it by hand once')
        block = pat.sub(lambda m: f"({q(qq)},{m.group(1)}'{rid}'::uuid, '{rule}')", block)
    return text[:start] + block + text[end:]


# ── review report ───────────────────────────────────────────────────────────────────────────────────
def _fmt(x, nd=0):
    if x is None:
        return '–'
    return f'{float(x):.{nd}f}'


def fmt_port(portions):
    return ', '.join(f"{p['description']} = {p['gramWeight']:g} g" for p in portions) if portions else 'no portion'


def first_portion(portions):
    return portions[0] if portions else None


# Named dals the founder's decision 1 covers in words but 053 leaves on raw INDB numbers (different recipe
# templates: a sour dal, a five-lentil mix, two rich restaurant dals, horsegram). The report recomputes them at
# the shipped medium-dal rule so the founder sees the gap; shipping them is a question, not a default.
DEFERRED_DALS = ('OSR143', 'BFP170', 'OSR144', 'ASC160', 'OSR139')
# Phrases the founder table lists (founder decisions 1-5 and the 2026-11-13 review's additions).
DECISION_PHRASES = ('dal', 'daal', 'dal tadka', 'mixed dal', 'moong dal', 'chana dal', 'kidney bean curry rajmah curry',
                    'rajma', 'chickpeas curry safed channa curry', 'chole', 'roti', 'chapati', 'chapati roti',
                    'wheat roti', 'phulka', 'roti chapati', 'cooked rice', 'cooked basmati rice', 'steamed white rice',
                    'boiled rice uble chawal', 'rice', 'chawal', 'chawal rice', 'tea', 'chai', 'masala chai',
                    'milk tea', 'eggs', 'poori', 'sev omapodi karapusa', 'dhokla')
BIG_CHANGE = 40.0   # percent per serving: flagged in the founder table


def _row(plan, rid):
    """(name, source, kcal, portions) of any row the report names: a 053 row, a snapshot row or an fts row."""
    for r in plan['new_rows']:
        if r['id'] == rid:
            return r['name'], r['source'], float(r['values']['kcal']), r['portions']
    for r in plan['snapshot']['rows']:
        if r['id'] == rid:
            return r['name'], r['source'], float(r['kcal']), r['portions']
    x = plan['snapshot'].get('fts_rows', {}).get(rid)
    if x:
        return x['name'], x['source'], float(x['kcal']), x['portions']
    return None


def _label(plan, rid):
    r = _row(plan, rid)
    return f"{r[0]} [{r[1]}] {r[2]:.0f}" if r else rid[:8]


def aliases_after(plan):
    m = {a['alias']: a['food_item_id'] for a in plan['snapshot']['aliases']}
    for a in plan['aliases']:
        if a['kind'] in ('repoint', 'insert'):
            m[a['alias']] = a['target']
        elif a['kind'] == 'retire':
            m.pop(a['alias'], None)
    return m


def fts_after(plan, phrase):
    """What the fts resolver offers for a phrase after 053, simulated from the snapshot: the verified exact key,
    else the 3 lowest ids among the verified rows 053 leaves alone, the successors of matching plan rows (copy
    rows keep their predecessor's name) and the no-predecessor rows whose new name matches. None = not probed."""
    f = plan['snapshot'].get('fts', {}).get(phrase)
    if f is None:
        return None
    by_key = {r['key']: r['id'] for r in plan['new_rows']}
    olds = {o['old_id'] for o in plan['old_rows']}
    if phrase in by_key:
        return 'exact', [by_key[phrase]]
    if f['exact'] and f['exact'] not in olds:
        return 'exact', [f['exact']]
    succ = plan['successor']
    cands = list(f['base']) + [succ[o] for o in f['plan'] if o in succ] + [
        r['id'] for r in plan['new_rows'] if r['predecessor'] is None and r['name'] in f['new_names']]
    return 'name search', sorted(cands)[:3]


def fts_before(plan, phrase):
    f = plan['snapshot'].get('fts', {}).get(phrase)
    if f is None:
        return None
    return ('exact', [f['exact']]) if f['exact'] else ('name search', f['live'])


def _mode_cell(plan, res):
    if res is None:
        return 'not probed'
    kind, ids = res
    if not ids:
        return 'no database row (USDA / estimate)'
    return f"{kind}: " + ' · '.join(_label(plan, i) for i in ids)


def conv_gap(plan):
    """How far the shipped energy (4P + 9F + 4 CHO_avl + 2 fibre) sits above INDB/IFCT's own convention for the
    same recalculated dish. Measured, not assumed: the spec's '+2.5%' was the IFCT average, but the 2 kcal/g fibre
    term weighs most on high-fibre legumes."""
    import statistics
    gaps = sorted(((float(d['values']['kcal']) / d['e_indb_conv'] - 1) * 100, d['variant_key'])
                  for d in plan['derivations'] if d.get('e_indb_conv'))
    return statistics.median(g for g, _ in gaps), gaps


def report_md(book, lab, params, plan, notes, sha):
    import method as M
    import recalc as R
    snap = plan['snapshot']
    rows = {r['id']: r for r in snap['rows']}
    usage = snap['usage_by_variant']
    by_var = {}
    for r in plan['new_rows']:
        by_var.setdefault(r['variant'], []).append(r)
    olds_by_var = {}
    for o in plan['old_rows']:
        olds_by_var.setdefault(o['variant'], []).append(o)
    sc = params['scores']
    med_gap, gaps = conv_gap(plan)
    top_gaps = ', '.join(f"{vk} +{g:.1f}%" for g, vk in sorted(gaps, reverse=True)[:4])
    sm = snap.get('saved_meals', {})
    L = []
    w = L.append
    w('# Migration 053: recalculated Indian dishes (recalc_v1), founder review')
    w('')
    w(f'Generated by `python3 -I scripts/recalc/recalc.py emit` (inputs_sha256 `{sha[:16]}…`); do not edit by hand. '
      f'Live snapshot: {snap["taken_at"]} (read-only), {snap["verified_count"]} verified rows. Spec: '
      '`.claude/plans/v1.2-recalc-053-spec.md` §(h) founder decisions of 2026-11-12 and its 2026-11-13 addendum.')
    w('')
    w('Energy is per 100 g as served, on the 4P + 9F + 4·CHO_avl + 2·fibre convention (FAO FNP 77). The '
      '"INDB conv." column is the same recalculated dish on INDB/IFCT\'s own convention (ingredient kcal summed). '
      f'Measured over the {len(gaps)} recipe rows, the shipped value is a median {med_gap:.1f}% above it '
      f'(range {gaps[0][0]:+.1f}% to {gaps[-1][0]:+.1f}%), not the 2–3% the spec assumed: the 2 kcal/g fibre term '
      f'weighs most on high-fibre legume and besan dishes ({top_gaps}). '
      '"Users" are real users who have logged one of the old rows (the eval account excluded; counts only).')
    w('')
    w('Past entries do not change. New logs get the new numbers, with one exception: a saved meal re-logs the '
      'numbers and food row it was saved with (savedEntriesStore.logSavedEntry), so it keeps the old values until '
      f"it is saved again ({sm.get('with_053_rows', 0)} of {sm.get('meals', 0)} real saved meals, "
      f"{sm.get('users_with_053_rows', 0)} users, carry a 053-quarantined row: {', '.join(sm.get('variants', [])) or 'none'}). "
      '053 leaves saved meals alone (the history fingerprints prove it); a refresh would be a later, reviewed step '
      'using the food_value_changes old → successor map. The 24-hour check after the push (spec §(e)5: new logs '
      "land on the new ids) must therefore leave out source = 'saved_entry'.")
    w('')
    w('Search modes: with RESOLVER_SEARCH=fts (live today) the resolver reads exact keys only, then the 3 lowest-id '
      'verified rows whose name matches; aliases are read only with RESOLVER_SEARCH=ranked. Every founder-decision '
      'value below that is reached through an alias (marked "alias") is therefore ranked-mode only; the fts column '
      'shows what the same phrase meets today. The fts column is simulated from the snapshot and checked for real '
      "by the migration's §12 (i) at push time.")
    w('')
    w('## What changes, in one table')
    w('')
    w('Keys, before values and servings are listed in the same order (one per key).')
    w('')
    w('| Dish (variant) | Keys | Before kcal/100 g | After | INDB conv. | Serving | Before → after per serving | Conf. | Users (entries) |')
    w('|---|---|---|---|---|---|---|---|---|')
    for d in plan['derivations']:
        vk = d['variant_key']
        news = by_var.get(vk, [])
        keys = ', '.join(f"`{r['key']}`" for r in news)
        befores = ' / '.join(_fmt(rows[r['predecessor']]['kcal']) if r['predecessor'] else 'new' for r in news)
        serv_label, before_s, after_s = serving(book, d, news, rows)
        us = usage.get(vk, {})
        w(f"| {vk} | {keys} | {befores} | **{_fmt(d['values']['kcal'])}** | "
          f"{_fmt(d.get('e_indb_conv'))} | {serv_label} | {before_s} → **{after_s}** | {d['confidence']} | "
          f"{us.get('users', 0)} ({us.get('entries', 0)}) |")
    w('')
    w('Quarantined with no replacement. The exact key stops serving; the phrase falls through to search. fts '
      'column: what the fts resolver offers instead (simulated). In ranked mode search_foods offers the nearest '
      'names and the candidate gate can keep a wrong one (the 2026-11-13 review found vada pav → the USDA medu '
      "vada, bajra roti → the wheat roti row, butter roti → Butter): the migration prints them at push (§12 "
      "'053 probe' notices) and only the matcher prompt stands between them and a wrong log.")
    w('')
    ubr = snap.get('usage_by_row', {})
    for o in plan['old_rows']:
        if o['kind'] == 'quarantine_only':
            r = rows[o['old_id']]
            us = ubr.get(o['old_id'], {})
            w(f"- `{r['key']}` ({' '.join(filter(None, [r['source'], r['external_id']]))}, {_fmt(r['kcal'])} kcal): "
              f"{o['why']}; real users {us.get('users', 0)} ({us.get('entries', 0)} entries); fts after 053: "
              f"{_mode_cell(plan, fts_after(plan, r['key']))}")
    w('')
    w('Aliases (ranked mode only):')
    w('')
    for a in plan['aliases']:
        if a['kind'] == 'repoint':
            w(f"- `{a['alias']}` follows {a['expect'][:8]} to its successor {a['target'][:8]}; note now ends "
              f"\"{a['note'].rsplit('; ', 1)[-1]}\"")
        elif a['kind'] == 'retire':
            w(f"- `{a['alias']}` (052, → {a['expect'][:8]}) retires: {a['note']}")
        else:
            w(f"- new `{a['alias']}` → {a['target'][:8]} ({a['note']})")
    w('')
    w('Portion changes (approved):')
    w('')
    for p in plan['portion_changes']:
        w(f"- {p['food_item_id'][:8]} ({p['variant']}): {json.dumps(p['before'])} → {json.dumps(p['after'])}, "
          f"approved by {p['approved_by']}")
    w('')
    w('## Founder-decision foods: before → after')
    w('')
    w('"Before" is the row real users\' entries of exactly this phrase landed on (most entries first) when there '
      'are any, else the row the phrase reached before 053. "After" is what the phrase reaches in ranked mode '
      f'(exact key, else alias). Changes per serving above {BIG_CHANGE:.0f}% are flagged.')
    w('')
    w('| Phrase | Real use | Before | Before per serving | After kcal/100 g | After per serving | Change | fts mode after 053 (live today) |')
    w('|---|---|---|---|---|---|---|---|')
    for cells in decision_rows(plan, rows):
        w('| ' + ' | '.join(cells) + ' |')
    w('')
    note = piece_logged_note(plan)
    if note:
        w(note)
        w('')
    w(f"Not shipped, for the record: {alt_values(book, params, plan)}")
    w('')
    open_questions(w, book, params, plan, rows)
    w('## Lab test (Chiplonkar & Agte 2007, 38 cooked dishes with an INDB recipe)')
    w('')
    p, i, rm = sc['pooled']['recalc'], sc['pooled']['indb'], sc['pooled']['recalc_recipe_maths_only']
    w('| Held-out (2-fold, every dish scored once) | Median abs. energy error | Mean bias | Within ±20% | Median abs. fat error, g |')
    w('|---|---|---|---|---|')
    w(f"| INDB raw | {i['med_abs']}% | {i['mean_signed']:+}% | {i['within20']}/{i['n']} | {i['fat_med_abs']} |")
    w(f"| recalc_v1 | **{p['med_abs']}%** | **{p['mean_signed']:+}%** | {p['within20']}/{p['n']} | {p['fat_med_abs']} |")
    w(f"| recalc_v1 at the lab's own moisture (recipe maths only) | {rm['med_abs']}% | {rm['mean_signed']:+}% | {rm['within20']}/{rm['n']} | – |")
    w('')
    w(f"Production parameters (refit on every lab dish): alpha = {params['production']['alpha']:.3f} g oil per g dry "
      f"matter; target moisture % {json.dumps(params['production']['w_star_pct'])}.")
    w('')
    w('Gates (`recalc.py validate`):')
    w('')
    for nn in notes:
        w(f'- {nn}')
    w('')
    w('## Per dish: recipe lines, oil, yield, lab score')
    w('')
    for d in plan['derivations']:
        dish_section(w, d, by_var.get(d['variant_key'], []), olds_by_var.get(d['variant_key'], []), rows,
                     usage.get(d['variant_key'], {}))
    w('## Not in 053 (spec §(b) batch 2)')
    w('')
    w('Composites (samosa, kachori, bonda, kadhi, pav bhaji, bhel), griddle batters (plain dosa, uttapam, chilla), '
      'poha (needs a cooking test), idli, gulab jamun, makki / bajra / jowar / ragi roti, toor dal templates, the '
      'remaining fritters, 40 soups with a dry-stock-cube bug, oats (no verified dry-oats row), chicken (founder: no '
      'default). Also held back after the 2026-11-13 review: the five named dals and the rice dal porridge in the '
      'answered questions above (founder 2026-11-13). A home weighing of roti, dal and rice (raw and cooked) is the '
      'best next check.')
    w('')
    w('Sources: INDB (Vijayakumar et al., Curr Dev Nutr 2024; CC BY 4.0 paper, repo commit fbdb62b, derived values '
      'only), IFCT 2017 (ICMR-NIN, derived values only), lab values from Chiplonkar & Agte, Asia Pac J Clin Nutr '
      '2007;16(2):227-239.')
    return '\n'.join(L) + '\n'


def open_questions(w, book, params, plan, rows):
    """The content decisions the 2026-11-13 review raised, each with the founder's answer of 2026-11-13, then what
    the resolver does with the portions those answers fixed. Every number is computed here from the plan, the
    snapshot or the recipe engine, so the text stays true when the inputs change."""
    import method as M
    import recalc as R
    P = R.prod_params(params)
    der = {d['variant_key']: d for d in plan['derivations']}
    news = {r['key']: r for r in plan['new_rows']}
    roti = der['roti_plain']
    rk = float(roti['values']['kcal'])
    g_roti = news['roti']['portions'][0]['gramWeight']
    g_ph = news['phulka']['portions'][0]['gramWeight']
    rice = news['cooked rice']
    rk_rice = float(rice['values']['kcal'])
    g_rice = rice['portions'][0]['gramWeight']
    old_cr = rows[rice['predecessor']]
    g_old = first_portion(old_cr['portions'])['gramWeight']
    ref = rows[news['cooked white rice']['predecessor']]
    g_ref = first_portion(ref['portions'])['gramWeight']
    dal_rows = [r for r in plan['new_rows']
                if next(d for d in plan['derivations'] if d['id'] == r['derivation_id'])['cooking_class'] == 'legume_curry']
    dk = float(der['dal_mixed']['values']['kcal'])
    dport = news['dal']['portions']
    g_kat = dport[0]['gramWeight']
    g_bowl = dport[1]['gramWeight']
    chai = der['chai_standard']
    ck = float(chai['values']['kcal'])
    g_cup = news['tea']['portions'][0]['gramWeight']
    chole = news['chole']
    w('## Founder questions from the 2026-11-13 review: answered 2026-11-13')
    w('')
    w('Each question as the review put it, then the answer (founder 2026-11-13, backed by '
      '`docs/research/reports/Indian portion sizes and cooking yields.md`, "Migration 053 imports the US cup three '
      'times"). Portion changes are logged as `portion_change` rows approved by "founder 2026-11-13".')
    w('')
    w(f"1. **Roti value.** The shipped plain phulka is {rk:.2f} kcal/100 g, not the spec's \"about 239\" "
      f"({(rk / 239 - 1) * 100:+.1f}%): 053 drops the ghee LINE and brings the dough to the class moisture (35.3% "
      f"water), where the spec subtracted the ghee's weight. **Answered: {rk:.2f} accepted** for the roti family "
      f"(roti, chapati, chapati roti, wheat roti, the 'roti chapati' alias), still 1 piece = {g_roti:g} g "
      f"({rk * g_roti / 100:.1f} kcal). **Phulka gets its own size:** the exact key 'phulka' on a copy row "
      f"{news['phulka']['id'][:8]} with the same per-100 g numbers and 1 piece = {g_ph:g} g "
      f"({rk * g_ph / 100:.1f} kcal; NIN's phulka is 80). Its 052 alias (→ the chapati row) retires the way "
      "'chawal' did; the down script restores it.")
    w(f"2. **Rice cup.** The rice family carried USDA's 1 cup = {g_ref:g} g (a cup of medium-grain rice, FDC "
      "168930), against about 158 g for cooked long-grain rice and the resolver's own \"1 cup cooked rice ≈ 160 g\". "
      f"**Answered: every rice row uses {fmt_port(rice['portions'])}**, still {rk_rice:g} kcal/100 g: cooked rice, "
      "cooked basmati rice, steamed white rice, boiled rice (uble chawal), the 'chawal' key and the 052 'rice' "
      f"alias. A cup is now {rk_rice * g_rice / 100:.0f} kcal ('cooked rice' was {float(old_cr['kcal']) * g_old / 100:.0f} "
      f"for {g_old:g} g; the 'rice' alias row {float(ref['kcal']) * g_ref / 100:.0f} for {g_ref:g} g). 053 changes no "
      f"row in place, so the 'rice' alias row {ref['id'][:8]} ('cooked white rice') is **superseded** like every "
      f"other rice key (same_food_revised, numbers unchanged): its copy row {news['cooked white rice']['id'][:8]} "
      "takes the key 'cooked white rice' with the new portions, and the aliases rice / white rice / steamed rice / "
      "chawal rice / chawal cooked rice follow it (052's reordered-words rule holds: an alias serves its row's own "
      "successor). Leaving it verified would have kept 186 g under that key and in the 052 aliases, and kept it the "
      "row a USDA 168930 match reuses (the resolver takes the oldest verified row for an fdc_id); the §12 check now "
      "also refuses any verified FDC 168930 row with other portions.")
    w(f"3. **Dal portion.** The default dal ({dk:.1f} kcal/100 g) shipped with inherited portions that disagreed "
      "(a 240 g US cup on daal / dal tadka / moong dal / chana dal, nothing on dal / mixed dal / rajma / chole). "
      f"**Answered: one dal-family portion on all {len(dal_rows)} dal and legume-curry rows**, {fmt_port(dport)}: "
      f"a katori of the default dal is {dk * g_kat / 100:.0f} kcal, a bowl {dk * g_bowl / 100:.0f}. What the "
      "resolver does with 'katori' and 'bowl' is in the next section.")
    w(f"4. **'chole'.** The word reached no 053 row (the recalculated row's key is 'chickpeas curry safed channa "
      "curry'; fts found nothing, ranked search offered Cho-cho-marrow / Choliya pulao / Pak Choi). **Answered: "
      f"exact key 'chole'** on a copy row {chole['id'][:8]} of the recalculated chickpea curry "
      f"({float(der['curry_chole']['values']['kcal']):.1f} kcal/100 g, dal-family portions), in every search mode. "
      "This applies founder decision 2 (chole like the lab, about 70). It is a founder content decision, like "
      "chaas, not chosen from eval results.")
    dals = []
    for code in DEFERRED_DALS:
        pr = M.predict(book, code, 'legume_curry', P)
        dals.append(f"{book.name(code)} ({code}) {float(book.pub[code]['energy_kcal']):.1f} → "
                    f"{float(R.per100_from(pr)['kcal']):.1f}")
    w("5. **The other named dals.** They keep raw INDB numbers; at the medium rule they would be: "
      + '; '.join(dals) + ". **Answered: batch 2** (different templates: a sour dal, a five-lentil mix, two rich "
      "restaurant dals, horsegram).")
    w("6. **Rice dal porridge (INDB BFP554)** is a sweet rice-moong-jaggery porridge whose name carries 'dal', "
      "'chawal' and 'khichdi'. **Answered: it stays out** (quarantined, 0 users).")
    w(f"7. **Chai (new, 2026-11-13).** The standard home chai was 120 g milk + 120 g water + 8 g sugar per 240 ml "
      "US cup (49 kcal/100 g, 118 a cup, +57% vs NIN's 75). **Re-based per 120 ml Indian teacup:** 60 g whole "
      f"milk (same IFCT L002 line) + 60 g water + 8 g sugar (2 tsp) = {chai['batch_g']:g} g, **{ck:.2f} kcal/100 g, "
      f"{ck * g_cup / 100:.1f} a cup** (NIN 75; Pune lab tea 63 kcal/100 g, 76 per 120 g). Portions "
      f"{fmt_port(news['tea']['portions'])}. Key 'tea' and the aliases chai / masala chai / milk tea unchanged.")
    w('')
    portion_section(w, plan)


def portion_section(w, plan):
    """What correctPortionFromMeasures (macroResolver.ts) gives a hit on these rows, from the Python twin; the jest
    test checks every cell against the real function."""
    pm = portion_matching(plan)
    fams = [f for f, _ in PORTION_FAMILIES]
    w('## How the resolver matches these portions (as of 2026-11-13)')
    w('')
    w('On an exact-key, alias or memory hit the matcher never runs; `correctPortionFromMeasures` '
      '(`supabase/functions/_shared/macroResolver.ts`) turns the parsed quantity phrase into grams from the stored '
      'portions. Its `UNIT_SYNONYMS` folds bowl / cup / glass / mug into the FIRST portion whose description says '
      '"cup", and piece / slice / item / pc into the first that says piece / item / slice. **katori, plate and '
      'cutting are not units there**: for them the parser\'s own gram guess stands (its prompt says "1 katori/small '
      'bowl ≈ 150g", "1 plate of a single cooked dish ≈ 200g"). Descriptions were chosen for that: the dal bowl is '
      '"1 bowl (1 cup)" so a bowl reaches 240 g, and the chai mug does not say "cup" (it would shadow the 128 g cup). '
      'Grams per phrase ("parser" = the parser\'s guess stands; checked against the real function by '
      '`__tests__/unit/recalc053.test.ts`):')
    w('')
    w('| Phrase | ' + ' | '.join(f"{f} (`{k}`)" for f, k in PORTION_FAMILIES) + ' |')
    w('|---|' + '---|' * len(fams))
    for ph in PORTION_PHRASES:
        cells = []
        for f in fams:
            g = next(x['grams'] for x in pm if x['family'] == f and x['phrase'] == ph)
            cells.append('parser' if g is None else f'{g:g} g')
        w(f'| "{ph}" | ' + ' | '.join(cells) + ' |')
    w('')
    w('Stored portions: ' + '; '.join(f"{f} {fmt_port(next(x['portions'] for x in pm if x['family'] == f))}"
                                      for f in fams) + '.')
    w('')
    def gs(fam, ph):
        g = next(x['grams'] for x in pm if x['family'] == fam and x['phrase'] == ph)
        return "the parser's guess" if g is None else f'{g:g} g'

    def stored(fam, word):
        port = next(x['portions'] for x in pm if x['family'] == fam)
        return next((f"{p['gramWeight']:g} g" for p in port if word in p['description']), 'none')

    w('What the founder asked for and what the resolver gives today:')
    w('')
    w(f'- dal: "1 katori" → {gs(fams[0], "1 katori")} (stored {stored(fams[0], "katori")}; the parser\'s hint is '
      f'also 150 g), "1 bowl" → {gs(fams[0], "1 bowl")} (stored {stored(fams[0], "bowl")}); but "1 cup", "1 glass" '
      f'and "1 small bowl" also → {gs(fams[0], "1 small bowl")}: one cup class, so a small bowl reads as the large size.')
    w(f'- chai: "1 cup" → {gs(fams[2], "1 cup")}; "1 mug" → {gs(fams[2], "1 mug")}, not the stored '
      f'{stored(fams[2], "mug")} (mug folds into cup and the first cup portion wins); "1 cutting" → '
      f'{gs(fams[2], "1 cutting")}, not the stored {stored(fams[2], "cutting")} (the parser\'s prompt still says '
      'tea is "one ~240ml cup").')
    w(f'- rice: "1 cup" / "1 bowl" → {gs(fams[1], "1 bowl")}; "1 plate" → {gs(fams[1], "1 plate")}, not the stored '
      f'{stored(fams[1], "plate")} (its hint is about 200 g, or 350-450 g if it reads a full meal); "1 katori" → '
      f'{gs(fams[1], "1 katori")}, not the stored {stored(fams[1], "katori")} (hint 150 g).')
    roti = next(r for r in plan['new_rows'] if r['key'] == 'roti')
    rk = float(roti['values']['kcal'])
    g_ph = float(stored(fams[4], 'piece').split()[0])
    med = next((x['median_g'] for x in plan['snapshot'].get('phrase_usage', {}).get('roti') or []
                if x['food_item_id'] not in ('none', 'private')), None)
    w(f'- roti / phulka: only "N pieces" reaches the stored piece ("2 pieces" of roti → {gs(fams[3], "2 pieces")}, '
      f'of phulka → {gs(fams[4], "2 pieces")}). "2 roti", "2 rotis", "3 chapati" and "2 phulka" → '
      f'{gs(fams[4], "2 phulka")}: a piece is read only when the quantity text itself says piece / slice / item / pc, '
      'and the parser usually keeps the food\'s own word ("2 rotis"). For the roti family that guess is the parser\'s '
      f'"roti/chapati 40g" hint, the same {stored(fams[3], "piece")} as the stored piece'
      + (f' (real `roti` entries: median {float(med):g} g)' if med else '') + '. The parser has no phulka hint, so '
      f'"2 phulka" most likely logs 2 × 40 g = {2 * 40 * rk / 100:.0f} kcal, not 2 × {g_ph:g} g = '
      f'{2 * g_ph * rk / 100:.0f}: decision 4\'s {g_ph:g} g piece is reached today only by "N pieces".')
    w('')
    w('**Phase 5 follow-ups (resolver, not 053; `macroResolver.ts` was not edited here):** add katori, plate and '
      'cutting as units matched to portions of the same name; split mug (and glass) from cup so "1 mug chai" reaches '
      '200 g; read "small bowl" as a katori; read a count followed by the row\'s own food word (roti / chapati / '
      'phulka: "2 rotis", "2 phulka") as that many pieces of the row; add "phulka 30g" to `GRAM_HINTS_PROMPT` '
      '(until then "2 phulka" keeps the 40 g roti guess); bring the parser hints in line with these rows (tea "one '
      '~240ml cup", "1 glass = 240-250ml", "1 cup cooked rice ≈ 160g"); and on a USDA match of FDC 168930 the '
      'matcher still sees USDA\'s own portion list (1 cup = 186 g) for its gram check, not the stored 158 g.')
    w('')


def serving(book, d, news, rows):
    """(label, before kcal per serving, after kcal per serving), before listed per key in `news` order. A stored
    portion wins; else INDB's own piece (cooked batch / pieces) or the report serving from targets.csv (not stored
    anywhere)."""
    t = next(x for x in _targets() if x['variant_key'] == d['variant_key'])
    rs = t['report_serving']
    after_k = float(d['values']['kcal'])
    preds = [rows[r['predecessor']] if r['predecessor'] else None for r in news]
    if rs == 'portion':
        pn = first_portion(news[0]['portions']) if news else None
        g_new = pn['gramWeight'] if pn else None
        befores = []
        for r in preds:
            if r is None:
                befores.append('new')
                continue
            po = first_portion(r['portions'])
            g_old = po['gramWeight'] if po else g_new
            befores.append(f"{float(r['kcal']) * g_old / 100:.0f} ({g_old:g} g)")
        # a key with its own first portion (phulka's 30 g piece in the roti family) gets its own after value
        firsts = [first_portion(r['portions']) for r in news]
        if len({json.dumps(p, sort_keys=True) for p in firsts}) > 1:
            label = ' / '.join(f"{p['description']} = {p['gramWeight']:g} g" if p else '–' for p in firsts)
            afters = ' / '.join(f"{after_k * p['gramWeight'] / 100:.0f}" if p else '–' for p in firsts)
            return label, ' / '.join(befores) or 'new', afters
        return (f"{pn['description']} = {g_new:g} g" if pn else '–', ' / '.join(befores) or 'new',
                f"{after_k * g_new / 100:.0f}")
    if rs == 'piece:indb':
        s = book.serv[d['indb_code']]
        pieces = float(s['no_of_servings']) * float(s['size_of_servings'])
        # Same grams on both sides: the old rows carry no portion, so "before" is what one piece of this weight
        # logged at the old per-100 g number (INDB's own per-piece figure, raw weight with the frying oil, would
        # say more about INDB than about what users were served).
        g_new = d['cooked_w'] / pieces
        befores = [f"{float(r['kcal']) * g_new / 100:.0f}" if r else 'new' for r in preds]
        return (f"1 {s['servings_unit']} ≈ {g_new:.0f} g (INDB recipe yield ÷ {pieces:g} pieces; report only)",
                ' / '.join(befores), f"{after_k * g_new / 100:.0f}")
    _, g, label = rs.split(':', 2)
    g = float(g)
    befores = [f"{float(r['kcal']) * g / 100:.0f}" if r else 'new' for r in preds]
    return (f"{label} = {g:g} g (report only)", ' / '.join(befores) or 'new', f"{after_k * g / 100:.0f}")


_T = None


def _targets():
    global _T
    if _T is None:
        import csv
        import os
        with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'targets.csv'), newline='',
                  encoding='utf-8') as fh:
            _T = list(csv.DictReader(fh))
    return _T


def decision_rows(plan, rows):
    """One founder-table line per phrase: real use, what it served before (from real entries when there are any),
    what it serves after in ranked mode, the per-serving change and what fts mode offers after 053."""
    snap = plan['snapshot']
    by_key = {r['key']: r for r in plan['new_rows']}
    al_after = aliases_after(plan)
    al_before = {a['alias']: a['food_item_id'] for a in snap['aliases']}
    usage = snap.get('phrase_usage', {})
    out = []
    for ph in DECISION_PHRASES:
        f = snap.get('fts', {}).get(ph) or {}
        if ph in by_key:
            after_id, how = by_key[ph]['id'], 'exact key'
        elif ph in al_after:
            after_id, how = al_after[ph], 'alias'
        elif f.get('exact'):
            after_id, how = f['exact'], 'exact key'
        else:
            after_id, how = None, None
        # before: where real entries of this phrase landed, else what the phrase reached before 053
        us = usage.get(ph) or []
        n_e, n_u = sum(x['entries'] for x in us), sum(x['users'] for x in us)
        landed = next((x for x in us if x['food_item_id'] not in ('none', 'private')), None)
        if landed:
            before_id = landed['food_item_id']
            before_how = f"{landed['entries']} of {n_e} entries"
        elif ph in by_key and by_key[ph]['predecessor']:
            before_id, before_how = by_key[ph]['predecessor'], 'exact key'
        elif ph in al_before:
            before_id, before_how = al_before[ph], 'alias (ranked only)'
        elif f.get('exact'):
            before_id, before_how = f['exact'], 'exact key'
        else:
            before_id = None
            before_how = (f"no row ({n_e} of {n_e} entries estimated)" if n_e else 'no row (search / AI)')
        a = _row(plan, after_id) if after_id else None
        b = _row(plan, before_id) if before_id else None
        pa = first_portion(a[3]) if a else None
        pb = first_portion(b[3]) if b else None
        g_after = pa['gramWeight'] if pa else None
        g_before = pb['gramWeight'] if pb else g_after
        a_serv = f"{a[2] * g_after / 100:.0f} ({pa['description']} = {g_after:g} g)" if a and pa else 'no portion'
        b_serv = (f"{b[2] * g_before / 100:.0f} ({g_before:g} g)" if b and g_before else 'no portion')
        if a and b and g_after and g_before:
            ch = (a[2] * g_after) / (b[2] * g_before) * 100 - 100 if b[2] else None
        elif a and b:
            ch = (a[2] / b[2] * 100 - 100) if b[2] else None      # same grams either side: the per-100 g change
        else:
            ch = None
        ch_s = '–' if ch is None else (f"**{ch:+.0f}%**" if abs(ch) > BIG_CHANGE else f"{ch:+.0f}%")
        out.append([f"`{ph}`" + (' (alias)' if how == 'alias' else ''),
                    f"{n_e} / {n_u}" if n_e else '0',
                    (f"{b[0]} [{b[1]}], {before_how}" if b else before_how),
                    f"{_fmt(b[2]) if b else '–'}, {b_serv if b else '–'}",
                    f"**{_fmt(a[2])}**" if a else '–', f"**{a_serv}**" if a else '–', ch_s,
                    _mode_cell(plan, fts_after(plan, ph))])
    return out


def piece_logged_note(plan):
    """Breads: the founder table's per-serving columns apply the stored piece, which the resolver reaches only for an
    "N pieces" label (see portion_section). For every founder phrase whose row after 053 is served by the piece and
    whose real entries landed on a row, restate the change at the median grams those entries were logged at."""
    usage = plan['snapshot'].get('phrase_usage', {})
    by_key = {r['key']: r for r in plan['new_rows']}
    al_after = aliases_after(plan)
    piece = re.compile(UNIT_SYNONYMS[1][1], re.I)
    cells, assumed = [], []
    for ph in DECISION_PHRASES:
        after_id = by_key[ph]['id'] if ph in by_key else al_after.get(ph)
        a = _row(plan, after_id) if after_id else None
        pa = first_portion(a[3]) if a else None
        if not pa or not piece.search(pa['description']):
            continue
        landed = next((x for x in usage.get(ph) or [] if x['food_item_id'] not in ('none', 'private')), None)
        b = _row(plan, landed['food_item_id']) if landed and landed.get('median_g') else None
        if not b or not b[2]:
            continue
        g = float(landed['median_g'])
        cells.append(f"`{ph}` {g:g} g: {b[2] * g / 100:.0f} → {a[2] * g / 100:.0f} ({a[2] / b[2] * 100 - 100:+.0f}%)")
        pb = first_portion(b[3])
        if pb and piece.search(pb['description']) and pb['gramWeight'] != pa['gramWeight']:
            assumed.append(f"`{ph}` ({pb['gramWeight']:g} g)")
    if not cells:
        return ''
    return ('**Breads: "per serving" above assumes the stored piece was applied.** The resolver applies a piece '
            'portion only when the quantity text itself says piece / slice / item / pc ("2 pieces"); the parser '
            'usually keeps the food\'s own word in the label ("2 rotis", "3 chapati"; live entries checked '
            '2026-11-13), and then its gram guess stands on both sides (its prompt says "roti/chapati 40g") and only '
            'the per-100 g number changes. At the median grams real entries of each phrase were logged at: '
            + '; '.join(cells) + '.'
            + (f" The per-serving change for {', '.join(assumed)} holds only for entries that said \"N pieces\" and "
               'got that stored piece.' if assumed else ''))


def alt_values(book, params, plan):
    import method as M
    import recalc as R
    P = R.prod_params(params)
    roti = R.per100_from(M.predict(book, 'ASC096', 'flatbread_dry', P))
    P2 = dict(P, rule=dict(P['rule'], grain_boiled='keep'))
    rice = R.per100_from(M.predict(book, 'ASC113', 'grain_boiled', P2))
    plain = float(next(d for d in plan['derivations'] if d['variant_key'] == 'roti_plain')['values']['kcal'])
    g_cup = next(r for r in plan['new_rows'] if r['key'] == 'cooked rice')['portions'][0]['gramWeight']
    return (f"roti with INDB's 1 tsp ghee = {roti['kcal']} kcal/100 g ({float(roti['kcal']) * 0.4:.0f} per 40 g piece); "
            f"the shipped plain phulka is {plain:.2f} ({plain * 0.4:.1f} per piece), not the spec's ~239 (question 1, "
            f"accepted 2026-11-13); INDB boiled rice recalculated (keep rule, no anchor) = {rice['kcal']} kcal/100 g "
            f"({float(rice['kcal']) * g_cup / 100:.0f} per {g_cup:g} g cup; the founder chose 130).")


def dish_section(w, d, news, olds, rows, us):
    v = d['values']
    w(f"### {d['variant_key']}: {d.get('indb_name') or d['recipe_ref']}")
    w('')
    w(f"{d['review_note']} Approved by {d['approved_by']}. Confidence {d['confidence']}.")
    w('')
    for kc in d.get('key_copies', []):
        w(f"Extra key {', '.join(f'`{k}`' for k in kc['keys'])} ({kc['variant_key']}): {kc['review_note']} "
          f"Approved by {kc['approved_by']}.")
        w('')
    w(f"- New rows: " + ', '.join(f"`{r['key']}` {r['id'][:8]} ({r['source']}, name \"{r['name']}\")" for r in news))
    w(f"- Replaces: " + (', '.join(f"{o['old_id'][:8]} {rows[o['old_id']]['source']} {_fmt(rows[o['old_id']]['kcal'], 2)} "
                                  f"({o['relation']})" for o in olds) or 'nothing (new row)'))
    if len(news) > 1:
        for r in news:
            old = rows[r['predecessor']] if r['predecessor'] else None
            po, pn = (first_portion(old['portions']) if old else None), first_portion(r['portions'])
            w(f"  - `{r['key']}`: " + (f"{_fmt(old['kcal'], 2)} → " if old else 'new → ') + f"{v['kcal']} kcal/100 g; "
              f"portion " + (f"{po['description']} = {po['gramWeight']:g} g" if po else 'none') + ' → '
              + (f"{pn['description']} = {pn['gramWeight']:g} g" if pn else 'none'))
    w(f"- Real users who logged the old rows: {us.get('users', 0)} ({us.get('entries', 0)} entries)")
    w(f"- Per 100 g: {v['kcal']} kcal, P {v['protein']}, C {v['carbs']}, F {v['fat']}, fibre {v['fiber']}"
      + (f", water {v['water']}%" if v.get('water') is not None else '')
      + (f"; INDB convention {d['e_indb_conv']} kcal" if d.get('e_indb_conv') is not None else ''))
    if d['method'] == 'copy_reference':
        cs = d['copy_source']
        w(f"- Copied unchanged from {cs['id'][:8]} \"{cs['name']}\" ({cs['source']} {cs['external_id'] or ''}"
          f"{' FDC ' + cs['fdc_id'] if cs['fdc_id'] else ''}).")
        w('')
        return
    if d['method'] == 'recipe_recalc':
        w(f"- Moisture: {d['moisture_rule']} ({d['moisture_basis']}"
          + (f", target {d['moisture_target_pct']}% water" if d['moisture_target_pct'] is not None else '') + ')')
        w(f"- Weights: raw {d['raw_w']} g, kept {d['kept_w']} g, cooked {d['cooked_w']} g, yield factor {d['yield_factor']}"
          + (f"; frying oil removed {d['frying_oil_removed_g']} g, absorbed {d['absorbed_oil_g']} g (alpha {d['alpha']})"
             if d['frying_oil_removed_g'] else ''))
        fc = d['fat_components']
        w(f"- Fat per 100 g: {fc['ingredient']} from ingredients + {fc['added']} added (of which {fc['absorbed']} absorbed frying oil)"
          + (f"; with no added fat the dish would be {d['base_per_100g']['kcal']} kcal" if d['base_per_100g'] else ''))
        ip = d['indb_published']
        w(f"- INDB as published (raw weight): {ip['kcal']} kcal, P {ip['protein']}, C {ip['carbs']}, F {ip['fat']}")
        if d['referee']:
            r = d['referee']
            anchored = d['moisture_basis'].startswith('lab:')
            w(f"- Lab dish {r['lab_id']} \"{r['lab_dish']}\" ({r['match']}): {r['lab_kcal']:.0f} kcal, water "
              f"{r['lab_water_g']}%, fat {r['lab_fat_g']} g. Held-out error {r['heldout_err_pct']:+}% "
              + ("(the class-average rule, fitted without this dish; it failed for this class, hence the anchor) "
                 if anchored else "(class rule fitted without this dish) ")
              + f"vs INDB raw {r['indb_err_pct']:+}%. The row 053 ships: {r['production_err_pct']:+}% "
              f"({r['production_basis']}).")
    else:
        w(f"- Keep rule: all listed water stays (yield factor 1); batch {d['batch_g']} g for one cup.")
    w('')
    w('| # | Code | Ingredient (as written) | g | water g | role |')
    w('|---|---|---|---|---|---|')
    for ln in d['lines']:
        w(f"| {ln['i']} | {ln['code']} | {ln['name']} ({ln['as_written']}) | {ln['g']} | {ln['water_g']} | {ln['role']} |")
    w('')
