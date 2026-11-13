// B2: an edited meal's foods are paired with its previous entries by name,
// or — for a food the user renamed — by the short ref the model echoes as
// prev_id, so a rename keeps its rescale (and any hand-set numbers).

import { matchPreviousEntries, prevRef } from '../../supabase/functions/_shared/editMatch';

const roti = { name: 'Roti', calories: 240 };
const dal = { name: 'Dal', calories: 180 };
const rice = { name: 'Rice', calories: 200 };

describe('prevRef', () => {
  it('numbers entries from p1', () => {
    expect([0, 1, 9].map(prevRef)).toEqual(['p1', 'p2', 'p10']);
  });
});

describe('matchPreviousEntries', () => {
  it('matches by normalized name, as before', () => {
    expect(matchPreviousEntries([{ name: 'dal ' }, { name: 'ROTI' }], [roti, dal])).toEqual([dal, roti]);
  });

  it("matches a renamed food by the model's prev_id", () => {
    expect(matchPreviousEntries([{ name: 'Chapati', prev_id: 'p1' }, { name: 'Dal' }], [roti, dal]))
      .toEqual([roti, dal]);
  });

  it('prefers an exact name over a conflicting prev_id', () => {
    // The model swapped the refs; the names are unambiguous.
    expect(matchPreviousEntries([{ name: 'Roti', prev_id: 'p2' }, { name: 'Dal', prev_id: 'p1' }], [roti, dal]))
      .toEqual([roti, dal]);
  });

  it('never lets a prev_id take an entry another food already matched', () => {
    expect(matchPreviousEntries([{ name: 'Roti' }, { name: 'Paratha', prev_id: 'p1' }], [roti, dal]))
      .toEqual([roti, undefined]);
    // Two renamed foods pointing at one ref: only the first gets it.
    expect(matchPreviousEntries([{ name: 'Chapati', prev_id: 'p1' }, { name: 'Phulka', prev_id: 'p1' }], [roti]))
      .toEqual([roti, undefined]);
  });

  it('ignores refs that are malformed or out of range', () => {
    const foods = [
      { name: 'A', prev_id: 'p0' },
      { name: 'B', prev_id: 'p4' },
      { name: 'C', prev_id: 'x1' },
      { name: 'D', prev_id: 1 },
      { name: 'E', prev_id: ' P3 ' },
    ];
    expect(matchPreviousEntries(foods, [roti, dal, rice])).toEqual([undefined, undefined, undefined, undefined, rice]);
  });

  it('lets several foods share a name match, as the old map did', () => {
    expect(matchPreviousEntries([{ name: 'Roti' }, { name: 'roti' }], [roti])).toEqual([roti, roti]);
  });

  it('matches nothing without previous entries (a fresh log)', () => {
    expect(matchPreviousEntries([{ name: 'Roti', prev_id: 'p1' }], [])).toEqual([undefined]);
  });
});
