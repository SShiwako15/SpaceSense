import { test, expect } from "@playwright/test";

const suffix = Date.now().toString(36);
const futureDate = (offset = 21) =>
  new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const nav = (page, name) =>
  page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name });
async function login(page, role = "ADMIN") {
  await page.goto("/");
  const prefix =
    role === "ADMIN" ? "SPACESENSE_ADMIN" : "SPACESENSE_DEMO_STUDENT";
  await page.getByLabel("Campus email").fill(process.env[`${prefix}_EMAIL`]);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env[`${prefix}_PASSWORD`]);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(nav(page, "Explore spaces")).toBeVisible();
}
async function search(
  page,
  query,
  date = futureDate(),
  from = "10:00",
  until = "11:00",
) {
  await nav(page, "Explore spaces").click();
  await page.getByRole("textbox", { name: "Search resources" }).fill(query);
  await page.getByLabel("Date", { exact: true }).fill(date);
  await page.getByLabel("From", { exact: true }).fill(from);
  await page.getByLabel("Until", { exact: true }).fill(until);
  const response = page.waitForResponse(
    (r) =>
      r.url().includes("/api/resources?") && r.request().method() === "GET",
  );
  await page.getByRole("button", { name: "Find spaces" }).click();
  expect((await response).ok()).toBeTruthy();
}
async function createBooking(
  page,
  name,
  { resource = "Cedar Classroom 306", repeat = "1" } = {},
) {
  await page
    .getByRole("button", { name: `Book ${resource}`, exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Event name").fill(name);
  await dialog
    .getByLabel("Organizer", { exact: true })
    .fill("Demo test organizer");
  await dialog.getByLabel("Attendees", { exact: true }).fill("10");
  await dialog.getByLabel("Repeat weekly").selectOption(repeat);
  const response = page.waitForResponse(
    (r) =>
      r.url().includes("/api/reservations") && r.request().method() === "POST",
  );
  await dialog
    .getByRole("button", { name: /Confirm booking|Request approval/ })
    .click();
  const saved = await response;
  expect(saved.status()).toBe(201);
  await expect(dialog).toHaveCount(0);
  return saved.json();
}
test.beforeEach(async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
});

test("student registration, structured and natural search, favorites, bookings, series, calendar, CSV and notifications", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Register", exact: true }).click();
  await page.getByLabel("Display name").fill("Workflow Student");
  await page
    .getByLabel("Campus email")
    .fill(`workflow-${suffix}@campus.example`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("workflow-student-password");
  await page.getByRole("button", { name: "Register and sign in" }).click();
  await expect(nav(page, "Explore spaces")).toBeVisible();
  await expect(nav(page, "Operations")).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Describe your space needs" })
    .fill(
      `Find an accessible classroom for 10 students with projector on ${futureDate()} from 10 am to 11 am`,
    );
  const natural = page.waitForResponse((r) =>
    r.url().endsWith("/api/search/natural"),
  );
  await page.getByRole("button", { name: "Ask SpaceSense" }).click();
  expect((await natural).ok()).toBeTruthy();
  // Return to an unconstrained structured search after exercising the parser.
  await page.reload();
  await search(page, "Cedar Classroom 306");
  await page
    .getByRole("button", {
      name: "Save Cedar Classroom 306 to favorites",
      exact: true,
    })
    .click();
  await page.reload();
  await search(page, "Cedar Classroom 306");
  await expect(
    page.getByRole("button", {
      name: "Remove Cedar Classroom 306 from favorites",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /Saved spaces/ }).click();
  await expect(
    page.getByRole("button", { name: "Book Cedar Classroom 306", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Saved spaces/ }).click();
  const title = `Browser booking ${suffix}`;
  await createBooking(page, title);
  await nav(page, /^Reservations/).click();
  await page.getByLabel("Search reservations").fill(title);
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `Edit ${title}`, exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Event name")
    .fill(`${title} updated`);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: `${title} updated`, exact: true }),
  ).toBeVisible();
  await page.getByLabel("Status").selectOption("confirmed");
  await page.getByLabel("Resource type").selectOption("classroom");
  await page.getByLabel("From date", { exact: true }).fill(futureDate(20));
  await page.getByLabel("Through date", { exact: true }).fill(futureDate(22));
  await expect(
    page.getByRole("heading", { name: `${title} updated`, exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const exported = await download;
  expect(exported.suggestedFilename()).toMatch(/\.csv$/);
  let csv = "";
  for await (const chunk of await exported.createReadStream()) csv += chunk;
  expect(csv).toContain(`${title} updated`);
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Week calendar", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Next week", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next week", exact: true }).click();
  await page
    .getByRole("button", { name: "Previous week", exact: true })
    .click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page
    .getByRole("button", { name: `Cancel ${title} updated`, exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: `${title} updated`, exact: true }),
  ).toHaveCount(0);
  await search(page, "Cedar Classroom 306", futureDate(18));
  const seriesTitle = `Browser weekly ${suffix}`;
  await createBooking(page, seriesTitle, { repeat: "2" });
  await nav(page, /^Reservations/).click();
  await page.getByLabel("Search reservations").fill(seriesTitle);
  await expect(
    page.getByRole("heading", { name: seriesTitle, exact: true }),
  ).toHaveCount(2);
  await page
    .getByRole("button", {
      name: `Edit weekly series for ${seriesTitle}`,
      exact: true,
    })
    .first()
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Event name")
    .fill(`${seriesTitle} updated`);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: `${seriesTitle} updated`, exact: true }),
  ).toHaveCount(2);
  await page
    .getByRole("button", { name: `Cancel ${seriesTitle} updated`, exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: `${seriesTitle} updated`, exact: true }),
  ).toHaveCount(1);
  await page
    .getByRole("button", {
      name: `Cancel entire weekly series for ${seriesTitle} updated`,
      exact: true,
    })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: `${seriesTitle} updated`, exact: true }),
  ).toHaveCount(0);
  await search(page, "Discovery Computer Lab", futureDate(19));
  await createBooking(page, `Browser lab ${suffix}`, {
    resource: "Discovery Computer Lab",
  });
  await nav(page, /^Notifications/).click();
  await expect(
    page.getByRole("heading", { name: "Notifications", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Mark all read", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Mark all read", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("administrator catalog CRUD, maintenance, approvals, utilization, forecasting and both allocation inputs", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page);
  const approvalTitle = `Browser approval ${suffix}`;
  const pending = await page.request.post("/api/reservations", {
    data: {
      resourceId: "lab-west",
      title: approvalTitle,
      organizer: "Test organizer",
      start: `${futureDate(24)}T18:00:00Z`,
      end: `${futureDate(24)}T19:00:00Z`,
      attendees: 10,
    },
  });
  expect(pending.status()).toBe(201);
  await nav(page, "Operations").click();
  await expect(
    page.getByRole("heading", { name: "Space intelligence", exact: true }),
  ).toBeVisible();
  const catalog = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Manage resources", exact: true }),
  });
  const resourceId = `browser-room-${suffix}`,
    resourceName = `Browser Room ${suffix}`;
  await catalog.getByLabel("Resource ID", { exact: true }).fill(resourceId);
  await catalog.getByLabel("Name", { exact: true }).fill(resourceName);
  await catalog
    .getByLabel("Building / location", { exact: true })
    .fill("Demo Hall");
  await catalog.getByLabel("Capacity", { exact: true }).fill("30");
  await catalog
    .getByLabel("Features (comma-separated)", { exact: true })
    .fill("projector, whiteboard");
  await catalog
    .getByRole("button", { name: "Add resource", exact: true })
    .click();
  await expect(
    catalog.getByRole("button", { name: `Edit ${resourceName}`, exact: true }),
  ).toBeVisible();
  await catalog
    .getByRole("button", { name: `Edit ${resourceName}`, exact: true })
    .click();
  await catalog
    .getByLabel("Name", { exact: true })
    .fill(`${resourceName} updated`);
  await catalog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(
    catalog.getByRole("button", {
      name: `Edit ${resourceName} updated`,
      exact: true,
    }),
  ).toBeVisible();
  const maintenance = page.locator("section").filter({
    has: page.getByRole("heading", {
      name: "Maintenance windows",
      exact: true,
    }),
  });
  await maintenance.getByLabel("Resource").selectOption(resourceId);
  await maintenance
    .getByLabel("Reason", { exact: true })
    .fill(`Demo service ${suffix}`);
  await maintenance
    .getByLabel("Starts (Eastern campus time)", { exact: true })
    .fill(`${futureDate()}T10:00`);
  await maintenance
    .getByLabel("Ends", { exact: true })
    .fill(`${futureDate()}T11:00`);
  await maintenance
    .getByRole("button", { name: "Schedule maintenance", exact: true })
    .click();
  await expect(
    maintenance.getByText(`Demo service ${suffix}`, { exact: false }),
  ).toBeVisible();
  await maintenance
    .locator("article")
    .filter({ hasText: `Demo service ${suffix}` })
    .getByRole("button", { name: "Remove", exact: true })
    .click();
  await expect(
    maintenance
      .locator("article")
      .filter({ hasText: `Demo service ${suffix}` }),
  ).toHaveCount(0);
  await catalog
    .getByRole("button", {
      name: `Delete ${resourceName} updated`,
      exact: true,
    })
    .click();
  await expect(
    catalog.getByRole("button", {
      name: `Delete ${resourceName} updated`,
      exact: true,
    }),
  ).toHaveCount(0);
  const approvals = page.locator("section").filter({
    has: page.getByRole("heading", {
      name: "Pending approvals",
      exact: true,
    }),
  });
  await approvals
    .locator("article")
    .filter({ hasText: approvalTitle })
    .getByRole("button", { name: "Approve", exact: true })
    .click();
  await expect(
    approvals.locator("article").filter({ hasText: approvalTitle }),
  ).toHaveCount(0);
  const declineTitle = `Declined request ${suffix}`;
  const declineRequest = await page.request.post("/api/reservations", {
    data: {
      resourceId: "lab-west",
      title: declineTitle,
      organizer: "Test organizer",
      start: `${futureDate(24)}T19:00:00Z`,
      end: `${futureDate(24)}T20:00:00Z`,
      attendees: 10,
    },
  });
  expect(declineRequest.status()).toBe(201);
  await approvals.getByRole("button", { name: "Refresh", exact: true }).click();
  await approvals
    .locator("article")
    .filter({ hasText: declineTitle })
    .getByRole("button", { name: "Decline", exact: true })
    .click();
  await expect(
    approvals.locator("article").filter({ hasText: declineTitle }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Room utilization", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "The next 14 days", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Load 50 sample events", exact: true })
    .click();
  await expect(
    page.getByText("50 events ready to allocate", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Calculate allocation", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /of 50 events placed/ }),
  ).toBeVisible();
  await page.getByText("Provide your own events", { exact: true }).click();
  await page
    .getByRole("textbox", { name: "Custom allocation events JSON" })
    .fill(
      JSON.stringify([
        {
          id: "custom",
          title: "Custom demo event",
          start: `${futureDate()}T15:00:00Z`,
          end: `${futureDate()}T16:00:00Z`,
          attendees: 10,
          requiredFeatures: ["projector"],
          accessible: true,
          priority: 5,
        },
      ]),
    );
  await page
    .getByRole("button", { name: "Use these events", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Calculate allocation", exact: true })
    .click();
  await expect(
    page.getByText("Custom demo event", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/demo-admin-desktop.png",
    fullPage: true,
  });
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("waitlist join, administrator review, cancellation notification and student claim", async ({
  page,
  browser,
}) => {
  await login(page);
  await search(page, "Cedar Classroom 305", futureDate(22));
  const blockerTitle = `Waitlist blocker ${suffix}`;
  await createBooking(page, blockerTitle, { resource: "Cedar Classroom 305" });
  const studentContext = await browser.newContext({
    timezoneId: "America/New_York",
    viewport: { width: 1440, height: 1000 },
  });
  try {
    const student = await studentContext.newPage();
    student.on("dialog", (dialog) => dialog.accept());
    await student.goto(
      process.env.PLAYWRIGHT_BASE_URL || "http://localhost:8080",
    );
    await student
      .getByLabel("Campus email")
      .fill(process.env.SPACESENSE_DEMO_STUDENT_EMAIL);
    await student
      .getByLabel("Password", { exact: true })
      .fill(process.env.SPACESENSE_DEMO_STUDENT_PASSWORD);
    await student.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(nav(student, "Explore spaces")).toBeVisible();
    await search(student, "Cedar Classroom 305", futureDate(22));
    await expect(
      student.getByRole("heading", {
        name: "No spaces match this search",
        exact: true,
      }),
    ).toBeVisible();
    await student
      .getByRole("button", { name: "Join the waitlist", exact: true })
      .click();
    await student
      .getByLabel("Resource matching your requirements")
      .selectOption("class-305");
    const requestTitle = `Waitlist request ${suffix}`;
    await student.getByLabel("Event name", { exact: true }).fill(requestTitle);
    await student.getByLabel("Organizer", { exact: true }).fill("Demo Student");
    await student.getByLabel("Attendees", { exact: true }).fill("10");
    await student
      .getByRole("button", { name: "Join waitlist", exact: true })
      .click();
    await expect(
      student.getByRole("button", { name: "Join waitlist", exact: true }),
    ).toHaveCount(0);
    await nav(page, "Operations").click();
    const queue = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Slot waitlist", exact: true }),
    });
    await expect(
      queue.locator("article").filter({ hasText: requestTitle }),
    ).toBeVisible();
    await nav(page, /^Reservations/).click();
    await page
      .getByLabel("Search reservations", { exact: true })
      .fill(blockerTitle);
    await page
      .getByRole("button", { name: `Cancel ${blockerTitle}`, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: blockerTitle, exact: true }),
    ).toHaveCount(0);
    await nav(student, /^Notifications/).click();
    await student
      .getByRole("button", { name: "Claim slot", exact: true })
      .click();
    await expect(
      student.getByRole("heading", { name: requestTitle, exact: true }),
    ).toBeVisible();
    await nav(student, /^Notifications/).click();
    await expect(
      student.getByRole("button", { name: "Claim slot", exact: true }),
    ).toHaveCount(0);
    await nav(student, /^Reservations/).click();
    await student
      .getByRole("button", { name: `Cancel ${requestTitle}`, exact: true })
      .click();
    await expect(
      student.getByRole("heading", { name: requestTitle, exact: true }),
    ).toHaveCount(0);
    await nav(page, "Operations").click();
    await queue.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(
      queue
        .locator("article")
        .filter({ hasText: requestTitle })
        .getByText("claimed", { exact: true }),
    ).toBeVisible();
    await queue
      .locator("article")
      .filter({ hasText: requestTitle })
      .getByRole("button", { name: "Remove", exact: true })
      .click();
    await expect(
      queue.locator("article").filter({ hasText: requestTitle }),
    ).toHaveCount(0);
  } finally {
    await studentContext.close();
  }
});

test("mobile navigation, seeded student reservations and account switching", async ({
  page,
}) => {
  await login(page, "STUDENT");
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await nav(page, /^Reservations/).click();
  await expect(
    page.getByRole("heading", { name: "Reservations", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Demo study group", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/demo-student-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back", exact: true }),
  ).toBeVisible();
});

test("redesigned booking workspace, equipment request, assistant shortcuts and responsive layouts", async ({ page }) => {
  await page.goto("/");
  await page.screenshot({ path: "test-results/redesign-sign-in.png" });
  await login(page, "STUDENT");
  await expect(page.getByRole("heading", { name: "Less searching. More getting together." })).toBeVisible();
  await expect(page.locator(".resource-card").first()).toBeVisible();
  await page.screenshot({ path: "test-results/redesign-desktop.png" });
  await page.getByRole("button", { name: "Let AI find a space" }).click();
  await expect(page.getByRole("textbox", { name: "Describe your space needs" })).toBeFocused();
  await page.locator(".assistant-suggestions button").first().click();
  await expect(page.getByRole("textbox", { name: "Describe your space needs" })).toHaveValue(/20 students/);
  await page.locator(".more-filters summary").click();
  await page.getByRole("button", { name: "Accessible", exact: true }).click();
  await expect(page.getByRole("button", { name: "Accessible", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Filters changed. Select Find spaces to update results.")).toBeVisible();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByRole("button", { name: "Accessible", exact: true })).toHaveAttribute("aria-pressed", "false");
  await nav(page, "Find equipment").click();
  await expect(page.getByLabel("Space type")).toHaveValue("equipment");
  await expect(page.locator(".resource-card")).toHaveCount(2);
  await expect(page.locator(".type-badge")).toHaveText(["equipment", "equipment"]);
  await page.getByLabel("Date", { exact: true }).fill(futureDate(23));
  await page.getByRole("button", { name: "Find spaces", exact: true }).click();
  await page.getByRole("button", { name: "Book Portable Projector Kit", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Units", { exact: true })).toHaveAttribute("max", "1");
  await dialog.getByLabel("Event name").fill(`Equipment demo ${suffix}`);
  await dialog.getByLabel("Organizer", { exact: true }).fill("Demo Student");
  await dialog.getByLabel("Units", { exact: true }).fill("1");
  await page.screenshot({ path: "test-results/redesign-booking-dialog.png" });
  await dialog.getByRole("button", { name: "Request approval", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await nav(page, /^Reservations/).click();
  const row = page.locator("article").filter({ hasText: `Equipment demo ${suffix}` });
  await expect(row.getByText("pending", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: `Cancel Equipment demo ${suffix}`, exact: true }).click();
  await expect(row).toHaveCount(0);
  await page.getByRole("button", { name: "Dismiss notification", exact: true }).click();
  await nav(page, "Explore spaces").click();
  await expect(page.getByLabel("Space type")).toHaveValue("");
  for (const width of [850, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.getByRole("button", { name: "Open navigation", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await page.getByRole("button", { name: "Let AI find a space" }).click();
    await expect(page.getByRole("textbox", { name: "Describe your space needs" })).toBeFocused();
    if (width === 390) await page.screenshot({ path: "test-results/redesign-mobile-assistant.png" });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.screenshot({ path: "test-results/redesign-mobile.png" });
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await nav(page, "Find equipment").click();
  await expect(page.getByRole("heading", { name: "Find the right equipment." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open navigation", exact: true })).toBeVisible();
});
