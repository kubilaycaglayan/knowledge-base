const DAY_MS = 86_400_000;

function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateOnly(value: Date): string {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

export function addCalendarDays(value: string, amount: number): string {
  const date = parseDateOnly(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return formatDateOnly(date);
}

// Keeps the day of month, clamped to the target month's last day (Mar 31 - 1 month = Feb 28/29).
export function addCalendarMonths(value: string, amount: number): string {
  const date = parseDateOnly(value);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + amount);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return formatDateOnly(date);
}

export function inclusiveDayCount(start: string, end: string): number {
  return Math.floor((parseDateOnly(end).getTime() - parseDateOnly(start).getTime()) / DAY_MS) + 1;
}

export function timelineDays(start: string, end: string, maxDays = 366): string[] {
  const count = Math.min(Math.max(0, inclusiveDayCount(start, end)), maxDays);
  return Array.from({ length: count }, (_, index) => addCalendarDays(start, index));
}

export function barPosition(start: string | undefined, end: string | undefined, days: string[]): { left: number; width: number } | null {
  if (!start || !end || !days.length || end < days[0] || start > days[days.length - 1]) return null;
  const first = Math.max(0, days.indexOf(start) >= 0 ? days.indexOf(start) : start < days[0] ? 0 : days.length - 1);
  const last = Math.min(days.length - 1, days.indexOf(end) >= 0 ? days.indexOf(end) : end > days[days.length - 1] ? days.length - 1 : 0);
  if (last < first) return null;
  return { left: (first / days.length) * 100, width: ((last - first + 1) / days.length) * 100 };
}
