import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Job, JobListResponse } from "../types/job";
import { renderWithQuery } from "../test-utils";
import { JobList } from "./JobList";

vi.mock("../api/jobs", () => ({
  fetchJobs: vi.fn(),
  cancelJob: vi.fn(),
}));

import { fetchJobs } from "../api/jobs";

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: crypto.randomUUID(),
    status: "QUEUED",
    input_filename: "records.jsonl",
    config: { enable_proxy: false, skip_duplicates: true },
    kestra_execution_id: null,
    created_at: new Date().toISOString(),
    started_at: null,
    finished_at: null,
    error_message: null,
    output_file_key: null,
    ...overrides,
  };
}

function mockJobs(jobs: Job[]) {
  vi.mocked(fetchJobs).mockResolvedValue({
    jobs,
    total: jobs.length,
  } satisfies JobListResponse);
}

describe("JobList", () => {
  it("shows empty state when no jobs exist", async () => {
    mockJobs([]);
    renderWithQuery(<JobList />);
    expect(await screen.findByText(/no jobs yet/i)).toBeInTheDocument();
  });

  it("enables the Run scraper button when fewer than 5 jobs are RUNNING", async () => {
    mockJobs([makeJob({ status: "RUNNING" }), makeJob({ status: "RUNNING" })]);
    renderWithQuery(<JobList />);
    const button = await screen.findByRole("button", { name: /run scraper/i });
    expect(button).not.toBeDisabled();
  });

  it("disables the Run scraper button when 5 jobs are RUNNING", async () => {
    mockJobs(Array.from({ length: 5 }, () => makeJob({ status: "RUNNING" })));
    renderWithQuery(<JobList />);
    // Wait for data to load (5/5 message appears) before checking button state
    await screen.findByText(/5\/5 slots in use/i);
    const button = screen.getByRole("button", { name: /run scraper/i });
    expect(button).toBeDisabled();
  });

  it("shows 5/5 slots in use message when all slots taken", async () => {
    mockJobs(Array.from({ length: 5 }, () => makeJob({ status: "RUNNING" })));
    renderWithQuery(<JobList />);
    expect(await screen.findByText(/5\/5 slots in use/i)).toBeInTheDocument();
  });

  it("does not show slots message when fewer than 5 running", async () => {
    mockJobs([makeJob({ status: "RUNNING" })]);
    renderWithQuery(<JobList />);
    await screen.findByRole("button", { name: /run scraper/i });
    expect(screen.queryByText(/slots in use/i)).not.toBeInTheDocument();
  });

  it("renders a row for each job returned", async () => {
    mockJobs([
      makeJob({ input_filename: "file-a.jsonl" }),
      makeJob({ input_filename: "file-b.csv" }),
    ]);
    renderWithQuery(<JobList />);
    expect(await screen.findByText("file-a.jsonl")).toBeInTheDocument();
    expect(await screen.findByText("file-b.csv")).toBeInTheDocument();
  });
});
