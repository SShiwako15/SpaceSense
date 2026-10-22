import { DateTime } from "luxon";

export const ZONE = "America/New_York";
export const HOUR = 3_600_000;
export const now = () => DateTime.now().setZone(ZONE);
export const campus = (value) =>
  typeof value === "string"
    ? DateTime.fromISO(value, { zone: ZONE })
    : DateTime.invalid("Expected an ISO date string");
export const at = (date, hour = 0, minute = 0) =>
  campus(date).startOf("day").set({ hour, minute }).toISO();
export const addDays = (value, days) => campus(value).plus({ days }).toISO();
export const ms = (value) => campus(value).toMillis();
export const overlaps = (a, b) =>
  ms(a.start) < ms(b.end) && ms(b.start) < ms(a.end);
export const blocking = (r) => ["confirmed", "pending"].includes(r.status);
export const same = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  a.toLowerCase() === b.toLowerCase();
export const round = (n, places = 1) => Number(n.toFixed(places));
export const percent = (n, total) =>
  total <= 0 ? 0 : round((n / total) * 100);
export function segments(start, end) {
  const result = [];
  let cursor = campus(start);
  const finish = campus(end);
  while (cursor.isValid && cursor < finish) {
    const next = cursor.startOf("day").plus({ days: 1 });
    const stop = next < finish ? next : finish;
    result.push({
      date: cursor.toISODate(),
      start: cursor.toISO(),
      end: stop.toISO(),
      hours: (stop - cursor) / HOUR,
    });
    cursor = stop;
  }
  return result;
}
