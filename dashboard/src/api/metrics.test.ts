import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({ request: vi.fn().mockResolvedValue({}) }));

import { request } from "./client";
import { fetchJobMetrics, fetchVpsDbMetrics } from "./metrics";

describe("metrics api", () => {
  afterEach(() => {
    vi.mocked(request).mockClear();
  });

  it("fetchJobMetrics calls the job's metrics endpoint with no-store", async () => {
    await fetchJobMetrics("job-1");
    expect(request).toHaveBeenCalledWith("/api/jobs/job-1/metrics", {
      cache: "no-store",
    });
  });

  it("fetchVpsDbMetrics builds the query string with an encoded db_path", async () => {
    await fetchVpsDbMetrics("vps-1", "/home/devonly/pipeline runs/wi.db");
    expect(request).toHaveBeenCalledWith(
      "/api/vps/vps-1/db-metrics?db_path=%2Fhome%2Fdevonly%2Fpipeline%20runs%2Fwi.db",
      { cache: "no-store" },
    );
  });
});
