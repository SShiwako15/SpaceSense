import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, booking } from "./helpers.js";
import { campus } from "../backend/src/time.js";

test("authentication, role boundaries, validation, logout and private availability", async (t) => {
  const f = await fixture(t),
    anonymous = f.client(),
    student = await f.student(),
    other = await f.student("other@campus.example");
  assert.equal(
    (await anonymous.get("/health")).body.timeZone,
    "America/New_York",
  );
  assert.equal((await anonymous.get("/resources")).status, 401);
  assert.equal(
    (await student.get("/resources/CLASS-306")).body.id,
    "class-306",
  );
  assert.equal((await student.get("/resources/missing")).status, 404);
  assert.equal((await student.get("/unknown-route")).status, 404);
  for (const path of [
    "/admin/resources",
    "/maintenance",
    "/waitlist",
    "/stats/utilization",
    "/stats/forecast",
    "/allocations/sample",
  ])
    assert.equal((await student.get(path)).status, 403, path);
  assert.equal(
    (
      await anonymous.post("/auth/login", {
        email: student.user.email,
        password: "wrong-password",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await anonymous.post("/auth/register", {
        displayName: "Duplicate",
        email: "STUDENT@campus.example",
        password: "another-long-password",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await anonymous.post("/auth/register", {
        displayName: "",
        email: "bad",
        password: "short",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await anonymous.post("/auth/login", {
        email: "STUDENT@campus.example",
        password: "a-long-student-password",
      })
    ).status,
    200,
  );
  assert.equal(
    (await student.post("/reservations", booking({ start: "bad" }))).status,
    400,
  );
  assert.equal((await student.get("/resources?start=bad")).status, 400);
  assert.equal((await student.get("/resources?accessible=yes")).status, 400);
  assert.equal((await student.get("/resources?minCapacity=1.5")).status, 400);
  const saved = await student.post(
    "/reservations",
    booking({ ownerId: other.user.id }),
  );
  assert.equal(saved.status, 201);
  assert.equal(saved.body.ownerId, student.user.id);
  assert.equal((await other.get("/reservations")).body.length, 0);
  assert.equal(
    (await other.put(`/reservations/${saved.body.id}`, booking())).status,
    403,
  );
  assert.equal(
    (await other.delete(`/reservations/${saved.body.id}`)).status,
    403,
  );
  const availability = await other.get(
    `/resources/class-306/availability?start=${encodeURIComponent(booking().start)}&end=${encodeURIComponent(booking().end)}&excludeId=${saved.body.id}`,
  );
  assert.equal(availability.body.available, false);
  assert.deepEqual(Object.keys(availability.body.conflicts[0]).sort(), [
    "end",
    "start",
    "status",
  ]);
  assert.equal(
    (
      await student.get(
        `/resources/class-306/availability?start=${encodeURIComponent(booking().start)}&end=${encodeURIComponent(booking().end)}&excludeId=${saved.body.id}`,
      )
    ).body.available,
    true,
  );
  assert.equal((await student.post("/auth/logout")).status, 204);
  assert.equal((await student.get("/auth/me")).status, 401);
});

test("concurrent reservations, adjacency, rejected edits and persistence", async (t) => {
  const f = await fixture(t),
    student = await f.student();
  const attempts = await Promise.all(
    Array.from({ length: 16 }, () => student.post("/reservations", booking())),
  );
  assert.equal(attempts.filter((r) => r.status === 201).length, 1);
  assert.equal(attempts.filter((r) => r.status === 409).length, 15);
  const saved = attempts.find((r) => r.status === 201).body;
  const matches = await student.get(
    `/resources?start=${encodeURIComponent(booking().start)}&end=${encodeURIComponent(booking().end)}`,
  );
  assert.ok(!matches.body.some((r) => r.id === "class-306"));
  const adjacent = await student.post(
    "/reservations",
    booking({ start: booking().end, end: "2030-10-21T20:00:00-04:00" }),
  );
  assert.equal(adjacent.status, 201);
  assert.equal(
    (await student.put(`/reservations/${adjacent.body.id}`, booking())).status,
    409,
  );
  assert.equal(
    (await student.get("/reservations")).body.find(
      (r) => r.id === adjacent.body.id,
    ).start,
    adjacent.body.start,
  );
  const { JsonStorage } = await import("../backend/src/storage.js");
  const reopened = await new JsonStorage(f.directory).init();
  assert.equal(
    (
      await reopened.transact((s) =>
        s.reservations.find((r) => r.id === saved.id),
      )
    ).title,
    booking().title,
  );
  await reopened.close();
  assert.equal((await student.delete(`/reservations/${saved.id}`)).status, 204);
  assert.equal(
    (await student.delete(`/reservations/${adjacent.body.id}`)).status,
    204,
  );
});

test("weekly series preserve wall time through DST and roll back all occurrences on conflict", async (t) => {
  const f = await fixture(t),
    student = await f.student();
  const input = booking({
    start: "2030-10-28T09:00:00-04:00",
    end: "2030-10-28T10:00:00-04:00",
    repeatWeeks: 3,
  });
  const series = await student.post("/reservations", input);
  assert.equal(series.status, 201);
  assert.equal(series.body.reservations.length, 3);
  for (const r of series.body.reservations)
    assert.equal(campus(r.start).hour, 9);
  assert.equal(campus(series.body.reservations[0].start).offset, -240);
  assert.equal(campus(series.body.reservations[1].start).offset, -300);
  const other = await f.student("other@campus.example");
  assert.equal(
    (await other.delete(`/reservations/series/${series.body.seriesId}`)).status,
    403,
  );
  assert.equal(
    (
      await student.put(`/reservations/series/${series.body.seriesId}`, {
        ...input,
        title: "Updated weekly",
      })
    ).status,
    200,
  );
  const occupied = await student.post(
    "/reservations",
    booking({
      resourceId: "class-202",
      start: "2030-11-04T09:00:00-05:00",
      end: "2030-11-04T10:00:00-05:00",
    }),
  );
  assert.equal(occupied.status, 201);
  assert.equal(
    (await student.post("/reservations", { ...input, resourceId: "class-202" }))
      .status,
    409,
  );
  const remaining = (await student.get("/reservations")).body.filter(
    (r) => r.resourceId === "class-202",
  );
  assert.equal(remaining.length, 1);
  assert.equal(
    (
      await student.put(`/reservations/series/${series.body.seriesId}`, {
        ...input,
        resourceId: "class-202",
      })
    ).status,
    409,
  );
  assert.ok(
    (
      await student.get(`/reservations?seriesId=${series.body.seriesId}`)
    ).body.every((r) => r.resourceId === "class-306"),
  );
  assert.equal(
    (await student.delete(`/reservations/series/${series.body.seriesId}`))
      .status,
    204,
  );
  assert.equal(
    (await student.get(`/reservations?seriesId=${series.body.seriesId}`)).body
      .length,
    0,
  );
});

test("approvals, waitlist notifications and claiming retain ownership and privacy", async (t) => {
  const f = await fixture(t),
    student = await f.student(),
    other = await f.student("other@campus.example");
  const input = booking({ resourceId: "lab-east" }),
    pending = await student.post("/reservations", input);
  assert.equal(pending.body.status, "pending");
  const entry = await other.post("/waitlist", input);
  assert.equal(entry.status, 201);
  assert.equal((await other.post("/waitlist", input)).body.duplicate, true);
  assert.equal(
    (await other.post(`/waitlist/${entry.body.entry.id}/claim`)).status,
    409,
  );
  assert.equal(
    (await student.post(`/reservations/${pending.body.id}/approve`)).status,
    403,
  );
  const adminFeed = await f.admin.get("/notifications");
  assert.ok(
    adminFeed.body.notifications.some((n) => n.audienceRole === "Admin"),
  );
  const studentFeed = await student.get("/notifications");
  assert.ok(
    studentFeed.body.notifications.every((n) => n.userId === student.user.id),
  );
  const privateNotice = studentFeed.body.notifications[0];
  assert.equal(
    (await other.post(`/notifications/${privateNotice.id}/read`)).status,
    404,
  );
  assert.equal(
    (await f.admin.post(`/reservations/${pending.body.id}/reject`)).body.status,
    "rejected",
  );
  const openings = (
    await other.get("/notifications")
  ).body.notifications.filter((n) => n.waitlistId === entry.body.entry.id);
  assert.equal(openings.length, 1);
  assert.equal(openings[0].claimable, true);
  assert.equal(
    (await other.post(`/notifications/${openings[0].id}/read`)).status,
    204,
  );
  assert.equal(
    (await other.get("/notifications")).body.notifications.find(
      (n) => n.id === openings[0].id,
    ).claimable,
    true,
  );
  assert.equal(
    (await student.post(`/waitlist/${entry.body.entry.id}/claim`)).status,
    403,
  );
  const claimed = await other.post(`/waitlist/${entry.body.entry.id}/claim`);
  assert.equal(claimed.status, 201);
  assert.equal(claimed.body.ownerId, other.user.id);
  assert.equal(claimed.body.status, "pending");
  assert.equal(
    (await other.get("/notifications")).body.notifications.find(
      (n) => n.id === openings[0].id,
    ).claimable,
    false,
  );
  assert.equal(
    (await f.admin.post(`/reservations/${claimed.body.id}/approve`)).body
      .status,
    "confirmed",
  );
  assert.equal(
    (await f.admin.post(`/reservations/${claimed.body.id}/approve`)).status,
    409,
  );
  assert.equal((await other.post("/notifications/read-all")).status, 204);
  assert.equal((await other.get("/notifications")).body.unreadCount, 0);
});

test("resource management, maintenance, search, forecasting and allocation API contracts", async (t) => {
  const f = await fixture(t),
    student = await f.student();
  const resource = {
    id: "test-room",
    name: "Test Room",
    type: "classroom",
    building: "Test Hall",
    capacity: 30,
    features: ["projector", "whiteboard"],
    accessible: true,
    description: "Test",
    requiresApproval: false,
  };
  assert.equal((await f.admin.post("/admin/resources", resource)).status, 201);
  assert.equal((await f.admin.post("/admin/resources", resource)).status, 409);
  assert.equal(
    (
      await f.admin.put("/admin/resources/test-room", {
        ...resource,
        name: "Updated Room",
      })
    ).status,
    200,
  );
  assert.ok(
    (
      await student.get(
        "/resources?query=updated&features=projector&accessible=true",
      )
    ).body.some((r) => r.id === "test-room"),
  );
  const maintenance = await f.admin.post("/maintenance", {
    ...booking({ resourceId: "test-room" }),
    reason: "Repairs",
  });
  assert.equal(maintenance.status, 201);
  assert.equal(
    (await student.post("/reservations", booking({ resourceId: "test-room" })))
      .status,
    409,
  );
  assert.equal(
    (await f.admin.delete("/admin/resources/test-room")).status,
    409,
  );
  assert.equal(
    (
      await f.admin.post("/maintenance", {
        resourceId: "test-room",
        reason: "Missing dates",
      })
    ).status,
    400,
  );
  const events = [
    {
      id: "one",
      title: "One",
      ...booking({ resourceId: "test-room" }),
      attendees: 20,
      requiredFeatures: ["projector"],
      accessible: true,
      priority: 5,
    },
  ];
  const solved = await f.admin.post("/allocations/solve", { events });
  assert.equal(solved.status, 200);
  assert.ok(solved.body.assignments.every((a) => a.resourceId !== "test-room"));
  assert.equal(
    (await f.admin.delete(`/maintenance/${maintenance.body.id}`)).status,
    204,
  );
  assert.equal(
    (await f.admin.delete("/admin/resources/test-room")).status,
    204,
  );
  const bookingResult = await student.post("/reservations", booking());
  assert.equal(bookingResult.status, 201);
  assert.equal(
    (
      await f.admin.post("/maintenance", {
        ...booking(),
        reason: "Conflicting repairs",
      })
    ).status,
    409,
  );
  assert.equal(
    (await f.admin.get("/stats/forecast?days=2")).body.days.length,
    2,
  );
  assert.equal((await f.admin.get("/stats/forecast?days=31")).status, 400);
  const usage = await f.admin.get("/stats/utilization");
  assert.equal(usage.status, 200);
  assert.ok(Array.isArray(usage.body.resources));
  const sample = await f.admin.get("/allocations/sample");
  assert.equal(sample.body.events.length, 50);
  assert.equal(
    (await f.admin.post("/allocations/solve", { events: sample.body.events }))
      .status,
    200,
  );
  const natural = await student.post("/search/natural", {
    prompt:
      "Find a room for 20 students with a projector next Tuesday afternoon",
  });
  assert.equal(natural.status, 200);
  assert.equal(natural.body.source, "rule-based");
  assert.equal(natural.body.interpretation.minCapacity, 20);
  assert.equal(campus(natural.body.interpretation.start).hour, 12);
});
