import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { MetricsResponse } from "../types/metrics";
import { MonitorPage } from "./MonitorPage";

vi.mock("chart.js", () => {
  class FakeChart {
    static register() {}
    update() {}
    destroy() {}
  }
  return {
    Chart: FakeChart,
    BarController: class {},
    BarElement: class {},
    CategoryScale: class {},
    Filler: class {},
    LinearScale: class {},
    LineController: class {},
    LineElement: class {},
    PointElement: class {},
    Tooltip: class {},
  };
});

vi.mock("../hooks/useJobMetrics", () => ({
  useJobMetrics: vi.fn(),
}));
vi.mock("../hooks/useJobs", () => ({
  useJob: vi.fn().mockReturnValue({ data: undefined, refetch: vi.fn() }),
}));

import { useJob } from "../hooks/useJobs";
import { useJobMetrics } from "../hooks/useJobMetrics";

function renderAt(jobId: string) {
  return render(
    <MemoryRouter initialEntries={[`/jobs/${jobId}/monitor`]}>
      <Routes>
        <Route path="/jobs/:jobId/monitor" element={<MonitorPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function makeMetrics(
  overrides: Partial<MetricsResponse> = {},
): MetricsResponse {
  return {
    run_id: "run_123",
    as_of: "2026-05-15T12:00:00",
    build_ms: 12,
    states: { VALIDATED: 5, DISCOVERED: 2 },
    totals: { all: 7, terminal: 5, pending: 2 },
    rate: { last_15min: 4, per_hour: 16, eta_hours: 0.5, complete: false },
    throughput_60min: [{ minute: "12:00", count: 4 }],
    backends: {
      smtp: { error_pct: 10, total: 5, valid: 4, error: 1 },
    },
    heartbeats: { producer: "2026-05-15T11:59:00Z", dispatcher: null },
    discovery: {
      first_party: 3,
      third_party: 2,
      failed: 1,
      total_input: 6,
      hit_rate_pct: 83.3,
    },
    cost: { spent_usd: 1.2345, ceiling_usd: 10, pct: 12.3 },
    cost_breakdown: {
      services: [{ name: "serper", calls: 100, cost_usd: 0.1 }],
    },
    run_history: [
      {
        hour: "2026-05-15T12:00",
        valid: 4,
        catch_all: 1,
        invalid: 0,
        errored: 0,
        discovery: 0,
      },
    ],
    recent_validated: [
      {
        unique_id: "u1",
        candidate_email: "a@b.com",
        racknerd_status: "valid",
        canonical_status: "valid",
        canonical_source: "zerobounce",
        updated_at: "2026-05-15T11:59:00Z",
      },
    ],
    top_recent_errors: [],
    run_events: [],
    ...overrides,
  };
}

describe("MonitorPage", () => {
  it("shows a skeleton loading state before data arrives", () => {
    vi.mocked(useJobMetrics).mockReturnValue({
      data: undefined,
      isError: false,
      error: null,
    } as ReturnType<typeof useJobMetrics>);

    const { container } = renderAt("job-1");
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(
      0,
    );
    expect(
      screen.queryByText(/loading pipeline data/i),
    ).not.toBeInTheDocument();
  });

  it("shows an empty stats breakdown preview when the job isn't running", () => {
    vi.mocked(useJobMetrics).mockReturnValue({
      data: undefined,
      isError: true,
      error: new Error("Job is not RUNNING"),
    } as ReturnType<typeof useJobMetrics>);

    const { container } = renderAt("job-1");
    expect(screen.getByText(/isn't running right now/i)).toBeInTheDocument();
    expect(screen.getByText("State machine")).toBeInTheDocument();
    expect(screen.getByText("Cost")).toBeInTheDocument();
    expect(screen.getByText("Recent validations")).toBeInTheDocument();
    expect(screen.getByText("Top errors")).toBeInTheDocument();
    // A job that will never start polling successfully must not be stuck
    // showing a perpetually-pulsing "connecting" indicator - it settles
    // into a static "not running" state instead.
    expect(screen.getByText(/not running/i)).toBeInTheDocument();
    expect(container.querySelector(".animate-pulse")).not.toBeInTheDocument();
  });

  it("shows a generic retrying message for other errors", () => {
    vi.mocked(useJobMetrics).mockReturnValue({
      data: undefined,
      isError: true,
      error: new Error("Pipeline DB unavailable: connection refused"),
    } as ReturnType<typeof useJobMetrics>);

    renderAt("job-1");
    expect(
      screen.getByText(/pipeline db not available yet/i),
    ).toBeInTheDocument();
  });

  it("marks the connection stale after 8s with no fresh data", () => {
    vi.useFakeTimers();
    vi.mocked(useJobMetrics).mockReturnValue({
      data: makeMetrics(),
      isError: false,
      error: null,
    } as ReturnType<typeof useJobMetrics>);

    renderAt("job-1");
    expect(screen.getByText(/live$/)).toBeInTheDocument();

    // Staleness is checked on a 1s interval, so the next tick after crossing
    // STALE_MS (8000ms) is what actually flips it, not 8001ms itself.
    act(() => {
      vi.advanceTimersByTime(9000);
    });
    expect(screen.getByText(/stale$/)).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("renders the crash fallback when a panel throws", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    vi.mocked(useJobMetrics).mockImplementation(() => {
      throw new Error("boom");
    });

    renderAt("job-1");

    expect(screen.getByText(/monitor page crashed/i)).toBeInTheDocument();
    expect(screen.getByText(/^boom/)).toBeInTheDocument();
    consoleError.mockRestore();
  });

  it("renders all panels once metrics data arrives", () => {
    vi.mocked(useJobMetrics).mockReturnValue({
      data: makeMetrics(),
      isError: false,
      error: null,
    } as ReturnType<typeof useJobMetrics>);

    renderAt("job-1");
    expect(screen.getByText("State machine")).toBeInTheDocument();
    expect(
      screen.getByText(/Throughput \(last 60 minutes\)/),
    ).toBeInTheDocument();
    expect(screen.getByText("Cost")).toBeInTheDocument();
    expect(screen.getByText("SMTP validation results")).toBeInTheDocument();
    expect(screen.getByText("Pipeline health")).toBeInTheDocument();
    expect(screen.getByText("Discovery (cumulative)")).toBeInTheDocument();
    expect(screen.getByText(/Run timeline \(hourly\)/)).toBeInTheDocument();
    expect(screen.getByText("Recent validations")).toBeInTheDocument();
    expect(screen.getByText("Run events")).toBeInTheDocument();
    expect(screen.getByText("Top errors")).toBeInTheDocument();
  });

  it("shows the job's name instead of its raw id once it loads", () => {
    vi.mocked(useJobMetrics).mockReturnValue({
      data: makeMetrics(),
      isError: false,
      error: null,
    } as ReturnType<typeof useJobMetrics>);
    vi.mocked(useJob).mockReturnValue({
      data: {
        id: "job-1",
        status: "RUNNING",
        name: "Q3 outreach list",
        input_filename: "leads.csv",
        config: { enable_proxy: false, skip_duplicates: true },
        worker_session: null,
        created_at: "2026-05-15T00:00:00Z",
        started_at: "2026-05-15T00:00:00Z",
        finished_at: null,
        error_message: null,
        output_file_key: null,
        vps_id: null,
      },
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useJob>);

    renderAt("job-1");
    expect(screen.getByText("Q3 outreach list")).toBeInTheDocument();
    expect(screen.queryByText("run_123")).not.toBeInTheDocument();
  });

  it("does not show a Jobs back button", () => {
    vi.mocked(useJobMetrics).mockReturnValue({
      data: makeMetrics(),
      isError: false,
      error: null,
    } as ReturnType<typeof useJobMetrics>);

    renderAt("job-1");
    expect(
      screen.queryByRole("button", { name: /jobs/i }),
    ).not.toBeInTheDocument();
  });

  it("pulls fresh data on demand when Refresh is clicked", async () => {
    const refetch = vi.fn();
    vi.mocked(useJobMetrics).mockReturnValue({
      data: makeMetrics(),
      isError: false,
      error: null,
      refetch,
      isFetching: false,
    } as unknown as ReturnType<typeof useJobMetrics>);

    renderAt("job-1");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /refresh/i }));

    expect(refetch).toHaveBeenCalledOnce();
  });
});
