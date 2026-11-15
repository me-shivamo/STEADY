import { readFileSync } from 'fs'
import { join } from 'path'

import {
  checkDatasets, countRealUsers, DATASETS, EVAL_DIR, formatDatasets, formatRealUsers, interceptKind, KINDS, parseCsv,
} from '../../scripts/eval/calibration-intercept-check'

// WP0 gate tooling (scripts/eval/calibration-intercept-check.ts). The offline gate runs here too, so a change
// to _shared/portionCalibration.ts that starts swallowing a dataset food log fails CI, not just the script.

describe('offline gate: the synthetic datasets', () => {
  it('0 intercepts over every text of the four sets, and every case was read', () => {
    const r = checkDatasets()
    expect(r.hits).toEqual([])
    for (const p of r.perFile) {
      const cases = JSON.parse(readFileSync(join(EVAL_DIR, p.file), 'utf8')) as unknown[]
      expect(p.texts).toBe(cases.length)
      expect(p.texts).toBeGreaterThan(0)
    }
    expect(r.perFile.map((p) => p.file)).toEqual([...DATASETS])
    expect(formatDatasets(r)).toMatch(/PASS: 0 intercepts/)
  })

  it('refuses the held-out set before reading anything', () => {
    expect(() => checkDatasets(['dataset-v4.json'])).toThrow(/held-out/)
    expect(() => checkDatasets(['dataset-intent.json', 'DATASET-V4.json'])).toThrow(/held-out/)
  })
})

describe('interceptKind', () => {
  it.each([
    ['my cup is 350 ml', 'set_amount'],
    ['I drink 350 ml of milk in one cup', 'set_amount'],
    ['my katori is small', 'set_size_word'],
    ['my roti is 50 g', 'set_piece'],
    ['forget my cup size', 'revoke_unit'],
    ['forget my portion sizes', 'revoke_all'],
    ['what are my portion sizes', 'list'],
  ])('%p -> %s', (text, kind) => expect(interceptKind(text)).toBe(kind))

  it.each(['2 rotis with dal', 'my lunch was 2 rotis', 'a cup of chai', 'I had 200 g rice in a bowl', '', null])(
    'a food log or anything else is not intercepted: %p', (text) => expect(interceptKind(text)).toBeNull())
})

describe('--real-users counting (counts only)', () => {
  it('parses the CLI csv: quoted commas, doubled quotes, embedded newlines, CRLF', () => {
    expect(parseCsv('u,logged,text\n1,true,"a,""b""\nline2"\r\n2,false,plain\n')).toEqual([
      ['u', 'logged', 'text'], ['1', 'true', 'a,"b"\nline2'], ['2', 'false', 'plain'],
    ])
    expect(parseCsv('u,logged,text\n3,f,\n')).toEqual([['u', 'logged', 'text'], ['3', 'f', '']])
  })

  const SECRET = ['my cup is 350 ml', 'my katori is small', '2 rotis with dal', 'forget my cup size', 'my roti is 50 g']
  const rows = [
    ['1', 'false', SECRET[0]], ['1', 'true', SECRET[2]], ['2', 'true', SECRET[1]],
    ['3', 'false', SECRET[3]], ['3', 't', SECRET[4]], ['4', 'f', 'poha'],
  ]

  it('counts messages, users, intercepts by kind, and intercepted food logs', () => {
    expect(countRealUsers(rows)).toEqual({
      messages: 6, users: 4, loggedMessages: 3, intercepted: 4, interceptedUsers: 3,
      byKind: { set_amount: 1, set_size_word: 1, set_piece: 1, revoke_unit: 1, revoke_all: 0, list: 0 },
      interceptedLogged: 2, interceptedNotLogged: 2,
    })
    expect(Object.keys(countRealUsers(rows).byKind)).toEqual([...KINDS])
  })

  it('neither the report nor the printed text carries any message text', () => {
    const r = countRealUsers(rows)
    const out = JSON.stringify(r) + formatRealUsers(r)
    for (const t of [...SECRET, 'poha']) expect(out).not.toContain(t)
    expect(formatRealUsers(r)).toMatch(/RESULT: REVIEW \(2 message/)
    expect(formatRealUsers(countRealUsers([['1', 'false', SECRET[0]]]))).toMatch(/RESULT: PASS/)
  })

  it('a malformed row fails without quoting any cell', () => {
    const bad = (r: string[][]) => { try { countRealUsers(r); return '' } catch (e) { return (e as Error).message } }
    const m1 = bad([['1', 'false']])
    const m2 = bad([['1', 'my cup is 350 ml', 'x']])
    expect(m1).toMatch(/2 columns/)
    expect(m2).toMatch(/non-boolean/)
    expect(m1 + m2).not.toContain('my cup')
  })
})
