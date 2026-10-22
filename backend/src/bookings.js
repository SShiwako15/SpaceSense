import { id } from "./seeds.js";
import { campus, ms, HOUR, overlaps, blocking, same } from "./time.js";

export class ApiError extends Error {
  constructor(status, body) {
    super(body.error || body.title || "Request failed.");
    this.status = status;
    this.body = body;
  }
}
export const fail = (status, error, extra = {}) => {
  throw new ApiError(status, { error, ...extra });
};
export const validation = (errors) => {
  if (Object.keys(errors).length)
    throw new ApiError(400, {
      title: "One or more validation errors occurred.",
      status: 400,
      errors,
    });
};
export const findResource = (state, id) =>
  state.resources.find((r) => same(r.id, id));
const nonblank = (value, max) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max;
export function reservationInput(state, input) {
  const errors = {},
    resource = findResource(state, input.resourceId);
  if (!resource) errors.resourceId = ["Choose an existing resource."];
  if (!nonblank(input.title, 120))
    errors.title = ["Title is required and must be 120 characters or fewer."];
  if (!nonblank(input.organizer, 120))
    errors.organizer = [
      "Organizer is required and must be 120 characters or fewer.",
    ];
  if (
    !validDate(input.start) ||
    !validDate(input.end) ||
    ms(input.end) <= ms(input.start)
  )
    errors.end = ["End time must be after start time."];
  else if (ms(input.end) - ms(input.start) > 12 * HOUR)
    errors.end = ["Reservations cannot exceed 12 hours."];
  if (
    !Number.isInteger(input.attendees) ||
    input.attendees < 1 ||
    (resource && input.attendees > resource.capacity)
  )
    errors.attendees = [
      "Attendees must be between 1 and the resource capacity.",
    ];
  const repeatWeeks = input.repeatWeeks ?? 1;
  if (!Number.isInteger(repeatWeeks) || repeatWeeks < 1 || repeatWeeks > 12)
    errors.repeatWeeks = ["Repeat weeks must be between 1 and 12."];
  validation(errors);
  return {
    resourceId: resource.id,
    title: input.title.trim(),
    organizer: input.organizer.trim(),
    start: campus(input.start).toISO(),
    end: campus(input.end).toISO(),
    attendees: input.attendees,
    repeatWeeks,
  };
}
export const validDate = (value) =>
  typeof value === "string" &&
  /T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value) &&
  campus(value).isValid;
export function window(
  query,
  first = "start",
  last = "end",
  required = false,
  maxHours,
) {
  const start = query[first] || null,
    end = query[last] || null;
  if (required && (!start || !end))
    fail(400, `${first} and ${last} are required.`);
  if (first === "start" && Boolean(start) !== Boolean(end))
    fail(400, "start and end must be provided together.");
  for (const [key, value] of [
    [first, start],
    [last, end],
  ])
    if (value && !validDate(value))
      fail(400, `${key} must be a valid ISO date and time with a UTC offset.`);
  if (start && end && ms(end) <= ms(start))
    fail(400, `${last} must be after ${first}.`);
  if (start && end && maxHours && ms(end) - ms(start) > maxHours * HOUR)
    fail(400, `Reservations cannot exceed ${maxHours} hours.`);
  return { start, end };
}
export function resourceInput(input, idOverride) {
  const errors = {},
    resource = {
      id:
        idOverride ??
        (typeof input.id === "string" ? input.id.trim().toLowerCase() : ""),
      name: input.name,
      type: input.type?.toLowerCase?.().trim(),
      building: input.building,
      capacity: input.capacity,
      features: input.features ?? [],
      accessible: input.accessible ?? false,
      description: input.description ?? "",
      requiresApproval: input.requiresApproval ?? false,
    };
  if (!/^[a-z0-9][a-z0-9-]{1,49}$/.test(resource.id))
    errors.id = [
      "ID must be 2–50 lowercase letters, numbers, or hyphens, starting with a letter or number.",
    ];
  for (const field of ["name", "building"])
    if (!nonblank(resource[field], 100))
      errors[field] = [
        `${field} is required and must be 100 characters or fewer.`,
      ];
  if (!["classroom", "lab", "study", "equipment"].includes(resource.type))
    errors.type = ["Type must be classroom, lab, study, or equipment."];
  if (
    !Number.isInteger(resource.capacity) ||
    resource.capacity < 1 ||
    resource.capacity > 500
  )
    errors.capacity = ["Capacity must be between 1 and 500."];
  if (
    !Array.isArray(resource.features) ||
    resource.features.length > 20 ||
    resource.features.some((f) => !nonblank(f, 60))
  )
    errors.features = [
      "Provide up to 20 nonblank features, each 60 characters or fewer.",
    ];
  if (
    typeof resource.description !== "string" ||
    resource.description.length > 300
  )
    errors.description = ["Description must be 300 characters or fewer."];
  for (const field of ["accessible", "requiresApproval"])
    if (typeof resource[field] !== "boolean")
      errors[field] = ["Must be true or false."];
  validation(errors);
  return {
    ...resource,
    name: resource.name.trim(),
    building: resource.building.trim(),
    description: resource.description.trim(),
    features: [
      ...new Map(
        resource.features.map((f) => [f.trim().toLowerCase(), f.trim()]),
      ).values(),
    ],
  };
}
export function conflicts(state, input, exclude = new Set()) {
  return state.reservations.filter(
    (r) =>
      !exclude.has(r.id) &&
      same(r.resourceId, input.resourceId) &&
      blocking(r) &&
      overlaps(r, input),
  );
}
export const maintenanceConflicts = (state, input) =>
  state.maintenance.filter(
    (r) => same(r.resourceId, input.resourceId) && overlaps(r, input),
  );
