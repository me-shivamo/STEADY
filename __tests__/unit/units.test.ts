import {
  formatWeight,
  formatHeight,
  parseWeight,
  parseHeight,
  convertWeightText,
  convertHeightText,
  ageToDateOfBirth,
  formatDateLabel,
} from '../../src/utils/units';
import { calculateAge } from '../../src/utils/tdee';

// These helpers are the unit boundary for the whole app: canonical kg/cm in
// the database, display units on screen. The old Settings screen converted on
// render but not on input, so every keystroke in imperial got divided by 2.54
// a second time. The round-trip tests below are what would have caught it.

describe('units — display formatting', () => {
  it('shows canonical kg unchanged in metric', () => {
    expect(formatWeight(70, 'metric')).toBe('70');
    expect(formatWeight(70.4, 'metric')).toBe('70.4');
  });

  it('converts kg to whole lbs in imperial', () => {
    expect(formatWeight(70, 'imperial')).toBe('154');
  });

  it('converts cm to whole inches in imperial', () => {
    expect(formatHeight(170, 'imperial')).toBe('67');
    expect(formatHeight(170, 'metric')).toBe('170');
  });

  it('renders an empty field rather than "null" for missing values', () => {
    expect(formatWeight(null, 'metric')).toBe('');
    expect(formatHeight(undefined, 'imperial')).toBe('');
  });
});

describe('units — parsing back to canonical', () => {
  it('reads typed lbs as kg', () => {
    expect(parseWeight('154', 'imperial')).toBe(69.9);
    expect(parseWeight('154', 'metric')).toBe(154);
  });

  it('reads typed inches as cm', () => {
    expect(parseHeight('67', 'imperial')).toBe(170);
    expect(parseHeight('170', 'metric')).toBe(170);
  });

  it('returns null for empty, zero, negative or junk input', () => {
    for (const bad of ['', '   ', '0', '-5', 'abc']) {
      expect(parseWeight(bad, 'metric')).toBeNull();
      expect(parseHeight(bad, 'metric')).toBeNull();
    }
  });
});

describe('units — the regression that broke the old Settings screen', () => {
  // Typing "70" while in imperial must mean 70 lbs, and formatting it back
  // must still read 70 — not 70 / 2.20462 = 32.
  it('does not re-convert a value that is already in display units', () => {
    const typed = '70';
    const canonical = parseWeight(typed, 'imperial');
    expect(formatWeight(canonical, 'imperial')).toBe(typed);
  });

  it('same for height in inches', () => {
    const typed = '67';
    const canonical = parseHeight(typed, 'imperial');
    expect(formatHeight(canonical, 'imperial')).toBe(typed);
  });
});

describe('units — flipping the units toggle', () => {
  it('converts what is on screen instead of reinterpreting it', () => {
    expect(convertWeightText('154', 'imperial', 'metric')).toBe('69.9');
    expect(convertHeightText('67', 'imperial', 'metric')).toBe('170');
    expect(convertWeightText('70', 'metric', 'imperial')).toBe('154');
  });

  it('is a no-op when the system does not change', () => {
    expect(convertWeightText('70', 'metric', 'metric')).toBe('70');
  });

  it('leaves half-typed / unparseable text alone rather than destroying it', () => {
    expect(convertWeightText('', 'metric', 'imperial')).toBe('');
    expect(convertHeightText('1', 'metric', 'imperial')).toBe('0');
    expect(convertWeightText('abc', 'metric', 'imperial')).toBe('abc');
  });
});

describe('units — age ⇄ date_of_birth', () => {
  // ageToDateOfBirth must be the exact inverse of calculateAge, including the
  // "birthday hasn't happened yet this year" case.
  it('round-trips through calculateAge for every plausible age', () => {
    for (const age of [10, 18, 25, 37, 64, 100]) {
      expect(calculateAge(ageToDateOfBirth(age, null))).toBe(age);
    }
  });

  it('preserves an existing birth month and day', () => {
    const dob = ageToDateOfBirth(30, '1996-07-14');
    expect(dob.endsWith('-07-14')).toBe(true);
    expect(calculateAge(dob)).toBe(30);
  });

  it('round-trips correctly for a birthday later in the year', () => {
    const laterThisYear = `1990-12-31`;
    const dob = ageToDateOfBirth(42, laterThisYear);
    expect(calculateAge(dob)).toBe(42);
  });
});

describe('units — date labels', () => {
  it('formats an ISO date for display', () => {
    expect(formatDateLabel('2026-11-02')).toBe('2 Nov 2026');
  });

  it('returns null for missing or invalid dates', () => {
    expect(formatDateLabel(null)).toBeNull();
    expect(formatDateLabel('not-a-date')).toBeNull();
  });
});
