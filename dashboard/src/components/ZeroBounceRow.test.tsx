import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { ZeroBounceJob } from "../types/zerobounce";
import { renderTableRow } from "../test-utils";
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
    renderTableRow(<ZeroBounceRow job={makeJob()} />);
    expect(screen.getByText("QUEUED")).toBeInTheDocument();
    expect(screen.getByText("emails.csv")).toBeInTheDocument();
  });

  it("shows progress while RUNNING", () => {
    renderTableRow(
      <ZeroBounceRow
        job={makeJob({
          status: "RUNNING",
          email_count: 100,
          processed_count: 40,
        })}
      />,
    );
    expect(screen.getByText(/40 \/ 100 \(40%\)/)).toBeInTheDocument();
  });

  it("shows a Download link only when COMPLETED with an output file", () => {
    renderTableRow(
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
    renderTableRow(<ZeroBounceRow job={makeJob({ status: "RUNNING" })} />);
    expect(
      screen.queryByRole("link", { name: /download/i }),
    ).not.toBeInTheDocument();
  });

  it("renders the error message for FAILED jobs", () => {
    renderTableRow(
      <ZeroBounceRow
        job={makeJob({ status: "FAILED", error_message: "Bad CSV" })}
      />,
    );
    expect(screen.getByText("Bad CSV")).toBeInTheDocument();
  });

  it("shows filter mode and email column once expanded", async () => {
    renderTableRow(
      <ZeroBounceRow
        job={makeJob({ filter_mode: "valid_only", email_col: "work_email" })}
      />,
    );
    await userEvent.click(screen.getByText("emails.csv"));
    expect(await screen.findByText("valid_only")).toBeInTheDocument();
    expect(screen.getByText("work_email")).toBeInTheDocument();
  });
});
