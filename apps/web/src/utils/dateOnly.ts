export type DateOnlyIntervalUnit = "DAY" | "WEEK" | "MONTH" | "QUARTER" | "YEAR";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function formatUtcDateOnly(date: Date) {
  return `${date.getUTCFullYear()}-${padDatePart(date.getUTCMonth() + 1)}-${padDatePart(
    date.getUTCDate()
  )}`;
}

export function todayDateOnlyLocal(now = new Date()) {
  return `${now.getFullYear()}-${padDatePart(now.getMonth() + 1)}-${padDatePart(
    now.getDate()
  )}`;
}

export function normalizeDateOnly(value: string | undefined) {
  if (!value || !DATE_ONLY_PATTERN.test(value)) {
    return undefined;
  }

  const [year, month, day] = value.split("-").map((part) => Number(part));
  const parsed = new Date(Date.UTC(year, month - 1, day));
  const normalized = formatUtcDateOnly(parsed);
  return normalized === value ? value : undefined;
}

export function addDateOnlyInterval(
  dateOnly: string,
  unit: DateOnlyIntervalUnit,
  value: number
) {
  const normalized = normalizeDateOnly(dateOnly);
  if (!normalized) {
    return undefined;
  }

  const [year, month, day] = normalized.split("-").map((part) => Number(part));
  const next = new Date(Date.UTC(year, month - 1, day));
  switch (unit) {
    case "DAY":
      next.setUTCDate(next.getUTCDate() + value);
      break;
    case "WEEK":
      next.setUTCDate(next.getUTCDate() + value * 7);
      break;
    case "QUARTER":
      next.setUTCMonth(next.getUTCMonth() + value * 3);
      break;
    case "YEAR":
      next.setUTCFullYear(next.getUTCFullYear() + value);
      break;
    case "MONTH":
    default:
      next.setUTCMonth(next.getUTCMonth() + value);
      break;
  }
  return formatUtcDateOnly(next);
}

export function addDateOnlyDays(dateOnly: string, days: number) {
  const normalized = normalizeDateOnly(dateOnly);
  if (!normalized || !Number.isFinite(days)) {
    return undefined;
  }

  const [year, month, day] = normalized.split("-").map((part) => Number(part));
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + Math.trunc(days));
  return formatUtcDateOnly(next);
}
