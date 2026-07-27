import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ZeroBounceJob } from "../types/zerobounce";
import { ZeroBounceRow } from "./ZeroBounceRow";

function makeJob(overrides: Partial<ZeroBounceJob> = {}): ZeroBounceJob {
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
    created_at: "2026-05-15T00:00:00Z",
    started_at: null,
    finished_at: null,
    ...overrides,
  };
}

describe("ZeroBounceRow", () => {
  it("renders status and filename", () => {
    render(<ZeroBounceRow job={makeJob()} />);
    expect(screen.getByText("QUEUED")).toBeInTheDocument();
    expect(screen.getByText("emails.csv")).toBeInTheDocument();
  });

  it("shows progress while RUNNING", () => {
    render(
      <ZeroBounceRow
        job={makeJob({ status: "RUNNING", email_count: 100, processed_count: 40 })}
      />,
    );
    expect(screen.getByText(/40 \/ 100 \(40%\)/)).toBeInTheDocument();
  });

  it("shows a Download link only when COMPLETED with an output file", () => {
    render(
      <ZeroBounceRow
        job={makeJob({
          status: "COMPLETED",
          output_file_key: "zerobounce/zb-1/output.csv",
        })}
      />,
    );
    expect(screen.getByRole("link", { name: /download/i })).toHaveAttribute(
      "href",
      "/api/zerobounce/zb-1/download",
    );
  });

  it("does not show a Download link while RUNNING", () => {
    render(<ZeroBounceRow job={makeJob({ status: "RUNNING" })} />);
    expect(
      screen.queryByRole("link", { name: /download/i }),
    ).not.toBeInTheDocument();
  });

  it("renders the error message for FAILED jobs", () => {
    render(
      <ZeroBounceRow
        job={makeJob({ status: "FAILED", error_message: "Bad CSV" })}
      />,
    );
    expect(screen.getByText("Bad CSV")).toBeInTheDocument();
  });
});
