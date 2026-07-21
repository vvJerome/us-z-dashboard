import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Job } from "../types/job";
import { renderWithQuery } from "../test-utils";
import { JobRow } from "./JobRow";

vi.mock("../api/jobs", () => ({
  fetchJobLogs: vi.fn().mockResolvedValue({ lines: [] }),
  cancelJob: vi.fn().mockResolvedValue(undefined),
  fetchJobs: vi.fn().mockResolvedValue({ jobs: [], total: 0 }),
  fetchJobDownload: vi.fn(),
}));

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "test-job-id",
    status: "RUNNING",
    input_filename: "records.jsonl",
    config: { enable_proxy: false, skip_duplicates: true },
    worker_session: "job-abc",
    created_at: "2026-05-15T00:00:00Z",
    started_at: "2026-05-15T00:01:00Z",
    finished_at: null,
    error_message: null,
    output_file_key: null,
    vps_id: null,
    ...overrides,
  };
}

describe("JobRow", () => {
  it("renders status badge and filename", () => {
    renderWithQuery(<JobRow job={makeJob()} />);
    expect(screen.getByText("RUNNING")).toBeInTheDocument();
    expect(screen.getByText("records.jsonl")).toBeInTheDocument();
  });

  it("shows Cancel button for RUNNING jobs", () => {
    renderWithQuery(<JobRow job={makeJob({ status: "RUNNING" })} />);
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("shows Cancel button for QUEUED jobs", () => {
    renderWithQuery(<JobRow job={makeJob({ status: "QUEUED" })} />);
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("does not show Cancel button for COMPLETED jobs", () => {
    renderWithQuery(
      <JobRow
        job={makeJob({
          status: "COMPLETED",
          output_file_key: "outputs/x/result.csv",
        })}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /cancel/i }),
    ).not.toBeInTheDocument();
  });

  it("shows Download button only for COMPLETED jobs", () => {
    renderWithQuery(
      <JobRow
        job={makeJob({
          status: "COMPLETED",
          output_file_key: "outputs/x/result.csv",
        })}
      />,
    );
    expect(
      screen.getByRole("button", { name: /download/i }),
    ).toBeInTheDocument();
  });

  it("does not show Download button for RUNNING jobs", () => {
    renderWithQuery(<JobRow job={makeJob({ status: "RUNNING" })} />);
    expect(
      screen.queryByRole("button", { name: /download/i }),
    ).not.toBeInTheDocument();
  });

  it("expands log viewer on row click", async () => {
    renderWithQuery(<JobRow job={makeJob()} />);
    await userEvent.click(screen.getByText("records.jsonl"));
    expect(await screen.findByText(/no logs yet/i)).toBeInTheDocument();
  });

  it("renders error message for FAILED jobs", () => {
    renderWithQuery(
      <JobRow
        job={makeJob({
          status: "FAILED",
          error_message: "SMTP connection refused",
        })}
      />,
    );
    expect(screen.getByText(/smtp connection refused/i)).toBeInTheDocument();
  });
});
