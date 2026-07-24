export type DateKey = `${number}-${number}-${number}`;

export function formatLocalDate(date: Date): DateKey {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` as DateKey;
}

export function formatDateInTimeZone(date: Date, timeZone = "Asia/Tokyo"): DateKey {
  const values = Object.fromEntries(new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}` as DateKey;
}

export function parseLocalDate(key: DateKey | string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) throw new Error(`Invalid date key: ${key}`);
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (formatLocalDate(date) !== key) throw new Error(`Invalid date key: ${key}`);
  return date;
}

export function addDays(key: DateKey | string, days: number): DateKey {
  const date = parseLocalDate(key);
  date.setDate(date.getDate() + days);
  return formatLocalDate(date);
}

export function startOfWeek(key: DateKey | string): DateKey {
  const date = parseLocalDate(key);
  return addDays(formatLocalDate(date), -((date.getDay() + 6) % 7));
}

export function localDayUtcRange(key: DateKey | string): { start: string; endExclusive: string } {
  return {
    start: parseLocalDate(key).toISOString(),
    endExclusive: parseLocalDate(addDays(key, 1)).toISOString(),
  };
}

export function formatIsoWithJstOffset(date: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+09:00`;
}