export function checkSlot(state, input, exclude) {
  const maintenance = maintenanceConflicts(state, input);
  if (maintenance.length)
    fail(409, "The selected time overlaps scheduled maintenance.", {
      maintenanceConflicts: maintenance,
    });
  const booked = conflicts(state, input, exclude);
  if (booked.length)
    fail(409, "Resource is already booked for this time.", {
      conflicts: booked,
    });
}
export function notify(state, type, title, message, extra = {}) {
  state.notifications.push({
    id: id(),
    type,
    title,
    message,
    createdAt: new Date().toISOString(),
    isRead: false,
    reservationId: null,
    seriesId: null,
    waitlistId: null,
    userId: null,
    audienceRole: null,
    ...extra,
  });
  state.notifications.sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
  state.notifications = state.notifications.slice(0, 250);
}
export function bookingNotice(state, booking, action = "created", count = 1) {
  const pending = booking.status === "pending";
  notify(
    state,
    pending ? "approval" : "reservation",
    pending
      ? "Reservation needs approval"
      : action === "updated"
        ? "Reservation updated"
        : "Reservation confirmed",
    `${booking.title}${count > 1 ? `: ${count} weekly occurrences` : ""} in ${findResource(state, booking.resourceId)?.name ?? "campus resource"} for ${campus(booking.start).toFormat("MMM d, h:mm a")}.`,
    {
      reservationId: booking.id,
      seriesId: booking.seriesId,
      userId: booking.ownerId,
    },
  );
  if (pending)
    notify(
      state,
      "approval",
      "Reservation needs review",
      `${booking.title} is awaiting staff approval.`,
      {
        reservationId: booking.id,
        seriesId: booking.seriesId,
        audienceRole: "Admin",
      },
    );
}
export function notifyOpenings(state, previous) {
  for (const entry of state.waitlist.filter(
    (e) =>
      e.status === "waiting" &&
      same(e.resourceId, previous.resourceId) &&
      overlaps(e, previous),
  )) {
    if (
      conflicts(state, entry).length ||
      maintenanceConflicts(state, entry).length
    )
      continue;
    entry.status = "notified";
    notify(
      state,
      "waitlist",
      "A waitlisted slot is available",
      `${entry.title} in ${findResource(state, entry.resourceId)?.name ?? "campus resource"} is now available. Claim it before someone else books it.`,
      { waitlistId: entry.id, userId: entry.ownerId },
    );
  }
}
export const visibleNotification = (n, user) =>
  n.userId === user.id ||
  same(n.audienceRole, user.role) ||
  (!n.userId && !n.audienceRole && user.role === "Admin");
