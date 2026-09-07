import { test, expect } from "@playwright/test";

async function login(page, email, password = "ChangeMe123!") {
  await page.goto("/login");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard");
}

test("a Foreman-submitted report shows up for the Technical Manager and can be approved", async ({ page }) => {
  const marker = `E2E golden path ${Date.now()}`;

  await login(page, "foreman@onetouchelectrical.com");
  await page.goto("/reports/foreman");
  await page.fill("textarea", marker); // "Work completed today" is the first textarea on the form
  await page.getByRole("button", { name: "Submit report", exact: true }).click();
  await expect(page.getByText(/report submitted/i)).toBeVisible({ timeout: 10000 });

  await login(page, "admin@onetouchelectrical.com");
  await page.goto("/approvals");
  const row = page.locator("button", { hasText: "Foreman" }).last();
  await row.click();
  await expect(page.getByText(marker)).toBeVisible();

  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText(marker)).not.toBeVisible();
});
