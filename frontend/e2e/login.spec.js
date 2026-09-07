import { test, expect } from "@playwright/test";

test("logs in with correct credentials and reaches the dashboard", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[type="email"]', "admin@onetouchelectrical.com");
  await page.fill('input[type="password"]', "ChangeMe123!");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard");
  await expect(page.getByText("Technical Manager")).toBeVisible();
});

test("shows an error for a wrong password and stays on the login page", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[type="email"]', "admin@onetouchelectrical.com");
  await page.fill('input[type="password"]', "definitely-wrong-password");
  await page.click('button[type="submit"]');
  await expect(page.getByText(/invalid credentials/i)).toBeVisible();
  await expect(page).toHaveURL(/login/);
});
