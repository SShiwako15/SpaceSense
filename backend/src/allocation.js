import { performance } from "node:perf_hooks";
import {
  campus,
  at,
  ms,
  HOUR,
  same,
  overlaps,
  segments,
  percent,
  round,
} from "./time.js";
import { validDate } from "./bookings.js";

const inactive = (r) =>
  ["cancelled", "canceled", "rejected", "declined"].includes(
    r.status?.toLowerCase(),
  );
const duration = (r) =>
  Math.max(0, Math.ceil((ms(r.end) - ms(r.start)) / 60000));
export function plan(resources, reservations, events) {
  const rooms = [
    ...new Map(
      resources
        .filter((r) => r.type !== "equipment" && r.id)
        .map((r) => [r.id.toLowerCase(), r]),
    ).values(),
  ].sort((a, b) => a.capacity - b.capacity || a.name.localeCompare(b.name));
  const active = reservations.filter(
      (r) => !inactive(r) && ms(r.end) > ms(r.start),
    ),
    seen = new Set(),
    errors = new Map(),
    items = [],
    valid = [];
  events.forEach((e, inputIndex) => {
    let error;
    if (!e || typeof e !== "object") error = "Event details are missing.";
    else if (typeof e.id !== "string" || !e.id.trim())
      error = "Event ID is required.";
    else if (typeof e.title !== "string" || !e.title.trim())
      error = "Event title is required.";
    else if (
      !validDate(e.start) ||
      !validDate(e.end) ||
      ms(e.end) <= ms(e.start)
    )
      error = "End time must be after start time.";
    else if (ms(e.end) - ms(e.start) > 12 * HOUR)
      error = "Events cannot exceed 12 hours.";
    else if (!Number.isInteger(e.attendees) || e.attendees <= 0)
      error = "Attendees must be greater than zero.";
    else if (!Number.isInteger(e.priority) || e.priority < 1 || e.priority > 5)
      error = "Priority must be between 1 and 5.";
    else if (
      !Array.isArray(e.requiredFeatures) ||
      e.requiredFeatures.some((f) => typeof f !== "string" || !f.trim())
    )
      error = "Required features must be an array of nonblank names.";
    else if (e.accessible !== undefined && typeof e.accessible !== "boolean")
      error = "Accessible must be true or false.";
    else if (seen.has(e.id.trim().toLowerCase()))
      error = "Event ID must be unique in this plan.";
    if (error) {
      errors.set(inputIndex, error);
      return;
    }
    seen.add(e.id.trim().toLowerCase());
    valid.push(e);
    const matching = rooms
      .map((_, i) => i)
      .filter(
        (i) =>
          rooms[i].capacity >= e.attendees &&
          (!e.accessible || rooms[i].accessible) &&
          e.requiredFeatures.every((f) =>
            rooms[i].features.some((g) => same(f.trim(), g.trim())),
          ),
      );
    const candidates = matching.filter(
      (i) =>
        !active.some((r) => same(r.resourceId, rooms[i].id) && overlaps(r, e)),
    );
    if (!candidates.length) {
      errors.set(
        inputIndex,
        matching.length
          ? "Matching rooms are already reserved for this time."
          : "No room matches the capacity, accessibility, and equipment requirements.",
      );
      return;
    }
    items.push({
      event: e,
      inputIndex,
      candidates,
      weight: (events.length + 1) ** (e.priority - 1),
      minutes: duration(e),
    });
  });
  for (const item of items)
    item.degree = items.filter(
      (other) => other !== item && overlaps(item.event, other.event),
    ).length;
  items.sort(
    (a, b) =>
      b.event.priority - a.event.priority ||
      a.candidates.length - b.candidates.length ||
      b.degree - a.degree ||
      ms(a.event.start) - ms(b.event.start) ||
      a.event.id.localeCompare(b.event.id),
  );
  const occupied = rooms.map(() => []),
    current = items.map(() => -1);
  let best = items.map(() => -1),
    bestScore = 0,
    bestWaste = 0,
    visited = 0;
  const fits = (i, r) =>
    occupied[r].every((other) => !overlaps(items[i].event, items[other].event));
  const waste = (i, r) =>
    items[i].minutes * (rooms[r].capacity - items[i].event.attendees);
  for (let i = 0; i < items.length; i++)
    for (const r of items[i].candidates)
      if (fits(i, r)) {
        best[i] = r;
        occupied[r].push(i);
        bestScore += items[i].weight;
        bestWaste += waste(i, r);
        break;
      }
  occupied.forEach((r) => r.splice(0));
  const remaining = Array(items.length + 1).fill(0);
  for (let i = items.length - 1; i >= 0; i--)
    remaining[i] = remaining[i + 1] + items[i].weight;
  const deadline = performance.now() + 350;
  function search(index, score, wasted) {
    if (visited++ >= 60000 || performance.now() >= deadline) return;
    if (
      score + remaining[index] < bestScore ||
      (score + remaining[index] === bestScore && wasted >= bestWaste)
    )
      return;
    if (index === items.length) {
      bestScore = score;
      bestWaste = wasted;
      best = [...current];
      return;
    }
    for (const room of items[index].candidates) {
      if (!fits(index, room)) continue;
      current[index] = room;
      occupied[room].push(index);
      search(
        index + 1,
        score + items[index].weight,
        wasted + waste(index, room),
      );
      occupied[room].pop();
      current[index] = -1;
    }
    search(index + 1, score, wasted);
  }
  search(0, 0, 0);
  const assigned = new Set(),
    assignments = [];
  items.forEach((item, index) => {
    if (best[index] < 0) return;
    const e = item.event,
      r = rooms[best[index]];
    assigned.add(item.inputIndex);
    assignments.push({
      eventId: e.id,
      eventTitle: e.title,
      resourceId: r.id,
      resourceName: r.name,
      start: e.start,
      end: e.end,
      attendees: e.attendees,
      capacity: r.capacity,
      seatWaste: r.capacity - e.attendees,
      priority: e.priority,
    });
  });
  assignments.sort(
    (a, b) =>
      ms(a.start) - ms(b.start) || a.eventTitle.localeCompare(b.eventTitle),
  );
  const unassigned = events.flatMap((e, i) =>
    assigned.has(i)
      ? []
      : [
          {
            eventId: e?.id ?? "",
            eventTitle: e?.title ?? "",
            reason:
              errors.get(i) ??
              "No conflict-free room assignment was found for this event.",
          },
        ],
  );
  const windows = new Map();
  for (const e of valid)
    for (const part of segments(e.start, e.end)) {
      const start = Math.min(ms(part.start), ms(at(part.date, 8))),
        end = Math.max(ms(part.end), ms(at(part.date, 18))),
        previous = windows.get(part.date);
      windows.set(part.date, {
        start: Math.min(start, previous?.start ?? start),
        end: Math.max(end, previous?.end ?? end),
      });
    }
  const planningMinutes = [...windows.values()].reduce(
    (sum, w) => sum + Math.ceil((w.end - w.start) / 60000),
    0,
  );
  let occupiedTotal = 0,
    attendeeTotal = 0,
    seatTotal = 0;
  const roomUsage = rooms.map((room) => {
    let existingMinutes = 0;
    for (const w of windows.values()) {
      const intervals = active
        .filter(
          (r) =>
            same(r.resourceId, room.id) &&
            ms(r.start) < w.end &&
            ms(r.end) > w.start,
        )
        .map((r) => ({
          start: Math.max(ms(r.start), w.start),
          end: Math.min(ms(r.end), w.end),
        }))
        .sort((a, b) => a.start - b.start);
      let merged;
      for (const interval of intervals) {
        if (merged && interval.start <= merged.end)
          merged.end = Math.max(merged.end, interval.end);
        else {
          if (merged)
            existingMinutes += Math.ceil((merged.end - merged.start) / 60000);
          merged = { ...interval };
        }
      }
      if (merged)
        existingMinutes += Math.ceil((merged.end - merged.start) / 60000);
    }
    const allocated = assignments.filter((a) => a.resourceId === room.id),
      allocatedMinutes = allocated.reduce((sum, a) => sum + duration(a), 0),
      attendeeMinutes = allocated.reduce(
        (sum, a) => sum + duration(a) * a.attendees,
        0,
      ),
      seatMinutes = allocatedMinutes * room.capacity;
    occupiedTotal += existingMinutes + allocatedMinutes;
    attendeeTotal += attendeeMinutes;
    seatTotal += seatMinutes;
    return {
      resourceId: room.id,
      resourceName: room.name,
      capacity: room.capacity,
      existingMinutes,
      allocatedMinutes,
      planningMinutes,
      utilizationPercent: Math.min(
        100,
        percent(existingMinutes + allocatedMinutes, planningMinutes),
      ),
      seatFillPercent: percent(attendeeMinutes, seatMinutes),
    };
  });
  return {
    assignments,
    unassigned,
    rooms: roomUsage,
    summary: {
      totalEvents: events.length,
      assignedEvents: assignments.length,
      unassignedEvents: unassigned.length,
      allocationRatePercent: percent(assignments.length, events.length),
      seatFillPercent: percent(attendeeTotal, seatTotal),
      wastedSeatHours: round((seatTotal - attendeeTotal) / 60),
      roomTimeUtilizationPercent: Math.min(
        100,
        percent(occupiedTotal, planningMinutes * rooms.length),
      ),
    },
    method:
      "Priority-aware bounded search; feasible plan, global optimum not guaranteed.",
  };
}
export function demoEvents(firstDay) {
  let date = campus(firstDay).startOf("day");
  const starts = [
      [8, 30],
      [9, 0],
      [10, 30],
      [11, 0],
      [13, 0],
      [13, 30],
      [14, 30],
      [15, 0],
      [16, 0],
      [16, 30],
    ],
    sizes = [8, 12, 16, 20, 24, 28, 36, 42, 18, 30],
    subjects = [
      "Design studio",
      "Statistics seminar",
      "Writing workshop",
      "Robotics lab",
      "History discussion",
      "Research colloquium",
      "Programming tutorial",
      "Team project",
      "Faculty briefing",
      "Student showcase",
    ],
    result = [];
  for (let day = 0; day < 5; day++) {
    while (date.weekday > 5) date = date.plus({ days: 1 });
    for (let slot = 0; slot < 10; slot++) {
      const number = day * 10 + slot + 1,
        start = campus(at(date.toISODate(), ...starts[slot]));
      result.push({
        id: `demo-${String(number).padStart(2, "0")}`,
        title: `${subjects[slot]} ${day + 1}`,
        start: start.toISO(),
        end: start.plus({ minutes: slot % 3 === 0 ? 90 : 75 }).toISO(),
        attendees: sizes[slot],
        requiredFeatures:
          slot % 5 === 0
            ? ["computers"]
            : slot % 3 === 0
              ? ["projector"]
              : ["whiteboard"],
        accessible: number % 7 === 0,
        priority: 1 + ((number + slot) % 5),
      });
    }
    date = date.plus({ days: 1 });
  }
  return result;
}
