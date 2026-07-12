export type GroupDateFormat = "md" | "mon-d" | "d-mon";

export const GROUP_DATE_FORMAT_KEY = "mv-group-date-format";

export const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Compact date for contact-card group meta (year lives in the section header). */
export function formatGroupDateCompact(
  isoDate: string,
  style: GroupDateFormat,
): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return isoDate;
  const monthNum = Number(m[2]);
  const dayNum = Number(m[3]);
  const mon = MONTH_SHORT[monthNum - 1] ?? m[2];
  switch (style) {
    case "mon-d":
      return `${mon} ${dayNum}`;
    case "d-mon":
      return `${dayNum} ${mon}`;
    case "md":
    default:
      return `${m[2]}-${m[3]}`;
  }
}

export function groupDateMeta(
  g: { dateStart: string; dateEnd: string },
  style: GroupDateFormat,
): string {
  const start = formatGroupDateCompact(g.dateStart, style);
  if (g.dateEnd === g.dateStart) return start;
  return `${start} – ${formatGroupDateCompact(g.dateEnd, style)}`;
}

/**
 * Fixed-width date for Groups table columns (includes year; pad day for mono align).
 */
export function formatGroupDateTable(
  isoDate: string,
  style: GroupDateFormat,
): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return isoDate;
  const year = m[1];
  const monthNum = Number(m[2]);
  const dayNum = Number(m[3]);
  const mon = MONTH_SHORT[monthNum - 1] ?? m[2];
  const day = String(dayNum).padStart(2, "0");
  switch (style) {
    case "mon-d":
      return `${mon} ${day}, ${year}`;
    case "d-mon":
      return `${day} ${mon} ${year}`;
    case "md":
    default:
      return `${m[2]}-${m[3]}-${year}`;
  }
}
