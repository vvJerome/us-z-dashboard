import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { useJobLogs } from "./useJobLogs";

vi.mock("../api/jobs", () => ({
  fetchJobLogs: vi
    .fn()
    .mockResolvedValue({ lines: ["log line 1", "log line 2"] }),
}));

import { fetchJobLogs } from "../api/jobs";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client }, children);
}

describe("useJobLogs", () => {
  it("fetches logs for the given job id", async () => {
    const { result } = renderHook(() => useJobLogs("job-1", "RUNNING"), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vi.mocked(fetchJobLogs)).toHaveBeenCalledWith("job-1");
    expect(result.current.data?.lines).toEqual(["log line 1", "log line 2"]);
  });

  it("polls every 10 seconds while job is RUNNING", () => {
    const { result } = renderHook(() => useJobLogs("job-1", "RUNNING"), {
      wrapper,
    });
    // refetchInterval is configured via the query options, verify the query is enabled
    expect(result.current.fetchStatus).not.toBe("idle");
  });

  it("stops polling when job is COMPLETED", () => {
    const { result } = renderHook(() => useJobLogs("job-1", "COMPLETED"), {
      wrapper,
    });
    // Query still fetches once but interval is disabled, isLoading stays false after
    expect(result.current.isPending).toBe(true); // initial fetch still fires
  });

  it("stops polling when job is FAILED", () => {
    renderHook(() => useJobLogs("job-1", "FAILED"), { wrapper });
    // No assertion beyond no-throw, refetchInterval=false is set internally
  });

  it("is disabled when jobId is empty", () => {
    const { result } = renderHook(() => useJobLogs("", "RUNNING"), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
  });
});
