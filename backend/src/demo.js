import {
  account,
  normalizeEmail,
  validEmail,
  hashPassword,
  verifyPassword,
} from "./auth.js";
import { now, at } from "./time.js";
import {
  findResource,
  conflicts,
  maintenanceConflicts,
  saveBooking,
  bookingNotice,
} from "./bookings.js";

export async function bootstrapDemo(storage, env = process.env) {
  if (env.SPACESENSE_DEMO_MODE !== "true") return;
  const email = env.SPACESENSE_DEMO_STUDENT_EMAIL;
  const password = env.SPACESENSE_DEMO_STUDENT_PASSWORD;
  const adminEmail = env.SPACESENSE_ADMIN_EMAIL;
  const adminPassword = env.SPACESENSE_ADMIN_PASSWORD;
  const validPassword = (value) =>
    typeof value === "string" && value.length >= 12 && value.length <= 200;
  if (!validEmail(email) || !validPassword(password)) {
    throw new Error(
      "Configure a demo student email and a password between 12 and 200 characters.",
    );
  }
  if (
    (adminEmail || adminPassword) &&
    (!validEmail(adminEmail) || !validPassword(adminPassword))
  ) {
    throw new Error(
      "Configure a demo administrator email and a password between 12 and 200 characters.",
    );
  }
  await storage.transact(async (state) => {
    async function ensureAccount(email, password, displayName, role) {
      const existing = state.accounts.find(
        (user) => user.normalizedEmail === normalizeEmail(email),
      );
      if (!existing) {
        const user = await account(email, password, displayName, role);
        state.accounts.push(user);
        return { user, created: true };
      }
      if (existing.role !== role)
        throw new Error(
          `The configured demo ${role.toLowerCase()} email belongs to an account with another role.`,
        );
      if (!(await verifyPassword(password, existing.passwordHash))) {
        existing.passwordHash = await hashPassword(password);
        state.sessions = state.sessions.filter(
          (session) => session.accountId !== existing.id,
        );
      }
      return { user: existing, created: false };
    }
    if (adminEmail)
      await ensureAccount(
        adminEmail,
        adminPassword,
        "Campus Administrator",
        "Admin",
      );
    const { user: student, created } = await ensureAccount(
      email,
      password,
      "Demo Student",
      "Student",
    );
    if (!created) return;
    let date = now().plus({ days: 1 });
    while (date.weekday > 5) date = date.plus({ days: 1 });
    for (const [resourceId, title, hour, attendees] of [
      ["class-202", "Demo study group", 11, 12],
      ["lab-west", "Demo lab approval request", 14, 20],
    ]) {
      const resource = findResource(state, resourceId);
      const input = {
        resourceId,
        title,
        organizer: student.displayName,
        start: at(date.toISODate(), hour),
        end: at(date.toISODate(), hour + 1),
        attendees,
      };
      if (
        !resource ||
        resource.capacity < attendees ||
        conflicts(state, input).length ||
        maintenanceConflicts(state, input).length
      )
        continue;
      const booking = saveBooking(state, input, student.id);
      bookingNotice(state, booking);
    }
  });
}
