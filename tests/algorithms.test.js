import { test } from "node:test";
import assert from "node:assert/strict";
import { forecast } from "../backend/src/forecast.js";
import { plan, demoEvents } from "../backend/src/allocation.js";
import { interpret, extract } from "../backend/src/natural-search.js";
import { campus, at, overlaps } from "../backend/src/time.js";
import { resources, seedReservations } from "../backend/src/seeds.js";

const small = {
  id: "small",
  name: "Small",
  type: "classroom",
  capacity: 20,
  features: ["projector", "whiteboard"],
  accessible: true,
};
const large = {
  id: "large",
  name: "Large",
  type: "classroom",
  capacity: 40,
  features: ["projector"],
  accessible: false,
};
const kit = { ...small, id: "kit", type: "equipment" };
const event = (id, extra = {}) => ({
  id,
  title: id,
  start: "2026-10-20T09:00:00-04:00",
  end: "2026-10-20T10:00:00-04:00",
  attendees: 15,
  requiredFeatures: ["projector"],
  accessible: false,
  priority: 3,
  ...extra,
});
test("allocation honors priority, moves flexible events, validates requirements and allows adjacency", () => {
  const existing = {
    ...event("booked"),
    resourceId: "small",
    status: "confirmed",
  };
  assert.equal(
    plan(
      [small, large, kit],
      [existing],
      [event("access", { accessible: true })],
    ).assignments.length,
    0,
  );
  assert.equal(
    plan(
      [small, large],
      [existing],
      [
        event("adjacent", {
          start: existing.end,
          end: "2026-10-20T11:00:00-04:00",
          accessible: true,
        }),
      ],
    ).assignments[0].resourceId,
    "small",
  );
  assert.equal(
    plan(
      [small],
      [],
      [event("low", { priority: 1 }), event("high", { priority: 5 })],
    ).assignments[0].eventId,
    "high",
  );
  const reassigned = plan(
    [small, large],
    [],
    [
      event("flexible", { priority: 5 }),
      event("constrained", { priority: 1, requiredFeatures: ["whiteboard"] }),
    ],
  );
  assert.equal(reassigned.assignments.length, 2);
  assert.equal(
    reassigned.assignments.find((a) => a.eventId === "flexible").resourceId,
    "large",
  );
  const invalid = plan(
    [small],
    [],
    [
      event("repeat", { title: "" }),
      event("repeat"),
      event("feature", { requiredFeatures: [""] }),
      event("wrong-day", {
        title: "",
        start: "2026-10-21T09:00:00-04:00",
        end: "2026-10-21T10:00:00-04:00",
      }),
    ],
  );
  assert.equal(invalid.assignments.length, 1);
  assert.equal(invalid.rooms[0].planningMinutes, 600);
  const mixed = plan(
    [small],
    [],
    [
      event("early", {
        start: "2026-10-20T10:00:00Z",
        end: "2026-10-20T11:00:00Z",
      }),
      event("late", {
        start: "2026-10-20T10:00:00-04:00",
        end: "2026-10-20T11:00:00-04:00",
      }),
    ],
  );
  assert.equal(mixed.rooms[0].planningMinutes, 720);
});
test("50-event allocation is feasible and all events are accounted for", () => {
  const events = demoEvents("2026-10-20"),
    existing = { ...events[0], resourceId: "seminar", status: "confirmed" },
    result = plan(resources, [existing], events);
  assert.equal(events.length, 50);
  assert.equal(
    result.summary.assignedEvents + result.summary.unassignedEvents,
    50,
  );
  assert.ok(result.assignments.length > 0);
  for (const a of result.assignments) {
    const room = resources.find((r) => r.id === a.resourceId),
      e = events.find((e) => e.id === a.eventId);
    assert.ok(
      room.type !== "equipment" &&
        room.capacity >= e.attendees &&
        (!e.accessible || room.accessible),
    );
    assert.ok(e.requiredFeatures.every((f) => room.features.includes(f)));
    assert.ok(
      !result.assignments.some(
        (other) =>
          other.eventId !== a.eventId &&
          other.resourceId === a.resourceId &&
          overlaps(a, other),
      ),
    );
    assert.ok(a.resourceId !== existing.resourceId || !overlaps(a, existing));
  }
});
const room = { ...small, id: "room" },
  lab = { ...small, id: "lab", type: "lab" };
