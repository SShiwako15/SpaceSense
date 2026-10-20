export function toLocalInput(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function toDateInput(value) {
  return toLocalInput(value).slice(0, 10);
}

export function toApiTime(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

export function initialSearchTime() {
  const day = new Date();
  day.setDate(day.getDate() + 1);
  return { date: toDateInput(day), startTime: '13:00', endTime: '15:00' };
}

export function searchWindow(filters) {
  const start = toApiTime(`${filters.date}T${filters.startTime}`);
  const end = toApiTime(`${filters.date}T${filters.endTime}`);
  return { start, end };
}

export function formatDate(value, options = { month: 'short', day: 'numeric' }) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-US', options).format(date);
}

export function formatTime(value) {
  return formatDate(value, { hour: 'numeric', minute: '2-digit' });
}

export function formatDateTime(value) {
  return formatDate(value, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function dateRange(days = 30) {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + days);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function durationHours(start, end) {
  return Math.max(0, (new Date(end) - new Date(start)) / 3_600_000);
}
