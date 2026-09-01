import { test, expect } from "@playwright/test";
import { makeZeroBounceJob, mockBaselineApi } from "./fixtures";

test("creates a ZeroBounce job and shows a success toast", async ({ page }) => {
  await mockBaselineApi(page);
  await page.route(/\/api\/zerobounce(\?.*)?$/, async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        json: makeZeroBounceJob({ id: "zb-new", input_filename: "emails.csv" }),
      });
    } else {
      await route.fulfill({ json: [] });
    }
  });

  await page.goto("/");
  await page.getByRole("button", { name: /run zerobounce/i }).click();

  await expect(
    page.getByRole("heading", { name: /run zerobounce/i }),
  ).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({
    name: "emails.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("email\na@example.com\n"),
  });

  await page.getByRole("button", { name: /^run zerobounce$/i }).click();

  await expect(page.getByText(/zerobounce job queued/i)).toBeVisible();
});

test("defaults the email column to 'email'", async ({ page }) => {
  await mockBaselineApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: /run zerobounce/i }).click();

  await expect(page.getByLabel(/email column name/i)).toHaveValue("email");
});
