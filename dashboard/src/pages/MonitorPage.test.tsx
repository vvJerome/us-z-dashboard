import { render, screen } from "@testing-library/react";
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

function makeMetrics(overrides: Partial<MetricsResponse> = {}): MetricsResponse {
  return {
    run_id: "run_123",
    as_of: "2026-05-15T12:00:00",
    build_ms: 12,
    states: { VALIDATED: 5, DISCOVERED: 2 },
    totals: { all: 7, terminal: 5, pending: 2 },
    rate: { last_15min: 4, per_hour: 16, eta_hours: 0.5, complete: false },
    throughput_60min: [{ minute: "12:00", count: 4 }],
    backends: {
      racknerd: { error_pct: 10, total: 5, valid: 4, error: 1 },
      zuhal: { error_pct: 0, total: 2, valid: 2 },
    },
    discovery: { dns: 3, serper: 2, failed: 1, total_input: 6, hit_rate_pct: 83.3 },
    cost: { spent_usd: 1.2345, ceiling_usd: 10, pct: 12.3 },
    cost_breakdown: { services: [{ name: "serper", calls: 100, cost_usd: 0.1 }] },
    run_history: [
      {
        hour: "2026-05-15T12:00",
        valid: 4,
        catch_all: 1,
        invalid: 0,
        errored: 0,
        disc_failed: 0,
      },
    ],
    recent_validated: [
      {
        unique_id: "u1",
        candidate_email: "a@b.com",
        racknerd_status: "valid",
        zuhal_status: "valid",
        final_verdict: "valid",
        updated_at: "2026-05-15T11:59:00Z",
      },
    ],
    top_recent_errors: [],
    ...overrides,
  };
}

describe("MonitorPage", () => {
  it("shows a loading state before data arrives", () => {
    vi.mocked(useJobMetrics).mockReturnValue({
      data: undefined,
      isError: false,
      error: null,
    } as ReturnType<typeof useJobMetrics>);

    renderAt("job-1");
    expect(screen.getByText(/loading pipeline data/i)).toBeInTheDocument();
  });

  it("shows a not-running message when the job isn't running", () => {
    vi.mocked(useJobMetrics).mockReturnValue({
      data: undefined,
      isError: true,
      error: new Error("Job is not RUNNING"),
    } as ReturnType<typeof useJobMetrics>);

    renderAt("job-1");
    expect(
      screen.getByText(/job is not currently running/i),
    ).toBeInTheDocument();
  });

  it("renders all panels once metrics data arrives", () => {
    vi.mocked(useJobMetrics).mockReturnValue({
      data: makeMetrics(),
      isError: false,
      error: null,
    } as ReturnType<typeof useJobMetrics>);

    renderAt("job-1");
    expect(screen.getByText("run_123")).toBeInTheDocument();
    expect(screen.getByText("State machine")).toBeInTheDocument();
    expect(screen.getByText(/Throughput \(last 60 min\)/)).toBeInTheDocument();
    expect(screen.getByText("Cost")).toBeInTheDocument();
    expect(screen.getByText("Backend verdicts (cumulative)")).toBeInTheDocument();
    expect(screen.getByText("Discovery (cumulative)")).toBeInTheDocument();
    expect(screen.getByText("Recent validations")).toBeInTheDocument();
    expect(screen.getByText("Top errors")).toBeInTheDocument();
  });

  it("navigates back to the job list when the back button is clicked", () => {
    vi.mocked(useJobMetrics).mockReturnValue({
      data: makeMetrics(),
      isError: false,
      error: null,
    } as ReturnType<typeof useJobMetrics>);

    renderAt("job-1");
    expect(screen.getByRole("button", { name: /jobs/i })).toBeInTheDocument();
  });
});
