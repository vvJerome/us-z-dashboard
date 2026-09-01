import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Job } from "../types/job";
import { renderTableRow } from "../test-utils";
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
    name: null,
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
    renderTableRow(<JobRow job={makeJob()} />);
    expect(screen.getByText("RUNNING")).toBeInTheDocument();
    expect(screen.getByText("records.jsonl")).toBeInTheDocument();
  });

  it("shows Cancel button for RUNNING jobs", () => {
    renderTableRow(<JobRow job={makeJob({ status: "RUNNING" })} />);
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("shows Cancel button for QUEUED jobs", () => {
    renderTableRow(<JobRow job={makeJob({ status: "QUEUED" })} />);
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("does not show Cancel button for COMPLETED jobs", () => {
    renderTableRow(
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
    renderTableRow(
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
    renderTableRow(<JobRow job={makeJob({ status: "RUNNING" })} />);
    expect(
      screen.queryByRole("button", { name: /download/i }),
    ).not.toBeInTheDocument();
  });

  it("expands log viewer when the chevron is clicked", async () => {
    renderTableRow(<JobRow job={makeJob()} />);
    await userEvent.click(
      screen.getByRole("button", { name: /expand job details/i }),
    );
    expect(await screen.findByText(/no logs yet/i)).toBeInTheDocument();
  });

  it("does not expand when clicking elsewhere in the row, only the chevron toggles it", async () => {
    renderTableRow(<JobRow job={makeJob()} />);
    await userEvent.click(screen.getByText("records.jsonl"));
    expect(screen.queryByText(/no logs yet/i)).not.toBeInTheDocument();
  });

  it("cancels the job when Cancel is clicked, without expanding the row", async () => {
    const { cancelJob } = await import("../api/jobs");
    renderTableRow(<JobRow job={makeJob({ status: "QUEUED" })} />);

    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(cancelJob).toHaveBeenCalledWith("test-job-id");
    expect(screen.queryByText(/no logs yet/i)).not.toBeInTheDocument();
  });

  it("navigates to the monitor page when Live is clicked, without expanding the row", async () => {
    renderTableRow(<JobRow job={makeJob({ status: "RUNNING" })} />);

    await userEvent.click(screen.getByRole("button", { name: /^live$/i }));

    expect(screen.queryByText(/no logs yet/i)).not.toBeInTheDocument();
  });

  it("shows Metrics (not Live) for a COMPLETED job", () => {
    renderTableRow(
      <JobRow
        job={makeJob({
          status: "COMPLETED",
          output_file_key: "outputs/x/result.csv",
        })}
      />,
    );
    expect(
      screen.getByRole("button", { name: /^metrics$/i }),
    ).toBeInTheDocument();
  });

  it("still shows a Metrics button for FAILED jobs, not just RUNNING/COMPLETED", () => {
    renderTableRow(<JobRow job={makeJob({ status: "FAILED" })} />);
    expect(
      screen.getByRole("button", { name: /^metrics$/i }),
    ).toBeInTheDocument();
  });

  it("shows a friendly error summary for FAILED jobs without expanding", () => {
    renderTableRow(
      <JobRow
        job={makeJob({
          status: "FAILED",
          error_message: "SMTP connection refused",
        })}
      />,
    );
    expect(screen.getByText(/this job failed to run/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/smtp connection refused/i),
    ).not.toBeInTheDocument();
  });

  it("shows the raw technical error once the row is expanded", async () => {
    renderTableRow(
      <JobRow
        job={makeJob({
          status: "FAILED",
          error_message: "SMTP connection refused",
        })}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /expand job details/i }),
    );
    expect(
      await screen.findByText(/smtp connection refused/i),
    ).toBeInTheDocument();
  });

  it("maps a known dispatch failure to a specific friendly summary", () => {
    renderTableRow(
      <JobRow
        job={makeJob({
          status: "FAILED",
          error_message:
            "Dispatch failed: VPS 'local-test' has no ssh_host configured",
        })}
      />,
    );
    expect(
      screen.getByText(/isn't set up for remote jobs yet/i),
    ).toBeInTheDocument();
  });

  it("uses the input filename as the title when no name was given", () => {
    renderTableRow(<JobRow job={makeJob({ input_filename: "leads.csv" })} />);
    expect(screen.getByText("leads.csv")).toBeInTheDocument();
  });

  it("uses the job name as the title and shows the filename secondarily when a name was given", () => {
    renderTableRow(
      <JobRow
        job={makeJob({
          name: "Q3 outreach list",
          input_filename: "leads.csv",
        })}
      />,
    );
    expect(screen.getByText("Q3 outreach list")).toBeInTheDocument();
    expect(screen.getByText("leads.csv")).toBeInTheDocument();
  });

  it("shows job config and worker session details once expanded", async () => {
    renderTableRow(
      <JobRow
        job={makeJob({
          worker_session: "session-xyz",
          config: { enable_proxy: true, skip_duplicates: false },
        })}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /expand job details/i }),
    );
    expect(await screen.findByText("Enabled")).toBeInTheDocument();
    expect(screen.getByText("Off")).toBeInTheDocument();
    expect(screen.getByText("session-xyz")).toBeInTheDocument();
  });
});
