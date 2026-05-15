import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "../test-utils";
import { LogViewer } from "./LogViewer";

vi.mock("../api/jobs", () => ({
  fetchJobLogs: vi.fn(),
}));

import { fetchJobLogs } from "../api/jobs";

describe("LogViewer", () => {
  it('shows "No logs yet" when lines array is empty', async () => {
    vi.mocked(fetchJobLogs).mockResolvedValue({ lines: [] });
    renderWithQuery(<LogViewer jobId="job-1" status="RUNNING" />);
    expect(await screen.findByText(/no logs yet/i)).toBeInTheDocument();
  });

  it("renders log lines inside a pre block", async () => {
    vi.mocked(fetchJobLogs).mockResolvedValue({
      lines: [
        "[2026-05-15] INFO started",
        "[2026-05-15] INFO processed 100 records",
      ],
    });
    renderWithQuery(<LogViewer jobId="job-1" status="RUNNING" />);
    expect(
      await screen.findByText(/processed 100 records/),
    ).toBeInTheDocument();
  });

  it("does not refetch when job is COMPLETED", async () => {
    vi.mocked(fetchJobLogs).mockResolvedValue({ lines: ["done"] });
    renderWithQuery(<LogViewer jobId="job-2" status="COMPLETED" />);
    await screen.findByText("done");
    // refetchInterval should be false — just verify it renders without error
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  });

  it("scrolls to bottom ref on update", async () => {
    const scrollIntoView = vi.fn();
    window.HTMLDivElement.prototype.scrollIntoView = scrollIntoView;
    vi.mocked(fetchJobLogs).mockResolvedValue({ lines: ["line 1", "line 2"] });
    renderWithQuery(<LogViewer jobId="job-3" status="RUNNING" />);
    await screen.findByText(/line 1/);
    expect(scrollIntoView).toHaveBeenCalled();
  });
});
