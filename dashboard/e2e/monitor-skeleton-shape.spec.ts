import { expect, test } from "@playwright/test";

// Realistic-sized payload so every panel's content is at (or past) its
// natural size - a sparse payload would under-report real card heights and
// make this check pass for the wrong reason.
function makeMetrics() {
  const throughput_60min = Array.from({ length: 60 }, (_, i) => ({
    minute: `12:${String(i).padStart(2, "0")}`,
    count: Math.floor(Math.random() * 20),
  }));
  const run_history = Array.from({ length: 24 }, (_, i) => ({
    hour: `2026-08-27T${String(i).padStart(2, "0")}:00`,
    valid: 20,
    catch_all: 5,
    invalid: 10,
    errored: 2,
    discovery: 15,
  }));
  const recent_validated = Array.from({ length: 15 }, (_, i) => ({
    unique_id: `u${i}`,
    candidate_email: `person${i}@example.com`,
    racknerd_status: "valid",
    canonical_status: "catch_all",
    canonical_source: "zerobounce",
    updated_at: new Date().toISOString(),
  }));
  const top_recent_errors = Array.from({ length: 8 }, (_, i) => ({
    source: "dns",
    message: `err ${i}`,
    n: 10 - i,
  }));
  const run_events = Array.from({ length: 10 }, (_, i) => ({
    ts: new Date().toISOString(),
    event: "producer_finished",
    detail: `processed=${i}`,
  }));
  return {
    run_id: "run_wi_full",
    as_of: new Date().toISOString(),
    build_ms: 42,
    states: {
      VALIDATED: 1449,
      VALIDATING: 1,
      DISCOVERED: 28017,
      VALIDATION_FAILED: 25205,
      DISCOVERY_FAILED: 11448,
      COST_SKIPPED: 0,
    },
    totals: { all: 66120, terminal: 38102, pending: 28018 },
    rate: { last_15min: 40, per_hour: 160, eta_hours: 12.5, complete: false },
    throughput_60min,
    backends: {
      smtp: {
        error_pct: 12.4,
        total: 5000,
        valid: 3000,
        catch_all: 800,
        invalid: 1000,
        error: 200,
      },
    },
    heartbeats: {
      producer: new Date().toISOString(),
      dispatcher: new Date().toISOString(),
    },
    discovery: {
      first_party: 20000,
      third_party: 8000,
      failed: 40,
      total_input: 28017,
      hit_rate_pct: 99.8,
    },
    cost: { spent_usd: 123.456, ceiling_usd: 500, pct: 24.6 },
    cost_breakdown: {
      services: [
        { name: "serper", calls: 8000, cost_usd: 40 },
        { name: "dns", calls: 20000, cost_usd: 5 },
      ],
    },
    run_history,
    recent_validated,
    top_recent_errors,
    run_events,
  };
}

const JOB = {
  id: "job-x",
  status: "RUNNING",
  name: "Q3 outreach list",
  input_filename: "leads.csv",
  config: { enable_proxy: false, skip_duplicates: true },
  worker_session: "s1",
  created_at: new Date().toISOString(),
  started_at: new Date().toISOString(),
  finished_at: null,
  error_message: null,
  output_file_key: null,
  vps_id: "vps-1",
};

async function cardHeights(page: import("@playwright/test").Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("main > .grid > div")].map((c) =>
      Math.round(c.getBoundingClientRect().height),
    ),
  );
}

test("Monitor page skeleton matches the loaded panel grid's shape", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("**/api/jobs/job-x", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(JOB),
    }),
  );

  // Hold the very first metrics request open (don't fulfill it yet) so we
  // can measure the skeleton, then complete that *same* in-flight request
  // later - this is a real poll resolving mid-flight, not a fresh load.
  let releaseFirstRequest!: () => void;
  const firstRequestHeld = new Promise<void>((resolve) => {
    releaseFirstRequest = resolve;
  });
  await page.route("**/api/jobs/job-x/metrics", async (route) => {
    await firstRequestHeld;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(makeMetrics()),
    });
  });
  await page.goto("/jobs/job-x/monitor");
  await page.waitForTimeout(500);
  const skeletonHeights = await cardHeights(page);
  expect(skeletonHeights.length).toBe(10);

  // Complete the held request - the same poll now resolves, and the exact
  // same 10 boxes transition from skeleton to real content in place.
  releaseFirstRequest();
  await page.waitForSelector("text=State machine");
  await page.waitForTimeout(500);
  const loadedHeights = await cardHeights(page);
  expect(loadedHeights.length).toBe(10);

  for (let i = 0; i < 10; i++) {
    const diff = Math.abs(loadedHeights[i] - skeletonHeights[i]);
    expect(
      diff,
      `card ${i}: skeleton=${skeletonHeights[i]}px loaded=${loadedHeights[i]}px`,
    ).toBeLessThanOrEqual(6);
  }
});
