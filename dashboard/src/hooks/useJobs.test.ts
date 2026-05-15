import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { useJobs } from "./useJobs";

vi.mock("../api/jobs", () => ({
  fetchJobs: vi.fn().mockResolvedValue({ jobs: [], total: 0 }),
  cancelJob: vi.fn(),
  createJob: vi.fn(),
}));

import { fetchJobs } from "../api/jobs";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client }, children);
}

describe("useJobs", () => {
  it("calls fetchJobs on mount", async () => {
    renderHook(() => useJobs(), { wrapper });
    await waitFor(() => expect(vi.mocked(fetchJobs)).toHaveBeenCalledOnce());
  });

  it("returns jobs data from the API", async () => {
    vi.mocked(fetchJobs).mockResolvedValue({
      jobs: [
        {
          id: "abc",
          status: "QUEUED",
          input_filename: "test.jsonl",
          config: {},
          kestra_execution_id: null,
          created_at: new Date().toISOString(),
          started_at: null,
          finished_at: null,
          error_message: null,
          output_file_key: null,
        },
      ],
      total: 1,
    });

    const { result } = renderHook(() => useJobs(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.total).toBe(1);
    expect(result.current.data?.jobs[0].id).toBe("abc");
  });

  it("exposes isLoading true before data arrives", () => {
    vi.mocked(fetchJobs).mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useJobs(), { wrapper });
    expect(result.current.isLoading).toBe(true);
  });
});