export function saveBooking(state, input, ownerId, existing) {
  checkSlot(state, input, new Set(existing ? [existing.id] : []));
  const booking = {
    id: existing?.id ?? id(),
    resourceId: input.resourceId,
    title: input.title,
    organizer: input.organizer,
    start: input.start,
    end: input.end,
    attendees: input.attendees,
    status:
      findResource(state, input.resourceId).requiresApproval ||
      existing?.status === "pending"
        ? "pending"
        : "confirmed",
    seriesId: existing?.seriesId ?? null,
    ownerId: existing?.ownerId ?? ownerId,
  };
  state.reservations = state.reservations
    .filter((r) => r.id !== booking.id)
    .concat(booking);
  return booking;
}
export function saveSeries(state, input, ownerId, previous) {
  const seriesId = previous?.[0].seriesId ?? id(),
    count = previous?.length ?? input.repeatWeeks;
  const exclude = new Set(previous?.map((r) => r.id) ?? []),
    occurrences = [];
  for (let index = 0; index < count; index++) {
    // Calendar arithmetic keeps campus wall time across daylight-saving changes.
    const start = campus(input.start).plus({ weeks: index }),
      end = campus(input.end).plus({ weeks: index });
    if (end <= start || end - start > 12 * HOUR)
      fail(
        400,
        "The repeated time window is invalid or exceeds 12 hours after a campus time change.",
      );
    const occurrence = {
      id: previous?.[index].id ?? id(),
      resourceId: input.resourceId,
      title: input.title,
      organizer: input.organizer,
      start: start.toISO(),
      end: end.toISO(),
      attendees: input.attendees,
      status:
        findResource(state, input.resourceId).requiresApproval ||
        previous?.[index].status === "pending"
          ? "pending"
          : "confirmed",
      seriesId,
      ownerId: previous?.[index].ownerId ?? ownerId,
    };
    checkSlot(state, occurrence, exclude);
    occurrences.push(occurrence);
  }
  state.reservations = state.reservations
    .filter((r) => !exclude.has(r.id))
    .concat(occurrences);
  return { seriesId, reservations: occurrences };
}
export function filters(query) {
  const times = window(query, "start", "end", false, 12);
  let minCapacity = null,
    accessible = null;
  if (query.minCapacity !== undefined) {
    minCapacity = Number(query.minCapacity);
    if (
      !/^\d+$/.test(query.minCapacity) ||
      !Number.isSafeInteger(minCapacity) ||
      minCapacity < 1
    )
      fail(400, "minCapacity must be a positive integer.");
  }
  if (query.accessible !== undefined) {
    if (!["true", "false"].includes(String(query.accessible).toLowerCase()))
      fail(400, "accessible must be true or false.");
    accessible = String(query.accessible).toLowerCase() === "true";
  }
  return {
    query: query.query,
    type: query.type,
    minCapacity,
    accessible,
    features:
      typeof query.features === "string"
        ? query.features
            .split(",")
            .map((f) => f.trim())
            .filter(Boolean)
        : [],
    ...times,
  };
}
export function search(state, filters) {
  return state.resources.filter(
    (r) =>
      (!filters.query ||
        [r.name, r.type, r.building, r.description, ...r.features].some((v) =>
          v.toLowerCase().includes(filters.query.trim().toLowerCase()),
        )) &&
      (!filters.type ||
        (same(filters.type, "room")
          ? r.type !== "equipment"
          : same(r.type, filters.type))) &&
      (!filters.minCapacity || r.capacity >= filters.minCapacity) &&
      (filters.accessible == null || r.accessible === filters.accessible) &&
      (filters.features ?? []).every((f) =>
        r.features.some((v) => same(v, f)),
      ) &&
      (!filters.start ||
        !filters.end ||
        (!conflicts(state, { ...filters, resourceId: r.id }).length &&
          !maintenanceConflicts(state, { ...filters, resourceId: r.id })
            .length)),
  );
}
