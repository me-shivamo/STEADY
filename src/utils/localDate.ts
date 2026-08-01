// A JS Date always stores one absolute UTC instant internally, but its
// getFullYear()/getMonth()/getDate() getters return that instant translated
// into whatever timezone the device's OS is set to — no permission needed,
// since the OS already knows its own clock/timezone. toISOString() instead
// converts to UTC first, so slicing it for "today" is wrong near midnight in
// any timezone ahead of or behind UTC (e.g. 1am IST is still "yesterday
// evening" in UTC). Every "what day is it" computation in this app should
// go through this local-getter path, never toISOString().
export function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayLocalDate(): string {
  return toLocalDateString(new Date());
}

export function daysAgoLocalDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toLocalDateString(d);
}
