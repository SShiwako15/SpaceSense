// The campus schedule uses Eastern time, including daylight saving changes.
// Interpret wall-clock inputs in that zone even when the visitor is elsewhere.
export const CAMPUS_TIME_ZONE = "America/New_York";

const campusPartsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: CAMPUS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const offsetFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: CAMPUS_TIME_ZONE,
  timeZoneName: "shortOffset",
});
const pad = (number) => String(number).padStart(2, "0");

function campusParts(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Object.fromEntries(
    campusPartsFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}

function offsetMinutes(value) {
  const name = offsetFormatter
    .formatToParts(value)
    .find((part) => part.type === "timeZoneName")?.value;
  const match = /^GMT(?:([+-])(\d{1,2})(?::(\d{2}))?)?$/.exec(name || "");
  if (!match) return NaN;
  return match[1] === "-"
    ? -(Number(match[2]) * 60 + Number(match[3] || 0))
    : Number(match[2] || 0) * 60 + Number(match[3] || 0);
}

export function toLocalInput(value) {
  const parts = campusParts(value);
  if (!parts) return "";
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function toDateInput(value) {
  return toLocalInput(value).slice(0, 10);
}

export function toApiTime(value) {
  if (!value) return "";
  // Offset-aware values from the API already represent an exact instant.
  if (/[Zz]|[+-]\d{2}:\d{2}$/.test(value)) {
    const instant = new Date(value);
    return Number.isNaN(instant.getTime()) ? "" : instant.toISOString();
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return "";
  const [, year, month, day, hour, minute] = match.map(Number);
  const wallClockUtc = Date.UTC(year, month - 1, day, hour, minute);
  if (Number.isNaN(wallClockUtc)) return "";
  let instant = new Date(
    wallClockUtc - offsetMinutes(new Date(wallClockUtc)) * 60_000,
  );
  instant = new Date(wallClockUtc - offsetMinutes(instant) * 60_000);
  // Reject impossible calendar dates and the missing hour at the spring DST change.
  return toLocalInput(instant) === value ? instant.toISOString() : "";
}

export function initialSearchTime() {
  const today = toDateInput(new Date());
  const [year, month, day] = today.split("-").map(Number);
  const tomorrow = new Date(Date.UTC(year, month - 1, day + 1))
    .toISOString()
    .slice(0, 10);
  return { date: tomorrow, startTime: "13:00", endTime: "15:00" };
}

export function searchWindow(filters) {
  const start = toApiTime(`${filters.date}T${filters.startTime}`);
  const end = toApiTime(`${filters.date}T${filters.endTime}`);
  return { start, end };
}

export function formatDate(
  value,
  options = { month: "short", day: "numeric" },
) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-US", {
        ...options,
        timeZone: CAMPUS_TIME_ZONE,
      }).format(date);
}

export function formatTime(value) {
  return formatDate(value, { hour: "numeric", minute: "2-digit" });
}

export function formatDateTime(value) {
  return formatDate(value, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function dateRange(days = 30) {
  const [year, month, day] = toDateInput(new Date()).split("-").map(Number);
  const endDate = new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
  return {
    from: toApiTime(`${year}-${pad(month)}-${pad(day)}T00:00`),
    to: toApiTime(`${endDate}T00:00`),
  };
}

export function durationHours(start, end) {
  return Math.max(0, (new Date(end) - new Date(start)) / 3_600_000);
}
