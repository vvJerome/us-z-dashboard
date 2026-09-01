import { test, expect } from "@playwright/test";
import { makeJob, mockBaselineApi } from "./fixtures";

test("cancels a running job", async ({ page }) => {
  const runningJob = makeJob({
    id: "job-running",
    status: "RUNNING",
    input_filename: "wi_full.jsonl",
    started_at: new Date().toISOString(),
  });
  await mockBaselineApi(page, { jobs: [runningJob] });

  let deleteCalled = false;
  await page.route("**/api/jobs/job-running", async (route) => {
    if (route.request().method() === "DELETE") {
      deleteCalled = true;
      await route.fulfill({ status: 204, body: "" });
    } else {
      await route.fulfill({
        json: { ...runningJob, status: "CANCELLED" },
      });
    }
  });

  await page.goto("/");
  await expect(page.getByText("wi_full.jsonl")).toBeVisible();

  await page.getByRole("button", { name: /^cancel$/i }).click();

  await expect.poll(() => deleteCalled).toBe(true);
});

test("does not show a Cancel button for a completed job", async ({ page }) => {
  await mockBaselineApi(page, {
    jobs: [makeJob({ status: "COMPLETED", output_file_key: "outputs/x.csv" })],
  });

  await page.goto("/");

  await expect(
    page.getByRole("button", { name: /^cancel$/i }),
  ).not.toBeVisible();
});
