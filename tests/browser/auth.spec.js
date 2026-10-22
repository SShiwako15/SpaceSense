import { test, expect } from "@playwright/test";

test("space login assets, password visibility, validation, responsive registration and email sign-in", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welcome back", exact: true })).toBeVisible();
  const logo = page.getByRole("img", { name: "SpaceSense AI logo" });
  await expect(logo).toBeVisible();
  await expect.poll(() => logo.evaluate((image) => image.complete && image.naturalWidth > 0)).toBeTruthy();
  expect((await page.request.get("/assets/login-nebula.png")).ok()).toBeTruthy();
  await expect(page.getByRole("button", { name: /google|github|facebook|apple|microsoft|sso/i })).toHaveCount(0);
  await page.getByLabel("Password", { exact: true }).fill("visibility-check");
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show password", exact: true }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide password", exact: true }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "password");
  await page.getByLabel("Password", { exact: true }).fill("");
  await page.screenshot({ path: "test-results/space-login-desktop.png" });

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    if (width === 390) await page.screenshot({ path: "test-results/space-login-mobile.png", fullPage: true });
    await page.getByRole("button", { name: "Register", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Create a student account", exact: true })).toBeVisible();
    await expect(page.getByLabel("Display name")).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("minlength", "12");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel("Campus email").fill(process.env.SPACESENSE_DEMO_STUDENT_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill("intentionally-incorrect-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  await page.getByLabel("Password", { exact: true }).fill(process.env.SPACESENSE_DEMO_STUDENT_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  const workspaceLogo = page.getByRole("button", { name: "SpaceSense AI home" }).locator("img");
  await expect.poll(() => workspaceLogo.evaluate((image) => image.complete && image.naturalWidth > 0)).toBeTruthy();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Welcome back", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
