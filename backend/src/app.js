import express from "express";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import {
  account,
  normalizeEmail,
  validEmail,
  verifyPassword,
  view,
  sessionHash,
  sessionToken,
  sessionCookie,
  createSession,
  hashPassword,
} from "./auth.js";
import { id } from "./seeds.js";
import {
  ZONE,
  now,
  campus,
  at,
  ms,
  HOUR,
  same,
  round,
  percent,
  blocking,
  overlaps,
} from "./time.js";
import {
  ApiError,
  fail,
  validation,
  window,
  filters,
  search,
  resourceInput,
  reservationInput,
  findResource,
  conflicts,
  maintenanceConflicts,
  checkSlot,
  saveBooking,
  saveSeries,
  notify,
  bookingNotice,
  notifyOpenings,
  visibleNotification,
} from "./bookings.js";
import { forecast } from "./forecast.js";
import { plan, demoEvents } from "./allocation.js";
import { interpret, extract } from "./natural-search.js";
import { applySecurity } from "./security.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const unknownAccountHash = hashPassword(randomBytes(32).toString("hex"));
export async function bootstrap(storage, env = process.env, logger = console) {
  await storage.transact(async (state) => {
    if (state.accounts.some((a) => a.role === "Admin")) return;
    let email = env.SPACESENSE_ADMIN_EMAIL,
      password = env.SPACESENSE_ADMIN_PASSWORD;
    if (!email || !password) {
      if (env.NODE_ENV === "production") {
        throw new Error("No administrator account exists. Set SPACESENSE_ADMIN_EMAIL and SPACESENSE_ADMIN_PASSWORD.");
      }
      email = "admin@spacesense.local";
      password = randomBytes(24).toString("base64");
      logger.warn(
        `Temporary demo administrator: ${email}; password: ${password}. Set SPACESENSE_ADMIN_EMAIL and SPACESENSE_ADMIN_PASSWORD for stable credentials.`,
      );
    }
    if (!validEmail(email) || password.length < 12 || password.length > 200)
      throw new Error(
        "Configure a valid admin email and a password between 12 and 200 characters.",
      );
    if (state.accounts.some((a) => a.normalizedEmail === normalizeEmail(email)))
      throw new Error(
        "The configured admin email belongs to an existing account. Choose another email.",
      );
    state.accounts.push(
      await account(email, password, "Campus Administrator", "Admin"),
    );
  });
}
export function createApp(
  storage,
  {
    staticDirectory = process.env.SPACESENSE_STATIC_DIR ||
      (existsSync(resolve(root, "wwwroot", "index.html"))
        ? resolve(root, "wwwroot")
        : resolve(root, "../frontend/dist")),
    logger = console,
    extractor = extract,
    env = process.env,
  } = {},
) {
  const app = express();
  app.disable("x-powered-by");
  applySecurity(app, env);
  app.use(express.json({ limit: "256kb" }));
  const authenticated = (state, req, role) => {
    if (!role) return null;
    const session = state.sessions.find((s) => s.id === sessionHash(sessionToken(req)) && Date.parse(s.expiresAt) > Date.now());
    const user = session && state.accounts.find((a) => a.id === session.accountId);
    if (!user) fail(401, "Sign in to continue.");
    if (role === "Admin" && user.role !== "Admin") fail(403, "Administrator access is required.");
    return user;
  };
  const route = (method, path, role, handler, prepare) =>
    app[method](path, async (req, res) => {
      if (Object.values(req.query).some((value) => typeof value !== "string"))
        fail(400, "Query parameters must have one value each.");
      let prepared;
      if (prepare) {
        const resources = await storage.transact((state) => {
          authenticated(state, req, role);
          return structuredClone(state.resources);
        });
        prepared = await prepare({ resources, body: req.body ?? {} });
      }
      const result = await storage.transact(async (state) => {
        let user = null;
        if (role) {
          const session = state.sessions.find(
            (s) =>
              s.id === sessionHash(sessionToken(req)) &&
              Date.parse(s.expiresAt) > Date.now(),
          );
          user =
            session && state.accounts.find((a) => a.id === session.accountId);
          if (!user) fail(401, "Sign in to continue.");
          if (role === "Admin" && user.role !== "Admin")
            fail(403, "Administrator access is required.");
          session.expiresAt = new Date(
            Date.now() + 10 * 60 * 60 * 1000,
          ).toISOString();
          res.cookie("SpaceSense.Auth", sessionToken(req), sessionCookie(req));
        }
        return handler({ state, req, res, user, body: req.body ?? {}, prepared });
      });
      if (result?.location) res.location(result.location);
      if (result?.status === 204) return res.status(204).end();
      res.status(result?.status ?? 200).json(result?.body ?? result);
    });
  const ok = (body) => ({ body }),
    created = (body, location) => ({ status: 201, body, location }),
    empty = () => ({ status: 204 });
  const owned = (item, user) => {
    if (!item) fail(404, "Not found.");
    if (user.role !== "Admin" && item.ownerId !== user.id)
      fail(403, "You can manage only your own requests.");
    return item;
  };
  app.get("/api/health", async (req, res) => {
    try {
      await storage.check?.();
      res.json({ status: "ok", timeZone: ZONE, storage: storage.kind });
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  });
  route("post", "/api/auth/register", null, async ({ state, body }) => {
    const errors = {};
    if (
      typeof body.displayName !== "string" ||
      !body.displayName.trim() ||
      body.displayName.trim().length > 100
    )
      errors.displayName = [
        "Display name is required and must be 100 characters or fewer.",
      ];
    if (!validEmail(body.email))
      errors.email = ["Enter a valid email address."];
    if (
      typeof body.password !== "string" ||
      body.password.length < 12 ||
      body.password.length > 200
    )
      errors.password = ["Password must be between 12 and 200 characters."];
    validation(errors);
    if (
      state.accounts.some(
        (a) => a.normalizedEmail === normalizeEmail(body.email),
      )
    )
      fail(409, "An account with this email already exists.");
    const user = await account(body.email, body.password, body.displayName);
    state.accounts.push(user);
    return ok(view(user));
  });
  route("post", "/api/auth/login", null, async ({ state, body, req, res }) => {
    if (
      typeof body.email !== "string" ||
      !body.email.trim() ||
      typeof body.password !== "string" ||
      !body.password ||
      body.password.length > 200
    )
      fail(400, "Email and password are required.");
    const user = state.accounts.find(
      (a) => a.normalizedEmail === normalizeEmail(body.email),
    );
    const passwordMatches = await verifyPassword(body.password, user?.passwordHash || await unknownAccountHash);
    if (!user || !passwordMatches)
      fail(401, "Invalid email or password.");
    createSession(state, user, req, res);
    return ok(view(user));
  });
  route("post", "/api/auth/logout", "Student", ({ state, req, res }) => {
    state.sessions = state.sessions.filter(
      (s) => s.id !== sessionHash(sessionToken(req)),
    );
    res.clearCookie("SpaceSense.Auth", {
      ...sessionCookie(req),
      maxAge: undefined,
    });
    return empty();
  });
  route("get", "/api/auth/me", "Student", ({ user }) => ok(view(user)));
  route("get", "/api/resources", "Student", ({ state, req }) =>
    ok(search(state, filters(req.query))),
  );
  route("get", "/api/resources/:id", "Student", ({ state, req }) => {
    const resource = findResource(state, req.params.id);
    if (!resource) fail(404, "Resource not found.");
    return ok(resource);
  });
  route("get", "/api/admin/resources", "Admin", ({ state }) =>
    ok(state.resources),
  );
  route("post", "/api/admin/resources", "Admin", ({ state, body }) => {
    const resource = resourceInput(body);
    if (findResource(state, resource.id))
      fail(409, "A resource with this ID already exists.");
    state.resources.push(resource);
    return created(resource, `/api/resources/${resource.id}`);
  });
  route("put", "/api/admin/resources/:id", "Admin", ({ state, body, req }) => {
    const existing = findResource(state, req.params.id);
    if (!existing) fail(404, "Resource not found.");
    const resource = resourceInput(body, existing.id);
    state.resources = state.resources.map((r) =>
      r.id === existing.id ? resource : r,
    );
    return ok(resource);
  });
  route("delete", "/api/admin/resources/:id", "Admin", ({ state, req }) => {
    const resource = findResource(state, req.params.id);
    if (!resource) fail(404, "Resource not found.");
    if (
      [...state.reservations, ...state.maintenance, ...state.waitlist].some(
        (r) => same(r.resourceId, resource.id),
      )
    )
      fail(
        409,
        "This resource is referenced by reservations, maintenance, or waitlist entries. Update it instead of deleting it.",
      );
    state.resources = state.resources.filter((r) => r.id !== resource.id);
    return empty();
  });
  route(
    "get",
    "/api/resources/:id/availability",
    "Student",
    ({ state, req, user }) => {
      const resource = findResource(state, req.params.id);
      if (!resource) fail(404, "Resource not found.");
      const input = {
        resourceId: resource.id,
        ...window(req.query, "start", "end", true, 12),
      };
      const excluded = state.reservations.find(
        (r) =>
          r.id === req.query.excludeId &&
          (user.role === "Admin" || r.ownerId === user.id),
      );
      const booked = conflicts(
          state,
          input,
          new Set(excluded ? [excluded.id] : []),
        ),
        maintenance = maintenanceConflicts(state, input);
      return ok({
        resourceId: resource.id,
        available: !booked.length && !maintenance.length,
        conflicts:
          user.role === "Admin"
            ? booked
            : booked.map(({ start, end, status }) => ({ start, end, status })),
        maintenanceConflicts: maintenance,
      });
    },
  );
  route("get", "/api/reservations", "Student", ({ state, req, user }) => {
    const { start, end } = window(req.query, "from", "to");
    if (
      req.query.status &&
      !["pending", "confirmed", "rejected"].includes(req.query.status)
    )
      fail(400, "status must be pending, confirmed, or rejected.");
    return ok(
      state.reservations
        .filter(
          (r) =>
            (user.role === "Admin" || r.ownerId === user.id) &&
            (!start || ms(r.end) > ms(start)) &&
            (!end || ms(r.start) < ms(end)) &&
            (!req.query.status || r.status === req.query.status) &&
            (!req.query.seriesId || r.seriesId === req.query.seriesId),
        )
        .sort((a, b) => ms(a.start) - ms(b.start)),
    );
  });
  route("post", "/api/reservations", "Student", ({ state, body, user }) => {
    const input = reservationInput(state, body);
    if (input.repeatWeeks > 1) {
      const result = saveSeries(state, input, user.id);
      bookingNotice(
        state,
        result.reservations[0],
        "created",
        result.reservations.length,
      );
      return created(result, `/api/reservations?seriesId=${result.seriesId}`);
    }
    const booking = saveBooking(state, input, user.id);
    bookingNotice(state, booking);
    return created(booking, `/api/reservations/${booking.id}`);
  });
  route(
    "put",
    "/api/reservations/series/:seriesId",
    "Student",
    ({ state, body, req, user }) => {
      const input = reservationInput(state, body),
        previous = state.reservations
          .filter(
            (r) =>
              r.seriesId === req.params.seriesId &&
              ms(r.end) > Date.now() &&
              blocking(r),
          )
          .sort((a, b) => ms(a.start) - ms(b.start));
      if (!previous.length) fail(404, "No upcoming occurrences found.");
      previous.forEach((r) => owned(r, user));
      const result = saveSeries(state, input, previous[0].ownerId, previous);
      bookingNotice(
        state,
        result.reservations[0],
        "updated",
        result.reservations.length,
      );
      previous.forEach((r) => notifyOpenings(state, r));
      return ok(result);
    },
  );
  route(
    "delete",
    "/api/reservations/series/:seriesId",
    "Student",
    ({ state, req, user }) => {
      const previous = state.reservations.filter(
        (r) => r.seriesId === req.params.seriesId,
      );
      if (!previous.length) fail(404, "Series not found.");
      previous.forEach((r) => owned(r, user));
      state.reservations = state.reservations.filter(
        (r) => r.seriesId !== req.params.seriesId,
      );
      notify(
        state,
        "cancellation",
        "Weekly series cancelled",
        `${previous[0].title}: ${previous.length} occurrences were cancelled.`,
        {
          reservationId: previous[0].id,
          seriesId: req.params.seriesId,
          userId: previous[0].ownerId,
        },
      );
      previous.forEach((r) => notifyOpenings(state, r));
      return empty();
    },
  );
  route(
    "put",
    "/api/reservations/:id",
    "Student",
    ({ state, body, req, user }) => {
      const input = reservationInput(state, body),
        previous = owned(
          state.reservations.find((r) => r.id === req.params.id),
          user,
        );
      const booking = saveBooking(state, input, previous.ownerId, previous);
      bookingNotice(state, booking, "updated");
      if (
        previous.resourceId !== booking.resourceId ||
        ms(previous.start) !== ms(booking.start) ||
        ms(previous.end) !== ms(booking.end)
      )
        notifyOpenings(state, previous);
      return ok(booking);
    },
  );
  route(
    "delete",
    "/api/reservations/:id",
    "Student",
    ({ state, req, user }) => {
      const previous = owned(
        state.reservations.find((r) => r.id === req.params.id),
        user,
      );
      state.reservations = state.reservations.filter(
        (r) => r.id !== previous.id,
      );
      notify(
        state,
        "cancellation",
        "Reservation cancelled",
        `${previous.title} was cancelled.`,
        {
          reservationId: previous.id,
          seriesId: previous.seriesId,
          userId: previous.ownerId,
        },
      );
      notifyOpenings(state, previous);
      return empty();
    },
  );
  for (const action of ["approve", "reject"])
    route(
      "post",
      `/api/reservations/:id/${action}`,
      "Admin",
      ({ state, req }) => {
        const booking = state.reservations.find((r) => r.id === req.params.id);
        if (!booking) fail(404, "Reservation not found.");
        if (booking.status !== "pending")
          fail(
            409,
            `Only pending reservations can be ${action === "approve" ? "approved" : "rejected"}.`,
          );
        if (action === "approve")
          checkSlot(state, booking, new Set([booking.id]));
        booking.status = action === "approve" ? "confirmed" : "rejected";
        notify(
          state,
          "approval",
          action === "approve"
            ? "Reservation approved"
            : "Reservation declined",
          `${booking.title} was ${action === "approve" ? "confirmed" : "declined"}.`,
          {
            reservationId: booking.id,
            seriesId: booking.seriesId,
            userId: booking.ownerId,
          },
        );
        if (action === "reject") notifyOpenings(state, booking);
        return ok(booking);
      },
    );
  route("get", "/api/maintenance", "Admin", ({ state, req }) =>
    ok(
      state.maintenance
        .filter(
          (w) =>
            !req.query.resourceId || same(w.resourceId, req.query.resourceId),
        )
        .sort((a, b) => ms(a.start) - ms(b.start)),
    ),
  );
  route("post", "/api/maintenance", "Admin", ({ state, body }) => {
    const resource = findResource(state, body.resourceId),
      errors = {};
    if (!resource) errors.resourceId = ["Choose an existing resource."];
    try {
      window(body, "start", "end", true);
    } catch {
      errors.end = ["Choose a valid maintenance window of up to 90 days."];
    }
    if (ms(body.end) - ms(body.start) > 90 * 24 * HOUR)
      errors.end = ["Choose a valid maintenance window of up to 90 days."];
    if (
      typeof body.reason !== "string" ||
      !body.reason.trim() ||
      body.reason.length > 200
    )
      errors.reason = [
        "Reason is required and must be 200 characters or fewer.",
      ];
    validation(errors);
    const item = {
        id: id(),
        resourceId: resource.id,
        start: campus(body.start).toISO(),
        end: campus(body.end).toISO(),
        reason: body.reason.trim(),
      },
      booked = conflicts(state, item);
    if (booked.length)
      fail(409, "Maintenance cannot overlap an active reservation.", {
        conflicts: booked,
      });
    state.maintenance.push(item);
    return created(item, `/api/maintenance/${item.id}`);
  });
  route("delete", "/api/maintenance/:id", "Admin", ({ state, req }) => {
    const item = state.maintenance.find((w) => w.id === req.params.id);
    if (!item) fail(404, "Maintenance window not found.");
    state.maintenance = state.maintenance.filter((w) => w.id !== item.id);
    notifyOpenings(state, item);
    return empty();
  });
  route("get", "/api/waitlist", "Admin", ({ state }) =>
    ok([...state.waitlist].sort((a, b) => ms(a.createdAt) - ms(b.createdAt))),
  );
  route("post", "/api/waitlist", "Student", ({ state, body, user }) => {
    const input = reservationInput(state, body),
      maintenance = maintenanceConflicts(state, input);
    if (maintenance.length)
      fail(409, "Scheduled maintenance prevents waitlisting this time.", {
        maintenanceConflicts: maintenance,
      });
    if (!conflicts(state, input).length)
      fail(
        409,
        "This slot is currently available. Submit a reservation instead.",
      );
    const duplicate = state.waitlist.find(
      (e) =>
        e.status === "waiting" &&
        same(e.resourceId, input.resourceId) &&
        ms(e.start) === ms(input.start) &&
        ms(e.end) === ms(input.end) &&
        e.ownerId === user.id &&
        same(e.organizer, input.organizer),
    );
    if (duplicate) return ok({ entry: duplicate, duplicate: true });
    const { repeatWeeks, ...fields } = input,
      entry = {
        ...fields,
        id: id(),
        createdAt: new Date().toISOString(),
        status: "waiting",
        ownerId: user.id,
      };
    state.waitlist.push(entry);
    return created({ entry, duplicate: false }, `/api/waitlist/${entry.id}`);
  });
  const readWaitlist = (state, id) =>
    state.notifications.forEach((n) => {
      if (n.waitlistId === id) n.isRead = true;
    });
  route("delete", "/api/waitlist/:id", "Student", ({ state, req, user }) => {
    const entry = owned(
      state.waitlist.find((e) => e.id === req.params.id),
      user,
    );
    state.waitlist = state.waitlist.filter((e) => e.id !== entry.id);
    readWaitlist(state, entry.id);
    return empty();
  });
  route(
    "post",
    "/api/waitlist/:id/claim",
    "Student",
    ({ state, req, user }) => {
      const entry = owned(
        state.waitlist.find((e) => e.id === req.params.id),
        user,
      );
      if (entry.status !== "notified")
        fail(
          409,
          "This waitlist request has not been notified about an opening.",
        );
      const input = reservationInput(state, entry),
        booking = saveBooking(state, input, entry.ownerId);
      entry.status = "claimed";
      readWaitlist(state, entry.id);
      bookingNotice(state, booking);
      return created(booking, `/api/reservations/${booking.id}`);
    },
  );
  route("get", "/api/notifications", "Student", ({ state, user }) => {
    const notifications = state.notifications
      .filter((n) => visibleNotification(n, user))
      .sort((a, b) => ms(b.createdAt) - ms(a.createdAt))
      .map((notification) => ({
        ...notification,
        claimable: Boolean(
          notification.waitlistId &&
          state.waitlist.some(
            (entry) =>
              entry.id === notification.waitlistId &&
              entry.status === "notified" &&
              (user.role === "Admin" || entry.ownerId === user.id),
          ),
        ),
      }));
    return ok({
      notifications,
      unreadCount: notifications.filter((n) => !n.isRead).length,
    });
  });
  route("post", "/api/notifications/read-all", "Student", ({ state, user }) => {
    state.notifications
      .filter((n) => visibleNotification(n, user))
      .forEach((n) => {
        n.isRead = true;
      });
    return empty();
  });
  route(
    "post",
    "/api/notifications/:id/read",
    "Student",
    ({ state, req, user }) => {
      const item = state.notifications.find(
        (n) => n.id === req.params.id && visibleNotification(n, user),
      );
      if (!item) fail(404, "Notification not found.");
      item.isRead = true;
      return empty();
    },
  );
  route("post", "/api/search/natural", "Student", ({ state, prepared }) => {
    const { interpretation, llm } = prepared;
    if (
      interpretation.start &&
      ms(interpretation.end) - ms(interpretation.start) > 12 * HOUR
    )
      fail(400, "Reservations cannot exceed 12 hours.");
    const resources = search(state, interpretation);
    return ok({
      interpretation,
      resources,
      explanation: interpretation.start
        ? `Found ${resources.length} available matching resources for ${campus(interpretation.start).toFormat("MMM d, h:mm a")} to ${campus(interpretation.end).toFormat("h:mm a")} (${ZONE}).`
        : `Found ${resources.length} matching resources. Add a date and time to check availability.`,
      source: llm ? "openai+rules" : "rule-based",
    });
  }, async ({ resources, body }) => {
    if (typeof body.prompt !== "string" || !body.prompt.trim()) fail(400, "Prompt is required.");
    if (body.prompt.length > 500) fail(400, "Prompt must be 500 characters or fewer.");
    const baseline = interpret(body.prompt);
    const llm = await extractor(body.prompt.trim(), baseline, resources);
    return { interpretation: llm ?? baseline, llm };
  });
  route("get", "/api/stats/utilization", "Admin", ({ state, req }) => {
    const w = window(req.query, "from", "to"),
      from = w.start ?? at(now().toISODate(), 8),
      to = w.end ?? at(now().plus({ days: 7 }).toISODate(), 20);
    if (ms(to) <= ms(from)) fail(400, "to must be after from.");
    const hours = (ms(to) - ms(from)) / HOUR;
    const sumHours = (rows) =>
      rows.reduce(
        (sum, r) =>
          sum +
          Math.max(
            0,
            (Math.min(ms(r.end), ms(to)) - Math.max(ms(r.start), ms(from))) /
              HOUR,
          ),
        0,
      );
    const resources = state.resources
      .filter((r) => r.type !== "equipment")
      .map((r) => {
        const reservedHours = sumHours(
          state.reservations.filter(
            (b) => b.status === "confirmed" && same(b.resourceId, r.id),
          ),
        );
        const availableHours = Math.max(
          0,
          hours -
            Math.min(
              hours,
              sumHours(
                state.maintenance.filter((b) => same(b.resourceId, r.id)),
              ),
            ),
        );
        return {
          resourceId: r.id,
          reservedHours: round(reservedHours, 2),
          availableHours: round(availableHours, 2),
          utilizationPercentage: percent(reservedHours, availableHours),
        };
      });
    return ok({
      from,
      to,
      overallPercentage: percent(
        resources.reduce((s, r) => s + r.reservedHours, 0),
        resources.reduce((s, r) => s + r.availableHours, 0),
      ),
      resources,
    });
  });
  route("get", "/api/stats/forecast", "Admin", ({ state, req }) => {
    const days = req.query.days === undefined ? 14 : Number(req.query.days);
    if (!Number.isInteger(days) || days < 1 || days > 30)
      fail(400, "days must be between 1 and 30.");
    return ok(
      forecast(
        state.resources,
        state.reservations,
        now().toISODate(),
        days,
        state.maintenance,
      ),
    );
  });
  route("get", "/api/allocations/sample", "Admin", () =>
    ok({ events: demoEvents(now().plus({ days: 1 }).toISO()) }),
  );
  route("post", "/api/allocations/solve", "Admin", ({ state, body }) => {
    if (!Array.isArray(body.events))
      fail(400, "events is required and must be an array.");
    if (body.events.length > 200)
      fail(400, "A plan can contain at most 200 events.");
    return ok(
      plan(
        state.resources,
        [
          ...state.reservations,
          ...state.maintenance.map((w) => ({ ...w, status: "confirmed" })),
        ],
        body.events,
      ),
    );
  });
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "API route not found." }),
  );
  if (existsSync(resolve(staticDirectory, "index.html"))) {
    app.use(express.static(staticDirectory, {
      dotfiles: "deny",
      setHeaders(res, file) {
        res.set("Cache-Control", /[/\\]assets[/\\]index-[\w-]+\.(js|css)$/.test(file) ? "public, max-age=31536000, immutable" : "no-cache");
      },
    }));
    app.get("/{*path}", (req, res) =>
      req.path.startsWith("/assets/") || req.path.includes("/.")
        ? res.status(404).end()
        : res.set("Cache-Control", "no-cache").sendFile(resolve(staticDirectory, "index.html")),
    );
  }
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof ApiError)
      return res.status(error.status).json(error.body);
    if (error.type === "entity.parse.failed")
      return res
        .status(400)
        .json({ error: "Request body must be valid JSON." });
    if (error.type === "entity.too.large")
      return res.status(413).json({ error: "Request body is too large." });
    if (["23P01", "23505"].includes(error.code))
      return res
        .status(409)
        .json({ error: "The request conflicts with an existing record." });
    logger.error({ event: "request_failed", requestId: req.requestId, name: error.name, code: /^[A-Z0-9_]{1,40}$/.test(error.code || "") ? error.code : undefined });
    res.status(500).json({
      error: "The reservation service could not complete the request.",
    });
  });
  return app;
}
