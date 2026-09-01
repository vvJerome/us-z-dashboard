import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({ request: vi.fn().mockResolvedValue({}) }));

import { request } from "./client";
import {
  cancelJob,
  createJob,
  fetchJobDownload,
  fetchJobLogs,
  fetchJobs,
} from "./jobs";

describe("jobs api", () => {
  afterEach(() => {
    vi.mocked(request).mockClear();
  });

  it("fetchJobs calls the base endpoint", async () => {
    await fetchJobs();
    expect(request).toHaveBeenCalledWith("/api/jobs");
  });

  it("fetchJobLogs calls the logs sub-path", async () => {
    await fetchJobLogs("job-1");
    expect(request).toHaveBeenCalledWith("/api/jobs/job-1/logs");
  });

  it("fetchJobDownload calls the download sub-path", async () => {
    await fetchJobDownload("job-1");
    expect(request).toHaveBeenCalledWith("/api/jobs/job-1/download");
  });

  it("cancelJob issues a DELETE to the job's path", async () => {
    await cancelJob("job-1");
    expect(request).toHaveBeenCalledWith("/api/jobs/job-1", {
      method: "DELETE",
    });
  });

  it("createJob builds query params from config and posts the file", async () => {
    const file = new File(["data"], "records.jsonl");
    await createJob(file, { enable_proxy: true, skip_duplicates: false }, null);

    const [url, init] = vi.mocked(request).mock.calls[0];
    expect(url).toBe("/api/jobs?enable_proxy=true&skip_duplicates=false");
    expect(init?.method).toBe("POST");
    expect((init?.body as FormData).get("file")).toBe(file);
  });

  it("createJob includes vps_id in the query string when provided", async () => {
    const file = new File(["data"], "records.jsonl");
    await createJob(
      file,
      { enable_proxy: false, skip_duplicates: true },
      "vps-1",
    );

    const [url] = vi.mocked(request).mock.calls[0];
    expect(url).toContain("vps_id=vps-1");
  });

  it("createJob omits vps_id from the query string when null", async () => {
    const file = new File(["data"], "records.jsonl");
    await createJob(file, { enable_proxy: false, skip_duplicates: true }, null);

    const [url] = vi.mocked(request).mock.calls[0];
    expect(url).not.toContain("vps_id");
  });

  it("createJob includes name in the query string when provided", async () => {
    const file = new File(["data"], "records.jsonl");
    await createJob(
      file,
      { enable_proxy: false, skip_duplicates: true },
      null,
      "Q3 outreach list",
    );

    const [url] = vi.mocked(request).mock.calls[0];
    expect(url).toContain("name=Q3");
  });

  it("createJob omits name from the query string when not provided", async () => {
    const file = new File(["data"], "records.jsonl");
    await createJob(file, { enable_proxy: false, skip_duplicates: true }, null);

    const [url] = vi.mocked(request).mock.calls[0];
    expect(url).not.toContain("name=");
  });
});
