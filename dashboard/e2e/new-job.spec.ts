import { test, expect } from "@playwright/test";
import { makeJob, mockBaselineApi } from "./fixtures";

test("creates an enrichment job and shows a success toast", async ({
  page,
}) => {
  await mockBaselineApi(page);
  await page.route(/\/api\/jobs(\?.*)?$/, async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 201,
        json: makeJob({ id: "job-new", input_filename: "records.jsonl" }),
      });
    } else {
      await route.fulfill({ json: { jobs: [], total: 0 } });
    }
  });

  await page.goto("/");
  await page.getByRole("button", { name: /run enrichment/i }).click();

  await expect(
    page.getByRole("heading", { name: /new enrichment job/i }),
  ).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({
    name: "records.jsonl",
    mimeType: "application/octet-stream",
    buffer: Buffer.from('{"email":"a@example.com"}\n'),
  });

  await page.getByRole("button", { name: /^run enrichment$/i }).click();

  await expect(page.getByText(/enrichment job queued/i)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /new enrichment job/i }),
  ).not.toBeVisible();
});

test("submit is disabled until a file is chosen", async ({ page }) => {
  await mockBaselineApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: /run enrichment/i }).click();

  await expect(
    page.getByRole("button", { name: /^run enrichment$/i }),
  ).toBeDisabled();
});

test("shows an error toast when job creation fails", async ({ page }) => {
  await mockBaselineApi(page);
  await page.route(/\/api\/jobs(\?.*)?$/, async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 503,
        json: { detail: "No active VPS configured" },
      });
    } else {
      await route.fulfill({ json: { jobs: [], total: 0 } });
    }
  });

  await page.goto("/");
  await page.getByRole("button", { name: /run enrichment/i }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "records.jsonl",
    mimeType: "application/octet-stream",
    buffer: Buffer.from('{"email":"a@example.com"}\n'),
  });
  await page.getByRole("button", { name: /^run enrichment$/i }).click();

  await expect(page.getByText(/no active vps configured/i)).toBeVisible();
});
