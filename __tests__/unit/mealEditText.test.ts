// B2: confirming the meal editor without changing anything must not call the
// AI. The editor opens with the AI's food summary, so "unchanged" has to be
// judged against that summary, not against the user's original caption.

import { buildFoodSummary, isUnchangedEdit } from '../../src/utils/mealEditText';

const entries = [
  { food_name: 'bread', quantity_label: '2 slices', quantity_g: 60 },
  { food_name: 'tomato', quantity_label: null, quantity_g: 42 },
  { food_name: 'peanut butter', quantity_label: '2 spoon (30g)', quantity_g: 30 },
];

describe('buildFoodSummary', () => {
  it('title-cases names and shows label or grams, without nested brackets', () => {
    expect(buildFoodSummary(entries)).toBe('Bread (2 slices), Tomato (42 g), Peanut Butter (2 spoon 30g)');
  });
});

describe('isUnchangedEdit', () => {
  const start = buildFoodSummary(entries);
  const caption = 'toast with tomato and pb';

  it('is unchanged when the user confirms the pre-filled summary as is', () => {
    expect(isUnchangedEdit(start, start, caption)).toBe(true);
  });

  it('ignores whitespace-only differences', () => {
    expect(isUnchangedEdit(`  ${start.replace(', ', ',\n ')}  `, start, caption)).toBe(true);
  });

  it('is unchanged when the user retypes their original caption', () => {
    expect(isUnchangedEdit('toast with tomato and pb', start, caption)).toBe(true);
  });

  it('treats an empty draft as nothing to send', () => {
    expect(isUnchangedEdit('   ', start, caption)).toBe(true);
  });

  it('is a real edit when a quantity changes', () => {
    expect(isUnchangedEdit(start.replace('2 slices', '3 slices'), start, caption)).toBe(false);
  });

  it('handles a meal with no caption (photo-only)', () => {
    expect(isUnchangedEdit(start, start, null)).toBe(true);
    expect(isUnchangedEdit('Bread (1 slice)', start, null)).toBe(false);
  });
});