const booked = (id, date, start, end, extra = {}) => ({
  id,
  resourceId: "room",
  start: at(date, start),
  end: at(date, end),
  status: "confirmed",
  ...extra,
});
test("forecast preserves weekday seasonality, booking floor, equipment exclusion and term adjustments", () => {
  const today = campus("2026-10-19");
  const history = Array.from({ length: 8 }, (_, i) =>
    booked(`history-${i}`, today.minus({ weeks: i + 1 }).toISODate(), 9, 11),
  );
  const result = forecast(
    [room, lab, kit],
    [
      ...history,
      booked("equipment", "2026-10-12", 9, 17, { resourceId: "kit" }),
      booked("upcoming", "2026-10-19", 13, 16),
    ],
    "2026-10-19",
    2,
  );
  assert.equal(result.historyReservations, 8);
  assert.equal(result.days[0].predictedRoomHours, 3);
  assert.equal(result.days[0].bookedRoomHours, 3);
  assert.equal(result.days[1].predictedRoomHours, 0);
  assert.equal(result.days[0].availableRoomHours, 48);
  assert.equal(result.byType.length, 2);
  const fall = campus("2026-08-17"),
    summer = Array.from({ length: 8 }, (_, i) =>
      booked(`summer-${i}`, fall.minus({ weeks: i + 1 }).toISODate(), 9, 11),
    );
  assert.ok(
    forecast([room], summer, fall.toISODate(), 1).days[0].predictedRoomHours >
      2,
  );
});
test("forecast splits overnight bookings, counts completed history once, and retains 23/25-hour days", () => {
  const overnight = booked("overnight", "2026-10-19", 22, 23, {
    end: at("2026-10-20", 2),
  });
  const result = forecast([room], [overnight], "2026-10-19", 2);
  assert.equal(result.historyReservations, 0);
  assert.deepEqual(
    result.days.map((d) => d.bookedRoomHours),
    [2, 2],
  );
  const fall = forecast(
    [room],
    [booked("full", "2026-11-01", 0, 23, { end: at("2026-11-02", 0) })],
    "2026-11-01",
    1,
  );
  assert.equal(fall.days[0].availableRoomHours, 25);
  assert.equal(fall.days[0].bookedRoomHours, 25);
  assert.equal(fall.days[0].demandPercentage, 100);
  assert.equal(
    forecast([room], [], "2026-03-08", 1).days[0].availableRoomHours,
    23,
  );
  const completed = forecast([room], [overnight], "2026-10-21", 1);
  assert.equal(completed.historyReservations, 1);
  const maintained = forecast([room], [], "2026-10-19", 1, [
    {
      resourceId: "room",
      start: at("2026-10-19", 9),
      end: at("2026-10-19", 11),
    },
  ]);
  assert.equal(maintained.days[0].availableRoomHours, 22);
});
test("fresh seed data has 160 history bookings and five upcoming bookings without overlap", () => {
  const seeded = seedReservations();
  assert.equal(seeded.length, 165);
  assert.equal(seeded.filter((r) => r.id.startsWith("history-")).length, 160);
  for (const r of seeded)
    assert.ok(
      !seeded.some(
        (other) =>
          other.id !== r.id &&
          other.resourceId === r.resourceId &&
          overlaps(r, other),
      ),
    );
});
test("natural parser resolves next calendar week, meridiem, durations, dates and accessibility", () => {
  const today = campus("2026-10-21");
  const next = interpret(
    "room for 20 students with a projector next Tuesday afternoon",
    today,
  );
  assert.equal(campus(next.start).toISODate(), "2026-10-27");
  assert.equal(campus(next.start).hour, 12);
  assert.equal(next.minCapacity, 20);
  assert.equal(
    campus(interpret("room tomorrow between 11 and 1 pm", today).start).hour,
    11,
  );
  const evening = interpret(
    "accessible computer lab tomorrow at 6 pm for 90 minutes",
    today,
  );
  assert.equal(campus(evening.start).hour, 18);
  assert.equal(campus(evening.end).minute, 30);
  assert.equal(evening.accessible, true);
  assert.ok(evening.features.includes("computers"));
  const overnight = interpret(
    "study room 2026-10-25 from 11 pm to 1 am",
    today,
  );
  assert.equal(campus(overnight.end).toISODate(), "2026-10-26");
  assert.equal(interpret("a room", today).start, null);
});
test("optional extraction falls back safely and cannot erase explicit local requirements", async () => {
  const prompt =
      "accessible room for 20 students with projector tomorrow afternoon",
    baseline = interpret(prompt);
  assert.equal(await extract(prompt, baseline, resources, { key: "" }), null);
  assert.equal(
    await extract(prompt, baseline, resources, {
      key: "fake",
      fetcher: async () => {
        throw Error("network");
      },
    }),
    null,
  );
  const fetcher = async () => ({
    ok: true,
    json: async () => ({
      status: "completed",
      output: [
        {
          content: [
            {
              type: "output_text",
              text: JSON.stringify({
                features: ["camera"],
                type: "lab",
                minCapacity: 2,
                accessible: false,
                query: "invented",
              }),
            },
          ],
        },
      ],
    }),
  });
  const result = await extract(prompt, baseline, resources, {
    key: "fake",
    fetcher,
  });
  assert.equal(result.minCapacity, 20);
  assert.equal(result.type, "room");
  assert.equal(result.accessible, true);
  assert.deepEqual(result.features, ["projector"]);
  assert.equal(result.query, null);
  assert.equal(result.start, baseline.start);
});
