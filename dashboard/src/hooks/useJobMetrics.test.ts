import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { useJobMetrics } from "./useJobMetrics";

vi.mock("../api/metrics", () => ({
  fetchJobMetrics: vi.fn(),
}));

import { fetchJobMetrics } from "../api/metrics";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client }, children);
}

describe("useJobMetrics", () => {
  it("calls fetchJobMetrics with the given jobId", async () => {
    vi.mocked(fetchJobMetrics).mockResolvedValue(
      {} as Awaited<ReturnType<typeof fetchJobMetrics>>,
    );
    renderHook(() => useJobMetrics("job-42"), { wrapper });
    await waitFor(() =>
      expect(vi.mocked(fetchJobMetrics)).toHaveBeenCalledWith("job-42"),
    );
  });

  it("returns metrics data on success", async () => {
    const payload = { run_id: "run-1", build_ms: 5 } as Awaited<
      ReturnType<typeof fetchJobMetrics>
    >;
    vi.mocked(fetchJobMetrics).mockResolvedValue(payload);

    const { result } = renderHook(() => useJobMetrics("job-42"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.run_id).toBe("run-1");
  });

  it("exposes the error when the job is not running", async () => {
    vi.mocked(fetchJobMetrics).mockRejectedValue(
      new Error("Job is not RUNNING"),
    );
    const { result } = renderHook(() => useJobMetrics("job-42"), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toMatch(/not RUNNING/);
  });
});
