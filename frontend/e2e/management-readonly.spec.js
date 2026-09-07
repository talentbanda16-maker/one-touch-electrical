import { test, expect } from "@playwright/test";

// One shared login for both assertions — every real POST /auth/login
// (success or failure) counts against the app's own login rate limiter,
// which is shared across the whole E2E run just like it would be in
// production; logging in once per file instead of once per test keeps
// the suite's total login volume comfortably under that limit.
test("Management dashboard and Action Tracker respect its read-only, Technical-Manager-scoped role", async ({
  page,
}) => {
  await page.goto("/login");
  await page.fill('input[type="email"]', "management@onetouchelectrical.com");
  await page.fill('input[type="password"]', "ChangeMe123!");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard");

  await page.goto("/actions");
  await expect(page.getByText("Raise a new action")).not.toBeVisible();
  await expect(page.getByText("Actions assigned to the Technical Manager")).toBeVisible();

  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Management dashboard" }).click();
  await page.waitForURL("**/dashboard/management");
  await expect(page.getByText("Open actions (Technical Manager)")).toBeVisible();
  await expect(page.getByText("Open instructions (Technical Manager)")).toBeVisible();
});
