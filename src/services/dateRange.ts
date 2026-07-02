import { Timeframe } from './gemini';

// User is in India. Expenses are stored with UTC timestamps, but "today",
// "this week", "this month" must be computed against IST wall-clock.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Returns the UTC Date marking the start of the given timeframe in IST.
 * `all` returns the epoch (everything).
 */
export function startOf(timeframe: Timeframe): Date {
  if (timeframe === 'all') return new Date(0);

  // Shift now into IST wall-clock: a Date whose UTC fields read as IST.
  const nowIst = new Date(Date.now() + IST_OFFSET_MS);
  const y = nowIst.getUTCFullYear();
  const m = nowIst.getUTCMonth();
  const d = nowIst.getUTCDate();

  let startIstMs: number;
  switch (timeframe) {
    case 'today':
      startIstMs = Date.UTC(y, m, d, 0, 0, 0);
      break;
    case 'week': {
      // Week starts Monday
      const dow = nowIst.getUTCDay(); // 0 = Sun .. 6 = Sat
      const daysSinceMonday = (dow + 6) % 7;
      startIstMs = Date.UTC(y, m, d, 0, 0, 0) - daysSinceMonday * 86_400_000;
      break;
    }
    case 'month':
      startIstMs = Date.UTC(y, m, 1, 0, 0, 0);
      break;
  }

  // Convert IST wall-clock start back to the true UTC instant.
  return new Date(startIstMs - IST_OFFSET_MS);
}

/** Current month key in IST, e.g. "2026-07". */
export function currentMonthKey(): string {
  const nowIst = new Date(Date.now() + IST_OFFSET_MS);
  const y = nowIst.getUTCFullYear();
  const m = String(nowIst.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** Days remaining in the current month (IST), not counting today. */
export function daysLeftInMonth(): number {
  const nowIst = new Date(Date.now() + IST_OFFSET_MS);
  const y = nowIst.getUTCFullYear();
  const m = nowIst.getUTCMonth();
  const day = nowIst.getUTCDate();
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return daysInMonth - day;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** UTC [start, end) instants for a "YYYY-MM" month key, in IST wall-clock. */
export function monthRange(monthKey: string): { start: Date; end: Date } {
  const [y, m] = monthKey.split('-').map(Number); // m is 1-based
  const startIstMs = Date.UTC(y, m - 1, 1, 0, 0, 0);
  const endIstMs = Date.UTC(y, m, 1, 0, 0, 0);
  return {
    start: new Date(startIstMs - IST_OFFSET_MS),
    end: new Date(endIstMs - IST_OFFSET_MS),
  };
}

/** "2026-07" -> "2026-06" */
export function previousMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  return `${prevY}-${String(prevM).padStart(2, '0')}`;
}

/** "2026-07" -> "July 2026" */
export function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/** Format a stored UTC Date as a short IST day label, e.g. "2 Jul". */
export function formatDay(date: Date): string {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  const day = ist.getUTCDate();
  const month = MONTH_NAMES[ist.getUTCMonth()].slice(0, 3);
  return `${day} ${month}`;
}

/** Format a stored UTC Date as IST date + time, e.g. "2 Jul, 09:24 PM". */
export function formatDateTime(date: Date): string {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  const day = ist.getUTCDate();
  const month = MONTH_NAMES[ist.getUTCMonth()].slice(0, 3);
  let h = ist.getUTCHours();
  const min = String(ist.getUTCMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${day} ${month}, ${String(h).padStart(2, '0')}:${min} ${ampm}`;
}

export function timeframeLabel(timeframe: Timeframe): string {
  switch (timeframe) {
    case 'today':
      return 'today';
    case 'week':
      return 'this week';
    case 'month':
      return 'this month';
    case 'all':
      return 'all time';
  }
}
