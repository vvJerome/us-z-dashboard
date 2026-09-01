import { test, expect } from "@playwright/test";
import { makeJob, makeZeroBounceJob, mockBaselineApi } from "./fixtures";

test("shows enrichment and ZeroBounce jobs split into tabs", async ({
  page,
}) => {
  await mockBaselineApi(page, {
    jobs: [makeJob({ id: "job-1", input_filename: "wi_full.jsonl" })],
    zeroBounceJobs: [
      makeZeroBounceJob({ id: "zb-1", input_filename: "emails.csv" }),
    ],
  });

  await page.goto("/");

  await expect(
    page.getByRole("tab", { name: /enrichment jobs/i }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: /zerobounce/i })).toBeVisible();
  await expect(page.getByText("wi_full.jsonl")).toBeVisible();
  await expect(page.getByText("emails.csv")).not.toBeVisible();

  await page.getByRole("tab", { name: /zerobounce/i }).click();

  await expect(page.getByText("emails.csv")).toBeVisible();
  await expect(page.getByText("wi_full.jsonl")).not.toBeVisible();
});

test("shows an empty state when there are no jobs", async ({ page }) => {
  await mockBaselineApi(page);

  await page.goto("/");

  await expect(
    page.getByText(/no jobs yet\. run your first enrichment above\./i),
  ).toBeVisible();
});
