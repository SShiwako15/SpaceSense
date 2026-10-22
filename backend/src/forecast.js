import { campus, ms, HOUR, round, percent, segments } from "./time.js";

const term = (date) => {
  const { month, day } = campus(date);
  if ((month === 1 && day < 15) || (month === 12 && day > 20)) return "break";
  if (month <= 4 || (month === 5 && day <= 15)) return "spring";
  if (month <= 7 || (month === 8 && day <= 15)) return "summer";
  return "fall";
};
const factor = (date) =>
  ({ spring: 0.95, summer: 0.55, break: 0.3, fall: 1 })[term(date)];
export function forecast(
  resources,
  reservations,
  today,
  days = 14,
  maintenance = [],
) {
  const rooms = new Map(
    resources
      .filter((r) => r.type !== "equipment")
      .map((r) => [r.id.toLowerCase(), r]),
  );
  const types = new Map();
  for (const room of rooms.values())
    types.set(room.type, (types.get(room.type) ?? 0) + 1);
  const start = campus(today).startOf("day"),
    historyStart = start.minus({ weeks: 8 });
  const confirmed = reservations.filter(
    (r) =>
      r.status === "confirmed" &&
      ms(r.end) > ms(r.start) &&
      rooms.has(r.resourceId.toLowerCase()),
  );
  const history = confirmed.filter(
    (r) =>
      campus(r.start).startOf("day") >= historyStart &&
      ms(r.end) <= start.toMillis(),
  );
  const accumulate = (rows) => {
    const map = new Map();
    for (const r of rows)
      for (const part of segments(r.start, r.end)) {
        const key = `${part.date}:${rooms.get(r.resourceId.toLowerCase()).type}`;
        map.set(key, (map.get(key) ?? 0) + part.hours);
      }
    return map;
  };
  const past = accumulate(history),
    future = accumulate(confirmed),
    blocked = accumulate(
      maintenance.filter((w) => rooms.has(w.resourceId.toLowerCase())),
    );
  const totals = new Map(
      [...types.keys()].map((type) => [
        type,
        { predicted: 0, booked: 0, available: 0 },
      ]),
    ),
    output = [];
  for (let offset = 0; offset < days; offset++) {
    const date = start.plus({ days: offset }),
      dateKey = date.toISODate();
    const hours = (date.plus({ days: 1 }) - date) / HOUR;
    let predictedTotal = 0,
      bookedTotal = 0,
      availableTotal = 0;
    for (const [type, count] of types) {
      const key = `${dateKey}:${type}`,
        available = Math.max(0, count * hours - (blocked.get(key) ?? 0));
      const booked = Math.min(available, future.get(key) ?? 0);
      let weighted = 0,
        weights = 0,
        index = 0;
      for (let back = 1; back <= 56; back++) {
        const previous = start.minus({ days: back });
        if (previous.weekday !== date.weekday) continue;
        const weight = 0.8 ** index++;
        weighted +=
          ((past.get(`${previous.toISODate()}:${type}`) ?? 0) /
            factor(previous.toISODate())) *
          factor(dateKey) *
          weight;
        weights += weight;
      }
      const predicted = Math.min(
        available,
        Math.max(booked, weights ? weighted / weights : 0),
      );
      const total = totals.get(type);
      total.predicted += predicted;
      total.booked += booked;
      total.available += available;
      predictedTotal += predicted;
      bookedTotal += booked;
      availableTotal += available;
    }
    output.push({
      date: dateKey,
      term: term(dateKey),
      predictedRoomHours: round(predictedTotal),
      bookedRoomHours: round(bookedTotal),
      availableRoomHours: round(availableTotal),
      demandPercentage: percent(predictedTotal, availableTotal),
    });
  }
  return {
    method:
      "Recency-weighted same-weekday average with academic-term adjustment and a confirmed-booking floor.",
    historyReservations: history.length,
    note:
      history.length === 0
        ? "No completed room bookings in the past eight weeks. The outlook reflects confirmed upcoming bookings only."
        : history.length < 20
          ? `Only ${history.length} completed room bookings are available; treat this outlook as a rough estimate.`
          : `Based on ${history.length} completed room bookings in the past eight weeks. Fictional demo history may be present on a new installation.`,
    days: output,
    byType: [...totals]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([type, t]) => ({
        type,
        predictedRoomHours: round(t.predicted),
        bookedRoomHours: round(t.booked),
        availableRoomHours: round(t.available),
        demandPercentage: percent(t.predicted, t.available),
      })),
  };
}
