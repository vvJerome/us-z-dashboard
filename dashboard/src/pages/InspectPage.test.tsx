import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { MetricsResponse } from "../types/metrics";
import { InspectPage } from "./InspectPage";

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

vi.mock("../hooks/useVps", () => ({
  useVps: vi.fn(),
}));
vi.mock("../hooks/useVpsDbMetrics", () => ({
  useVpsDbMetrics: vi.fn(),
}));
vi.mock("../hooks/useInspections", () => ({
  useInspections: vi.fn(),
  useSavedInspection: vi.fn(),
  useCreateInspection: vi.fn(),
}));

import { useVps } from "../hooks/useVps";
import { useVpsDbMetrics } from "../hooks/useVpsDbMetrics";
import {
  useCreateInspection,
  useInspections,
  useSavedInspection,
} from "../hooks/useInspections";

function mockInspectionHooks() {
  vi.mocked(useInspections).mockReturnValue({
    data: [],
  } as unknown as ReturnType<typeof useInspections>);
  vi.mocked(useSavedInspection).mockReturnValue({
    data: undefined,
  } as unknown as ReturnType<typeof useSavedInspection>);
  vi.mocked(useCreateInspection).mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof useCreateInspection>);
}

function makeMetrics(
  overrides: Partial<MetricsResponse> = {},
): MetricsResponse {
  return {
    run_id: "run_wi_full",
    as_of: "2026-08-19T00:00:00",
    build_ms: 5,
    states: { VALIDATED: 5 },
    totals: { all: 5, terminal: 5, pending: 0 },
    rate: { last_15min: 0, per_hour: 0, eta_hours: null, complete: true },
    throughput_60min: [],
    backends: {
      racknerd: { error_pct: 0, total: 5 },
      zuhal: { error_pct: 0, total: 5 },
    },
    discovery: {
      dns: 0,
      serper: 0,
      failed: 0,
      total_input: 5,
      hit_rate_pct: 100,
    },
    cost: { spent_usd: 0.5, ceiling_usd: null, pct: null },
    cost_breakdown: { services: [] },
    run_history: [],
    recent_validated: [],
    top_recent_errors: [],
    ...overrides,
  };
}

function renderPage(initialPath = "/inspect") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/inspect" element={<InspectPage />} />
        <Route path="/inspect/:inspectionId" element={<InspectPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("InspectPage", () => {
  it("renders a VPS select and a path input", () => {
    mockInspectionHooks();
    vi.mocked(useVps).mockReturnValue({
      data: [{ id: "vps-1", name: "state-dashboard-v2" }],
    } as ReturnType<typeof useVps>);
    vi.mocked(useVpsDbMetrics).mockReturnValue({
      data: undefined,
      isFetching: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useVpsDbMetrics>);

    renderPage();
    expect(screen.getByLabelText(/VPS/i)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/absolute path to pipeline\.db/i),
    ).toBeInTheDocument();
  });

  it("renders panels once metrics data arrives after Load is clicked", async () => {
    mockInspectionHooks();
    vi.mocked(useVps).mockReturnValue({
      data: [{ id: "vps-1", name: "state-dashboard-v2" }],
    } as ReturnType<typeof useVps>);
    vi.mocked(useVpsDbMetrics).mockReturnValue({
      data: makeMetrics(),
      isFetching: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useVpsDbMetrics>);

    renderPage();
    fireEvent.change(screen.getByLabelText(/VPS/i), {
      target: { value: "vps-1" },
    });
    fireEvent.change(screen.getByLabelText(/absolute path to pipeline\.db/i), {
      target: {
        value: "/home/devonly/pipeline_runs/wi/output/wi_full/pipeline.db",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /load/i }));

    await waitFor(() => {
      expect(screen.getByText("State machine")).toBeInTheDocument();
    });
    expect(screen.getByText("Cost")).toBeInTheDocument();
  });

  it("shows an error message when the fetch fails", async () => {
    mockInspectionHooks();
    vi.mocked(useVps).mockReturnValue({
      data: [{ id: "vps-1", name: "state-dashboard-v2" }],
    } as ReturnType<typeof useVps>);
    vi.mocked(useVpsDbMetrics).mockReturnValue({
      data: undefined,
      isFetching: false,
      isError: true,
      error: new Error("Pipeline DB unavailable: sqlite3 CLI not found"),
    } as ReturnType<typeof useVpsDbMetrics>);

    renderPage();
    fireEvent.change(screen.getByLabelText(/VPS/i), {
      target: { value: "vps-1" },
    });
    fireEvent.change(screen.getByLabelText(/absolute path to pipeline\.db/i), {
      target: { value: "/home/devonly/pipeline.db" },
    });
    fireEvent.click(screen.getByRole("button", { name: /load/i }));

    await waitFor(() => {
      expect(screen.getByText(/sqlite3 CLI not found/i)).toBeInTheDocument();
    });
  });

  it("auto-loads metrics and shows the saved name when navigated to a saved inspection", async () => {
    vi.mocked(useVps).mockReturnValue({
      data: [{ id: "vps-1", name: "state-dashboard-v2" }],
    } as ReturnType<typeof useVps>);
    vi.mocked(useInspections).mockReturnValue({
      data: [
        { id: "insp-1", name: "Wisconsin run", vps_id: "vps-1", db_path: "/x" },
      ],
    } as unknown as ReturnType<typeof useInspections>);
    vi.mocked(useSavedInspection).mockReturnValue({
      data: {
        id: "insp-1",
        name: "Wisconsin run",
        vps_id: "vps-1",
        db_path: "/home/devonly/pipeline_runs/wi/output/wi_full/pipeline.db",
      },
    } as unknown as ReturnType<typeof useSavedInspection>);
    vi.mocked(useCreateInspection).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useCreateInspection>);
    vi.mocked(useVpsDbMetrics).mockReturnValue({
      data: makeMetrics(),
      isFetching: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useVpsDbMetrics>);

    renderPage("/inspect/insp-1");

    expect(
      screen.getByRole("heading", { name: "Wisconsin run" }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("State machine")).toBeInTheDocument();
    });
    expect(vi.mocked(useVpsDbMetrics)).toHaveBeenCalledWith(
      "vps-1",
      "/home/devonly/pipeline_runs/wi/output/wi_full/pipeline.db",
      true,
    );
  });

  it("does not show a Save button while viewing an already-saved inspection", async () => {
    vi.mocked(useVps).mockReturnValue({
      data: [{ id: "vps-1", name: "state-dashboard-v2" }],
    } as ReturnType<typeof useVps>);
    vi.mocked(useInspections).mockReturnValue({
      data: [
        { id: "insp-1", name: "Wisconsin run", vps_id: "vps-1", db_path: "/x" },
      ],
    } as unknown as ReturnType<typeof useInspections>);
    vi.mocked(useSavedInspection).mockReturnValue({
      data: {
        id: "insp-1",
        name: "Wisconsin run",
        vps_id: "vps-1",
        db_path: "/x",
      },
    } as unknown as ReturnType<typeof useSavedInspection>);
    vi.mocked(useCreateInspection).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useCreateInspection>);
    vi.mocked(useVpsDbMetrics).mockReturnValue({
      data: makeMetrics(),
      isFetching: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useVpsDbMetrics>);

    renderPage("/inspect/insp-1");

    await waitFor(() => {
      expect(screen.getByText("State machine")).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: /save/i }),
    ).not.toBeInTheDocument();
  });
});
