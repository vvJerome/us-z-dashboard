import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { useVpsDbMetrics } from "./useVpsDbMetrics";
import type { MetricsResponse } from "../types/metrics";

vi.mock("../api/metrics", () => ({
  fetchVpsDbMetrics: vi.fn(),
}));

import { fetchVpsDbMetrics } from "../api/metrics";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client }, children);
}

function makeMetrics(): MetricsResponse {
  return {
    run_id: "run_wi_full",
    as_of: "2026-08-19T00:00:00",
    build_ms: 5,
    states: {},
    totals: { all: 0, terminal: 0, pending: 0 },
    rate: { last_15min: 0, per_hour: 0, eta_hours: null, complete: true },
    throughput_60min: [],
    backends: { smtp: { error_pct: 0, total: 0 } },
    heartbeats: { producer: null, dispatcher: null },
    discovery: {
      first_party: 0,
      third_party: 0,
      failed: 0,
      total_input: 0,
      hit_rate_pct: 0,
    },
    cost: { spent_usd: 0, ceiling_usd: null, pct: null },
    cost_breakdown: { services: [] },
    run_history: [],
    recent_validated: [],
    top_recent_errors: [],
    run_events: [],
  };
}

describe("useVpsDbMetrics", () => {
  it("does not fetch when disabled", () => {
    renderHook(() => useVpsDbMetrics("vps-1", "/data/pipeline.db", false), {
      wrapper,
    });
    expect(fetchVpsDbMetrics).not.toHaveBeenCalled();
  });

  it("does not fetch when vpsId or dbPath is empty, even if enabled", () => {
    renderHook(() => useVpsDbMetrics("", "/data/pipeline.db", true), {
      wrapper,
    });
    expect(fetchVpsDbMetrics).not.toHaveBeenCalled();
  });

  it("fetches metrics for the given vps and db path once enabled", async () => {
    vi.mocked(fetchVpsDbMetrics).mockResolvedValue(makeMetrics());

    const { result } = renderHook(
      () => useVpsDbMetrics("vps-1", "/data/pipeline.db", true),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchVpsDbMetrics).toHaveBeenCalledWith(
      "vps-1",
      "/data/pipeline.db",
    );
    expect(result.current.data?.run_id).toBe("run_wi_full");
  });
});
