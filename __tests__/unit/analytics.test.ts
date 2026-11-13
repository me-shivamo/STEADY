// Helpers behind the Phase 9 analytics: food_corrected's direction/size
// buckets and macro-source labels (B8), and the closed error codes that let a
// failed log be counted by cause (B6, B7).

import {
  changeBucket,
  changeDirection,
  correctionBasis,
  macroSourceBucket,
  mealMacroSource,
  errorReason,
} from '../../src/utils/analytics';
import { classify, toUserMessage } from '../../src/utils/errors';

describe('changeDirection', () => {
  it('compares kcal', () => {
    expect(changeDirection(100, 120)).toBe('up');
    expect(changeDirection(100, 80)).toBe('down');
    expect(changeDirection(100, 100)).toBe('none');
  });

  it('ignores float noise below 0.1 kcal', () => {
    expect(changeDirection(150, 149.99999)).toBe('none');
  });
});

describe('changeBucket', () => {
  it('buckets the absolute % change', () => {
    expect(changeBucket(100, 103)).toBe('0-5');
    expect(changeBucket(100, 92)).toBe('5-10');
    expect(changeBucket(100, 80)).toBe('10-25');
    expect(changeBucket(100, 140)).toBe('25-50');
    expect(changeBucket(100, 25)).toBe('50-100');
    expect(changeBucket(100, 200)).toBe('100+');
    expect(changeBucket(100, 900)).toBe('100+');
  });

  it('is symmetric in direction', () => {
    expect(changeBucket(200, 160)).toBe(changeBucket(200, 240));
  });

  it('labels a change from zero instead of dividing by it', () => {
    expect(changeBucket(0, 50)).toBe('from_zero');
    expect(changeBucket(0, 0)).toBe('0-5');
  });

  it('never returns a raw number', () => {
    expect(changeBucket(812, 430)).not.toMatch(/812|430/);
    expect(changeBucket(NaN, 10)).toBe('unknown');
  });
});

describe('correctionBasis', () => {
  const before = { calories: 200, protein_g: 10, carbs_g: 30, fat_g: 5 };

  it('uses calories whenever they changed', () => {
    expect(correctionBasis(before, { calories: 180, protein_g: 40 })).toBe('calories');
  });

  it('uses the macro with the largest relative change when calories did not move', () => {
    // protein +200%, fat +20%
    expect(correctionBasis(before, { protein_g: 30, fat_g: 6 })).toBe('protein_g');
    // carbs -50%, protein +10%
    expect(correctionBasis(before, { protein_g: 11, carbs_g: 15 })).toBe('carbs_g');
  });

  it('counts a change from zero as the largest', () => {
    expect(correctionBasis({ ...before, fat_g: 0 }, { protein_g: 30, fat_g: 2 })).toBe('fat_g');
  });

  it('ignores fields given at their stored value, and falls back to calories', () => {
    expect(correctionBasis(before, { calories: 200, protein_g: 25 })).toBe('protein_g');
    expect(correctionBasis(before, {})).toBe('calories');
    expect(correctionBasis(before, { protein_g: 10 })).toBe('calories');
  });
});

describe('macroSourceBucket / mealMacroSource', () => {
  it('passes known sources through and closes the set', () => {
    expect(macroSourceBucket('usda')).toBe('usda');
    expect(macroSourceBucket('label')).toBe('label');
    expect(macroSourceBucket(null)).toBe('unknown');
    expect(macroSourceBucket('something new')).toBe('unknown');
  });

  it('labels a meal by its shared source, or mixed', () => {
    expect(mealMacroSource(['indb', 'indb'])).toBe('indb');
    expect(mealMacroSource(['indb', 'usda'])).toBe('mixed');
    expect(mealMacroSource([])).toBe('unknown');
  });
});

describe('errorReason / classify with server error codes', () => {
  const parseFailure = Object.assign(new Error('Something went wrong reading that — please try again.'), {
    code: 'ai_parse_failed',
  });

  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('maps the attached code exactly', () => {
    expect(errorReason(parseFailure)).toBe('ai_parse_failed');
    expect(classify(parseFailure)).toBe('ai_parse_failed');
    expect(toUserMessage(parseFailure, 'logMeal')).toBe('Something went wrong reading that. Please try again.');
  });

  it('does not let an unknown code through', () => {
    const odd = Object.assign(new Error('boom'), { code: 'user typed this' });
    expect(errorReason(odd)).toBe('unknown');
  });

  it('leaves message-based classification unchanged', () => {
    expect(errorReason(new Error('Network request failed'))).toBe('network');
  });
});
