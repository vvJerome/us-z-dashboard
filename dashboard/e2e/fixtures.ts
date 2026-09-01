import type { Page } from "@playwright/test";
import type { Job } from "../src/types/job";
import type { VpsInstance } from "../src/types/vps";
import type { ZeroBounceJob } from "../src/types/zerobounce";

export function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    status: "QUEUED",
    name: null,
    input_filename: "records.jsonl",
    config: { enable_proxy: false, skip_duplicates: true },
    worker_session: null,
    created_at: new Date().toISOString(),
    started_at: null,
    finished_at: null,
    error_message: null,
    output_file_key: null,
    vps_id: "vps-1",
    ...overrides,
  };
}

export function makeVps(overrides: Partial<VpsInstance> = {}): VpsInstance {
  return {
    id: "vps-1",
    name: "worker-v3",
    is_local: true,
    is_active: true,
    ssh_host: null,
    ssh_user: "devonly",
    ssh_port: 22,
    data_dir: "/home/devonly/data",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

export function makeZeroBounceJob(
  overrides: Partial<ZeroBounceJob> = {},
): ZeroBounceJob {
  return {
    id: "zb-1",
    status: "QUEUED",
    input_filename: "emails.csv",
    filter_mode: "all",
    email_col: "email",
    email_count: null,
    processed_count: null,
    output_file_key: null,
    error_message: null,
    created_at: new Date().toISOString(),
    started_at: null,
    finished_at: null,
    ...overrides,
  };
}

/** Wires up baseline API mocks (empty lists, one VPS), override per-test with page.route. */
export async function mockBaselineApi(
  page: Page,
  options: {
    jobs?: Job[];
    zeroBounceJobs?: ZeroBounceJob[];
    vps?: VpsInstance[];
  } = {},
) {
  const jobs = options.jobs ?? [];
  const zeroBounceJobs = options.zeroBounceJobs ?? [];
  const vps = options.vps ?? [makeVps()];

  // Anchored to the end of the path (with an optional query string) so these
  // don't also match Vite-served source files like /src/api/jobs.ts.
  await page.route(/\/api\/jobs(\?.*)?$/, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        json: { jobs, total: jobs.length },
      });
    } else {
      await route.continue();
    }
  });

  await page.route(/\/api\/vps(\?.*)?$/, async (route) => {
    await route.fulfill({ json: vps });
  });

  await page.route(/\/api\/zerobounce(\?.*)?$/, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: zeroBounceJobs });
    } else {
      await route.continue();
    }
  });
}
